import { describe, it, expect } from "vitest";
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

  it("never downgrades a final result with a replayed provisional event", () => {
    const store = new ResultsStore(() => 1);
    store.apply({ fixtureId: 1, homeGoals: 2, awayGoals: 1, final: true });
    store.apply({ fixtureId: 1, homeGoals: 1, awayGoals: 0, final: false });
    expect(store.get(1)).toMatchObject({ home: 2, away: 1, final: true });
  });
});
