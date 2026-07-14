import { useState } from 'react';
import type { Fixture } from '../lib/fixtures';
import type { EntryState } from '../lib/chain/ChainClient';
import type { PoolPick } from '../lib/api';
import { describeCommitError } from '../lib/commitError';
import { scorePick } from '../lib/scoring';
import { teamName, teamFlag } from '../lib/teams';

export type FixtureStatus = 'open' | 'committed' | 'locked' | 'revealed';

export function fixtureStatus(
  fixture: Fixture,
  entry: EntryState | null,
  nowTs: number,
): FixtureStatus {
  if (entry?.revealed) return 'revealed';
  if (nowTs >= fixture.kickoffTs) return 'locked';
  return entry ? 'committed' : 'open';
}

export function kickoffTime(kickoffTs: number): string {
  return new Date(kickoffTs * 1000).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function TeamRow({
  flag,
  name,
  children,
  dim,
}: {
  flag?: string;
  name: string;
  children: React.ReactNode;
  dim?: boolean;
}) {
  return (
    <div className="ac-fx-row">
      <span className="ac-fx-flag" style={dim ? { filter: 'grayscale(.4)', opacity: 0.85 } : undefined}>
        {flag ?? '⚽'}
      </span>
      <span className="ac-fx-team" style={dim ? { color: '#7A7460' } : undefined}>
        {name}
      </span>
      {children}
    </div>
  );
}

function shortPk(pk: string): string {
  return pk.length > 12 ? `${pk.slice(0, 4)}…${pk.slice(-4)}` : pk;
}

/** Collapsible list of everyone's revealed picks for a fixture (post-kickoff). */
function PoolPicksList({ picks, selfWallet }: { picks: PoolPick[]; selfWallet?: string }) {
  const [open, setOpen] = useState(false);
  if (picks.length === 0) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          padding: '4px 0',
          fontSize: 13,
          fontWeight: 700,
          color: 'var(--muted)',
          textAlign: 'left',
          cursor: 'pointer',
        }}
      >
        {open ? '▾' : '▸'} Palpites do bolão ({picks.length})
      </button>
      {open && (
        <div style={{ borderTop: '1px solid var(--line)', marginTop: 4 }}>
          {picks.map((p) => (
            <div
              key={p.wallet}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--line)' }}
            >
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                {p.email ?? shortPk(p.wallet)}
                {p.wallet === selfWallet && ' (você)'}
              </span>
              <span className="ac-condensed" style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>
                {p.home} – {p.away}
              </span>
              {p.points !== null && (
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    minWidth: 38,
                    textAlign: 'right',
                    color: p.points > 0 ? '#1B8A3E' : 'var(--faint)',
                  }}
                >
                  {p.points > 0 ? `+${p.points}` : '0'} pts
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function FixtureRow({
  fixture,
  entry,
  nowTs,
  onCommit,
  poolPicks,
  selfWallet,
}: {
  fixture: Fixture;
  entry: EntryState | null;
  nowTs: number;
  onCommit: (fixtureId: number, homeGoals: number, awayGoals: number) => Promise<void>;
  /** Everyone's revealed picks for this fixture (shown once the match has started). */
  poolPicks?: PoolPick[];
  selfWallet?: string;
}) {
  const [home, setHome] = useState(0);
  const [away, setAway] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = fixtureStatus(fixture, entry, nowTs);
  const homeName = teamName(fixture.home);
  const awayName = teamName(fixture.away);
  const homeFlag = fixture.homeFlag ?? teamFlag(fixture.home);
  const awayFlag = fixture.awayFlag ?? teamFlag(fixture.away);
  const label = `${homeName} vs ${awayName}`;
  const time = kickoffTime(fixture.kickoffTs);
  const step = (v: number, d: number) => Math.max(0, Math.min(9, v + d));

  const commit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onCommit(fixture.fixtureId, home, away);
    } catch (e) {
      setError(describeCommitError(e));
    } finally {
      setBusy(false);
    }
  };

  if (status === 'locked') {
    const result = fixture.result ?? null;
    return (
      <div
        aria-label={label}
        style={{
          background: 'var(--amber-bg)',
          border: '1px solid var(--amber-border)',
          borderRadius: 16,
          padding: '13px 15px 14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span className="ac-fx-time" style={{ color: '#A99C7E' }}>⏱ {time}</span>
          <span className="ac-badge-late">{entry ? 'Aguardando revelação' : 'Prazo encerrado'}</span>
        </div>
        <TeamRow flag={homeFlag} name={homeName} dim>
          <span className="ac-step-val" style={{ minWidth: 36, fontSize: 22, color: result ? '#7A7460' : '#C3B893' }}>
            {result ? result.home : '—'}
          </span>
        </TeamRow>
        <div className="ac-fx-divider" style={{ background: '#EFE6D0' }} />
        <TeamRow flag={awayFlag} name={awayName} dim>
          <span className="ac-step-val" style={{ minWidth: 36, fontSize: 22, color: result ? '#7A7460' : '#C3B893' }}>
            {result ? result.away : '—'}
          </span>
        </TeamRow>
        <div className="ac-fx-footnote" style={{ color: '#A9925A', fontWeight: 600, fontSize: 12 }}>
          {entry
            ? 'Palpite travado · será revelado e pontuado em instantes'
            : 'Você não palpitou a tempo'}
        </div>
        {poolPicks && <PoolPicksList picks={poolPicks} selfWallet={selfWallet} />}
      </div>
    );
  }

  if (status === 'revealed' && entry) {
    const result = fixture.result ?? null;
    const points = result
      ? scorePick({ home: entry.homeGoals, away: entry.awayGoals }, result)
      : null;
    return (
      <div aria-label={label} className="ac-card" style={{ padding: '13px 15px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
          <span
            className="ac-condensed"
            style={{ fontWeight: 700, fontSize: 11, letterSpacing: '.8px', color: 'var(--faint)', textTransform: 'uppercase' }}
          >
            {result ? (result.final ? 'Encerrado' : 'Em andamento') : 'Aguardando resultado'}
          </span>
          <span className="ac-badge-saved">Seu palpite: {entry.homeGoals} – {entry.awayGoals}</span>
        </div>
        <TeamRow flag={homeFlag} name={homeName}>
          <span className="ac-score-box">{result ? result.home : '–'}</span>
        </TeamRow>
        <div className="ac-fx-divider" />
        <TeamRow flag={awayFlag} name={awayName}>
          <span className="ac-score-box">{result ? result.away : '–'}</span>
        </TeamRow>
        {points !== null && (
          <div
            className="ac-fx-footnote"
            style={{ fontWeight: 700, color: points > 0 ? '#1B8A3E' : 'var(--faint)' }}
          >
            {points > 0
              ? `✓ Você ganhou ${points} ${points === 1 ? 'ponto' : 'pontos'}${result && !result.final ? ' (parcial)' : ''}`
              : `✗ Palpite errado · 0 pontos${result && !result.final ? ' (parcial)' : ''}`}
          </div>
        )}
        {points === null && (
          <div className="ac-fx-footnote">Resultado sai assim que o jogo começar a pontuar</div>
        )}
        {poolPicks && <PoolPicksList picks={poolPicks} selfWallet={selfWallet} />}
      </div>
    );
  }

  if (status === 'committed') {
    return (
      <div aria-label={label} className="ac-card" style={{ padding: '13px 15px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span className="ac-fx-time">⏱ {time}</span>
          <span className="ac-badge-saved">🔒 Palpite salvo</span>
        </div>
        <TeamRow flag={homeFlag} name={homeName}>
          {/* Pick is committed on-chain as a hash; the score stays hidden until reveal. */}
          <span className="ac-score-box">•</span>
        </TeamRow>
        <div className="ac-fx-divider" />
        <TeamRow flag={awayFlag} name={awayName}>
          <span className="ac-score-box">•</span>
        </TeamRow>
        <div className="ac-fx-footnote">Palpite travado · resolve às {time}</div>
      </div>
    );
  }

  return (
    <div aria-label={label} className="ac-card" style={{ padding: '13px 15px 15px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span className="ac-fx-time">⏱ {time}</span>
        <span className="ac-badge-open">Aberto</span>
      </div>
      <TeamRow flag={homeFlag} name={homeName}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <button
            className="ac-step-btn"
            aria-label={`${label} home goals minus`}
            disabled={busy}
            onClick={() => setHome((v) => step(v, -1))}
          >
            −
          </button>
          <span className="ac-step-val" aria-label={`${label} home goals`}>{home}</span>
          <button
            className="ac-step-btn"
            aria-label={`${label} home goals plus`}
            disabled={busy}
            onClick={() => setHome((v) => step(v, 1))}
          >
            +
          </button>
        </div>
      </TeamRow>
      <div className="ac-fx-divider" />
      <TeamRow flag={awayFlag} name={awayName}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <button
            className="ac-step-btn"
            aria-label={`${label} away goals minus`}
            disabled={busy}
            onClick={() => setAway((v) => step(v, -1))}
          >
            −
          </button>
          <span className="ac-step-val" aria-label={`${label} away goals`}>{away}</span>
          <button
            className="ac-step-btn"
            aria-label={`${label} away goals plus`}
            disabled={busy}
            onClick={() => setAway((v) => step(v, 1))}
          >
            +
          </button>
        </div>
      </TeamRow>
      {error && (
        <div className="ac-fx-error" role="alert">
          ⚠ {error}
        </div>
      )}
      <button className="ac-commit-btn" onClick={commit} disabled={busy}>
        {busy && <span className="ac-btn-spinner" />}
        {busy ? 'Salvando…' : error ? 'Tentar de novo' : 'Salvar palpite'}
      </button>
      <div className="ac-fx-footnote">🔒 Trava no apito · {time}</div>
    </div>
  );
}
