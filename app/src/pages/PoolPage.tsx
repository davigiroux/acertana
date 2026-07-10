import { useCallback, useEffect, useMemo, useState } from 'react';
import { bytesToHex } from '@noble/hashes/utils.js';
import { postPick } from '../lib/api';
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
  const { authenticated, ready, address, wallet, login } = useInvisibleWallet();
  const chain = useMemo(() => chainClient ?? createChainClient(), [chainClient]);
  const [fixtures, setFixtures] = useState<Fixture[] | null>(fixturesProp ?? null);
  const [entries, setEntries] = useState<Record<number, EntryState | null>>({});
  const [notice, setNotice] = useState<string | null>(null);

  // Retry payload uploads that failed after their on-chain commit landed.
  useEffect(() => {
    retryPendingPicks().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (fixturesProp) return;
    let cancelled = false;
    getFixtures().then((f) => !cancelled && setFixtures(f));
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
        await postPick(payload);
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
    [wallet, address, poolPubkey, chain],
  );

  if (!authenticated) {
    return (
      <section>
        <h2>Pool</h2>
        <button onClick={login}>Log in with email</button>
      </section>
    );
  }
  if (!ready || !address) return <p>Preparing wallet…</p>;
  if (!fixtures) return <p>Loading fixtures…</p>;

  return (
    <section>
      <h2>Pool {poolPubkey}</h2>
      {notice && <p role="status">{notice}</p>}
      <ul>
        {fixtures.map((f) => (
          <FixtureRow
            key={f.fixtureId}
            fixture={f}
            entry={entries[f.fixtureId] ?? null}
            nowTs={nowTs}
            onCommit={commit}
          />
        ))}
      </ul>
    </section>
  );
}
