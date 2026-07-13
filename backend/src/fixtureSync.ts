import type { Db } from "./db.js";
import type { Fixture } from "./txline/stub.js";

export interface FixtureRow {
  fixture_id: number;
  home: string;
  away: string;
  kickoff_ts: number;
  registered: number;
}

/**
 * Upsert fixtures (from TxLINE or the stub seed) into the DB — the single
 * source the API, reveal worker, and on-chain registration all read from.
 * A changed kickoff time updates the row but NOT the on-chain Fixture
 * (init-only); on-chain rescheduling is out of scope for now.
 */
export function upsertFixtures(db: Db, fixtures: Fixture[], nowTs: number): void {
  const stmt = db.prepare(
    `INSERT INTO fixtures (fixture_id, home, away, kickoff_ts, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (fixture_id) DO UPDATE SET
       home = excluded.home, away = excluded.away,
       kickoff_ts = excluded.kickoff_ts, updated_at = excluded.updated_at`,
  );
  const run = db.transaction((rows: Fixture[]) => {
    for (const f of rows) stmt.run(f.fixtureId, f.home, f.away, f.kickoffTs, nowTs);
  });
  run(fixtures);
}

export function listFixtures(db: Db): Fixture[] {
  const rows = db
    .prepare("SELECT fixture_id, home, away, kickoff_ts FROM fixtures ORDER BY kickoff_ts")
    .all() as FixtureRow[];
  return rows.map((r) => ({
    fixtureId: r.fixture_id,
    home: r.home,
    away: r.away,
    kickoffTs: r.kickoff_ts,
  }));
}

export function kickoffOf(db: Db, fixtureId: number): number | undefined {
  const row = db.prepare("SELECT kickoff_ts FROM fixtures WHERE fixture_id = ?").get(fixtureId) as
    | { kickoff_ts: number }
    | undefined;
  return row?.kickoff_ts;
}

/**
 * Register DB fixtures that aren't on-chain yet. `register` submits one
 * register_fixture tx; an "already in use" failure counts as registered
 * (another instance won the race or a previous run half-completed).
 */
export async function registerPendingFixtures(
  db: Db,
  register: (fixtureId: bigint, kickoffTs: bigint) => Promise<void>,
): Promise<number> {
  const pending = db
    .prepare("SELECT fixture_id, kickoff_ts FROM fixtures WHERE registered = 0")
    .all() as { fixture_id: number; kickoff_ts: number }[];
  const mark = db.prepare("UPDATE fixtures SET registered = 1 WHERE fixture_id = ?");
  let done = 0;
  for (const f of pending) {
    try {
      await register(BigInt(f.fixture_id), BigInt(f.kickoff_ts));
      mark.run(f.fixture_id);
      done += 1;
    } catch (err) {
      if (String(err).includes("already in use")) {
        mark.run(f.fixture_id);
        continue;
      }
      console.error(`register_fixture ${f.fixture_id} failed:`, err);
    }
  }
  return done;
}
