import { describe, it, expect } from "vitest";
import { openDb } from "../src/db.js";
import { ResultsStore } from "../src/results.js";
import { loadFixtures, scoreEvents, type ScoreEvent } from "../src/txline/stub.js";

async function* feed(events: ScoreEvent[]): AsyncGenerator<ScoreEvent> {
  for (const e of events) yield e;
}

describe("ResultsStore", () => {
  it("tracks provisional then final results from a stub-shaped feed", async () => {
    let t = 100;
    const store = new ResultsStore(() => t++);

    await store.consume(feed([{ fixtureId: 1, homeGoals: 1, awayGoals: 0, final: false }]));
    expect(store.get(1)).toMatchObject({ home: 1, away: 0, final: false });
    expect(store.hasProvisional()).toBe(true);

    await store.consume(
      feed([
        { fixtureId: 1, homeGoals: 2, awayGoals: 1, final: true },
        { fixtureId: 2, homeGoals: 0, awayGoals: 0, final: true },
      ]),
    );
    expect(store.get(1)).toMatchObject({ home: 2, away: 1, final: true });
    expect(store.hasProvisional()).toBe(false);
    expect(store.scorelines()).toEqual(
      new Map([
        [1, { home: 2, away: 1 }],
        [2, { home: 0, away: 0 }],
      ]),
    );
    expect(store.updatedAt()).toBe(102);
  });

  it("consuming the real stub feed goes provisional per fixture, then all final", async () => {
    const store = new ResultsStore(() => 1);
    for await (const event of scoreEvents()) {
      store.apply(event);
      const r = store.get(event.fixtureId)!;
      expect(r.final).toBe(event.final); // provisional on score event, final on match-end
    }
    expect(store.hasProvisional()).toBe(false);
    for (const f of loadFixtures()) {
      expect(store.get(f.fixtureId)).toMatchObject({ home: 2, away: 1, final: true });
    }
  });

  it("merges status-only events onto the last known scoreline", () => {
    const store = new ResultsStore(() => 1);
    // Non-final status with no prior score carries no information — skipped.
    store.apply({ fixtureId: 1, final: false });
    expect(store.get(1)).toBeUndefined();

    store.apply({ fixtureId: 1, homeGoals: 2, awayGoals: 1, final: false });
    store.apply({ fixtureId: 1, final: true }); // full-time action has no Score
    expect(store.get(1)).toMatchObject({ home: 2, away: 1, final: true });

    // A final with no score ever seen is a genuine 0-0.
    store.apply({ fixtureId: 2, final: true });
    expect(store.get(2)).toMatchObject({ home: 0, away: 0, final: true });
  });

  it("skips no-op reapplies without bumping updatedAt", () => {
    let t = 10;
    const store = new ResultsStore(() => t++);
    store.apply({ fixtureId: 1, homeGoals: 1, awayGoals: 0, final: false });
    store.apply({ fixtureId: 1, homeGoals: 1, awayGoals: 0, final: false });
    expect(store.updatedAt()).toBe(10);
  });

  it("never downgrades a final result with a replayed provisional event", () => {
    const store = new ResultsStore(() => 1);
    store.apply({ fixtureId: 1, homeGoals: 2, awayGoals: 1, final: true });
    store.apply({ fixtureId: 1, homeGoals: 1, awayGoals: 0, final: false });
    expect(store.get(1)).toMatchObject({ home: 2, away: 1, final: true });
  });

  it("db-backed: results survive a restart (new store over the same db)", () => {
    const db = openDb(":memory:");
    const store = new ResultsStore(() => 42, db);
    store.apply({ fixtureId: 1, homeGoals: 2, awayGoals: 1, final: true });
    store.apply({ fixtureId: 2, homeGoals: 1, awayGoals: 1, final: false });

    const reloaded = new ResultsStore(() => 99, db);
    expect(reloaded.get(1)).toEqual({ fixtureId: 1, home: 2, away: 1, final: true, updatedAt: 42 });
    expect(reloaded.get(2)).toMatchObject({ home: 1, away: 1, final: false });
    expect(reloaded.hasProvisional()).toBe(true);
    expect(reloaded.updatedAt()).toBe(42);

    // final-wins still holds across the reload, and updates write through.
    reloaded.apply({ fixtureId: 1, homeGoals: 0, awayGoals: 0, final: false });
    expect(reloaded.get(1)).toMatchObject({ home: 2, away: 1 });
    reloaded.apply({ fixtureId: 2, homeGoals: 2, awayGoals: 1, final: true });
    const again = new ResultsStore(undefined, db);
    expect(again.get(2)).toMatchObject({ home: 2, away: 1, final: true });
    expect(again.hasProvisional()).toBe(false);
  });
});
