import { useCallback, useEffect, useMemo, useState } from 'react';
import { bytesToHex } from '@noble/hashes/utils.js';
import { postFaucet, postPick } from '../lib/api';
import { enqueuePendingPick, retryPendingPicks } from '../lib/pendingPicks';
import { getFixtures, type Fixture } from '../lib/fixtures';
import { computeCommitment, deriveSalt } from '../lib/commitment';
import {
  createChainClient,
  type ChainClient,
  type EntryState,
} from '../lib/chain/ChainClient';
import { useInvisibleWallet } from '../lib/wallet/useInvisibleWallet';
import { FixtureRow } from './FixtureRow';

function dateGroups(fixtures: Fixture[]): { label: string; items: Fixture[] }[] {
  const groups: { key: string; label: string; items: Fixture[] }[] = [];
  for (const f of fixtures) {
    const d = new Date(f.kickoffTs * 1000);
    const key = d.toLocaleDateString('pt-BR');
    const wd = d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '').toUpperCase();
    const mo = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase();
    let g = groups.find((g) => g.key === key);
    if (!g) {
      g = { key, label: `${wd} · ${d.getDate()} ${mo}`, items: [] };
      groups.push(g);
    }
    g.items.push(f);
  }
  return groups;
}

function shortPubkey(pk: string): string {
  return pk.length > 12 ? `${pk.slice(0, 4)}…${pk.slice(-4)}` : pk;
}

/**
 * /p/:poolPubkey — fixture list with commit-pick flow.
 * `chainClient`, `fixtures`, and `nowTs` are injectable for tests.
 */
export function PoolPage({
  poolPubkey,
  chainClient,
  fixtures: fixturesProp,
  nowTs = Math.floor(Date.now() / 1000),
}: {
  poolPubkey: string;
  chainClient?: ChainClient;
  fixtures?: Fixture[];
  nowTs?: number;
}) {
  const { authenticated, ready, address, wallet, login, getAccessToken } = useInvisibleWallet();
  const chain = useMemo(() => chainClient ?? createChainClient(), [chainClient]);
  const [fixtures, setFixtures] = useState<Fixture[] | null>(fixturesProp ?? null);
  const [fixturesError, setFixturesError] = useState<string | null>(null);
  const [entries, setEntries] = useState<Record<number, EntryState | null>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<'jogos' | 'ranking'>('jogos');

  // Retry payload uploads that failed after their on-chain commit landed.
  useEffect(() => {
    retryPendingPicks(async (p) => postPick(p, (await getAccessToken()) ?? undefined)).catch(
      () => undefined,
    );
  }, [getAccessToken]);

  useEffect(() => {
    if (fixturesProp) return;
    let cancelled = false;
    getFixtures()
      .then((f) => !cancelled && setFixtures(f))
      .catch((e) => !cancelled && setFixturesError(String((e as Error).message ?? e)));
    return () => {
      cancelled = true;
    };
  }, [fixturesProp]);

  // Read Entry PDAs so revealed/committed states survive reloads.
  useEffect(() => {
    if (!fixtures || !address) return;
    let cancelled = false;
    Promise.all(
      fixtures.map(async (f) => {
        const entry = await chain
          .getEntry(poolPubkey, address, BigInt(f.fixtureId))
          .catch(() => null);
        return [f.fixtureId, entry] as const;
      }),
    ).then((pairs) => {
      if (cancelled) return;
      // Merge: never clobber a just-committed local marker with a null fetch.
      setEntries((prev) => {
        const next = { ...prev };
        for (const [id, entry] of pairs) {
          if (entry || !(id in next)) next[id] = entry;
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [fixtures, address, poolPubkey, chain]);

  const commit = useCallback(
    async (fixtureId: number, homeGoals: number, awayGoals: number) => {
      if (!wallet || !address) throw new Error('wallet not ready');
      const salt = await deriveSalt(
        (msg) => wallet.signMessage(msg),
        poolPubkey,
        BigInt(fixtureId),
      );
      const commitment = computeCommitment(homeGoals, awayGoals, salt);
      // Fresh (link-joined) wallets start empty; ensure fee dust before the tx.
      const token = (await getAccessToken()) ?? undefined;
      await postFaucet(address, token).catch(() => undefined);
      await chain.commitPick({
        pool: poolPubkey,
        participant: address,
        fixtureId: BigInt(fixtureId),
        commitment,
        signTransaction: (tx) => wallet.signTransaction(tx),
      });
      const payload = {
        poolPubkey,
        wallet: address,
        fixtureId,
        homeGoals,
        awayGoals,
        saltHex: bytesToHex(salt),
      };
      try {
        await postPick(payload, token);
      } catch {
        // On-chain commit landed; keep the payload locally and retry later
        // (backend needs it for auto-reveal).
        enqueuePendingPick(payload);
        setNotice('Pick saved locally, will retry upload');
      }
      setEntries((prev) => ({
        ...prev,
        [fixtureId]: { revealed: false, homeGoals: 0, awayGoals: 0 },
      }));
    },
    [wallet, address, poolPubkey, chain, getAccessToken],
  );

  if (!authenticated) {
    return (
      <div className="ac-center-screen">
        <div className="ac-icon-tile" style={{ background: 'var(--blue-soft)', fontSize: 28 }}>🔒</div>
        <div className="ac-screen-title" style={{ fontSize: 24 }}>Entre para ver o bolão</div>
        <p className="ac-screen-body">
          Faça login com seu e-mail para ver os jogos, palpitar e acompanhar o ranking.
        </p>
        <button
          className="ac-primary-btn"
          style={{ width: 'auto', height: 48, padding: '0 24px', fontSize: 15 }}
          onClick={login}
        >
          Entrar com e-mail
        </button>
      </div>
    );
  }
  if (fixturesError) {
    return (
      <div className="ac-center-screen">
        <div className="ac-icon-tile" style={{ background: '#FBF0DE' }}>⚠️</div>
        <div className="ac-screen-title" style={{ fontSize: 24 }}>Não foi possível carregar os jogos</div>
        <p className="ac-screen-body" role="alert">{fixturesError}</p>
      </div>
    );
  }
  if (!ready || !address || !fixtures) {
    return (
      <div className="ac-center-screen">
        <div className="ac-spinner" style={{ width: 26, height: 26, marginBottom: 18 }} />
        <div style={{ fontSize: 15, fontWeight: 600, color: '#6B7080' }}>
          {!ready || !address ? 'Preparando carteira…' : 'Carregando jogos…'}
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div className="ac-pool-header">
        <div className="ac-pool-name">Bolão {shortPubkey(poolPubkey)}</div>
      </div>

      <div className="ac-tabs">
        <button className={`ac-tab${tab === 'jogos' ? ' active' : ''}`} onClick={() => setTab('jogos')}>
          Jogos
        </button>
        <button className={`ac-tab${tab === 'ranking' ? ' active' : ''}`} onClick={() => setTab('ranking')}>
          Ranking
        </button>
      </div>

      {tab === 'jogos' && (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {dateGroups(fixtures).map((g) => (
            <div key={g.label}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 11 }}>
                <span className="ac-date-label">{g.label}</span>
                <span style={{ height: 1, flex: 1, background: 'var(--line)' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {g.items.map((f) => (
                  <FixtureRow
                    key={f.fixtureId}
                    fixture={f}
                    entry={entries[f.fixtureId] ?? null}
                    nowTs={nowTs}
                    onCommit={commit}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'ranking' && (
        <div style={{ padding: 16 }}>
          {/* TODO(docs/DECISIONS.md#leaderboard-computation): live standings from the score stream. */}
          <div
            className="ac-card"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '40px 24px' }}
          >
            <div style={{ fontSize: 34, opacity: 0.35, marginBottom: 12 }}>🏆</div>
            <div className="ac-condensed" style={{ fontWeight: 800, fontSize: 20, color: 'var(--ink)' }}>
              Ninguém pontuou ainda
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.4, color: 'var(--muted)', margin: '6px 0 0', maxWidth: 250 }}>
              O ranking aparece assim que o primeiro jogo terminar. Faça seus palpites!
            </p>
          </div>
          <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--faint)', marginTop: 12 }}>
            5 pts placar exato · 3 pts saldo de gols · 1 pt vencedor
          </div>
        </div>
      )}

      {notice && (
        <div className="ac-toast" role="status">
          {notice}
        </div>
      )}
    </div>
  );
}
