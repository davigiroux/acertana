import type { Db } from "./db.js";
import type { ScoreEvent } from "./txline/stub.js";
import type { Scoreline } from "./scoring.js";

export interface FixtureResult extends Scoreline {
  fixtureId: number;
  final: boolean;
  updatedAt: number; // unix seconds
}

/**
 * Results store fed by the TxLINE score stream (design §4): provisional on
 * score events, finalized on match-end events. A final result is never
 * downgraded by a late/replayed provisional event.
 *
 * When constructed with a Db, results write through to the `results` table
 * and reload from it — the score stream is live-only, so without persistence
 * every restart/deploy silently dropped all known results.
 */
export class ResultsStore {
  private readonly results = new Map<number, FixtureResult>();

  constructor(
    private readonly now: () => number = () => Math.floor(Date.now() / 1000),
    private readonly db?: Db,
  ) {
    if (db) {
      const rows = db
        .prepare("SELECT fixture_id, home, away, final, updated_at FROM results")
        .all() as { fixture_id: number; home: number; away: number; final: number; updated_at: number }[];
      for (const r of rows) {
        this.results.set(r.fixture_id, {
          fixtureId: r.fixture_id,
          home: r.home,
          away: r.away,
          final: r.final !== 0,
          updatedAt: r.updated_at,
        });
      }
    }
  }

  apply(event: ScoreEvent): void {
    const existing = this.results.get(event.fixtureId);
    if (existing?.final && !event.final) return;
    const result: FixtureResult = {
      fixtureId: event.fixtureId,
      home: event.homeGoals,
      away: event.awayGoals,
      final: event.final,
      updatedAt: this.now(),
    };
    this.results.set(event.fixtureId, result);
    this.db
      ?.prepare(
        `INSERT INTO results (fixture_id, home, away, final, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (fixture_id) DO UPDATE SET
           home = excluded.home, away = excluded.away,
           final = excluded.final, updated_at = excluded.updated_at`,
      )
      .run(result.fixtureId, result.home, result.away, result.final ? 1 : 0, result.updatedAt);
  }

  /** Drain an SSE-shaped feed (e.g. txline/stub scoreEvents) into the store. */
  async consume(events: AsyncIterable<ScoreEvent>): Promise<void> {
    for await (const event of events) this.apply(event);
  }

  get(fixtureId: number): FixtureResult | undefined {
    return this.results.get(fixtureId);
  }

  /** Scorelines keyed by fixtureId, for computeStandings. */
  scorelines(): Map<number, Scoreline> {
    return new Map(
      [...this.results.values()].map((r) => [r.fixtureId, { home: r.home, away: r.away }]),
    );
  }

  /** True while any known result is still provisional (not match-end). */
  hasProvisional(): boolean {
    return [...this.results.values()].some((r) => !r.final);
  }

  updatedAt(): number {
    return Math.max(0, ...[...this.results.values()].map((r) => r.updatedAt));
  }
}
