import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Stub TxLINE feed. Reads fixtures.seed.json and fakes score events.
 * TODO: replace with real TxLINE REST fixtures endpoint.
 * TODO: replace fake iterator with the TxLINE SSE score stream (resume via last-event-id).
 */
export interface Fixture {
  fixtureId: number;
  home: string;
  away: string;
  kickoffTs: number;
}

export interface ScoreEvent {
  fixtureId: number;
  /** Absent on status-only feed actions (the feed omits Score when the action doesn't change it). */
  homeGoals?: number;
  awayGoals?: number;
  final: boolean;
}

const SEED_PATH = fileURLToPath(new URL("../../fixtures.seed.json", import.meta.url));

export function loadFixtures(path = SEED_PATH): Fixture[] {
  return (JSON.parse(readFileSync(path, "utf8")) as { fixtures: Fixture[] }).fixtures;
}

/** Fake score stream: one goal update then a final score per fixture. */
export async function* scoreEvents(path = SEED_PATH): AsyncGenerator<ScoreEvent> {
  for (const f of loadFixtures(path)) {
    yield { fixtureId: f.fixtureId, homeGoals: 1, awayGoals: 0, final: false };
    yield { fixtureId: f.fixtureId, homeGoals: 2, awayGoals: 1, final: true };
  }
}
