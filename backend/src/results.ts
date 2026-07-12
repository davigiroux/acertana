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
 */
export class ResultsStore {
  private readonly results = new Map<number, FixtureResult>();

  constructor(private readonly now: () => number = () => Math.floor(Date.now() / 1000)) {}

  apply(event: ScoreEvent): void {
    const existing = this.results.get(event.fixtureId);
    if (existing?.final && !event.final) return;
    this.results.set(event.fixtureId, {
      fixtureId: event.fixtureId,
      home: event.homeGoals,
      away: event.awayGoals,
      final: event.final,
      updatedAt: this.now(),
    });
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
