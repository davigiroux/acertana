import { useState } from 'react';
import type { Fixture } from '../lib/fixtures';
import type { EntryState } from '../lib/chain/ChainClient';

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

function clampGoals(v: string): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 9 ? n : 0;
}

export function FixtureRow({
  fixture,
  entry,
  nowTs,
  onCommit,
}: {
  fixture: Fixture;
  entry: EntryState | null;
  nowTs: number;
  onCommit: (fixtureId: number, homeGoals: number, awayGoals: number) => Promise<void>;
}) {
  const [home, setHome] = useState(0);
  const [away, setAway] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = fixtureStatus(fixture, entry, nowTs);
  const label = `${fixture.home} vs ${fixture.away}`;

  const commit = async () => {
    setBusy(true);
    setError(null);
    try {
      await onCommit(fixture.fixtureId, home, away);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li aria-label={label}>
      <span>{label}</span>{' '}
      {status === 'revealed' && entry ? (
        <span>
          Revealed: {entry.homeGoals} – {entry.awayGoals}
        </span>
      ) : status === 'locked' ? (
        <span>locked</span>
      ) : status === 'committed' ? (
        // Entry is init-only on-chain: no re-commit possible.
        <span>committed</span>
      ) : (
        <>
          <input
            type="number"
            min={0}
            max={9}
            aria-label={`${label} home goals`}
            value={home}
            onChange={(e) => setHome(clampGoals(e.target.value))}
          />
          <input
            type="number"
            min={0}
            max={9}
            aria-label={`${label} away goals`}
            value={away}
            onChange={(e) => setAway(clampGoals(e.target.value))}
          />
          <button onClick={commit} disabled={busy}>
            Commit
          </button>
        </>
      )}
      {error && <span role="alert">{error}</span>}
    </li>
  );
}
