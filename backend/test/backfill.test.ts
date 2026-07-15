import { describe, expect, it, vi } from "vitest";
import { openDb } from "../src/db.js";
import { ResultsStore } from "../src/results.js";
import { upsertFixtures } from "../src/fixtureSync.js";
import { backfillResults } from "../src/txline/backfill.js";
import type { ScoreEvent } from "../src/txline/stub.js";

const NOW = 1_800_000_000;
const WEEK = 7 * 24 * 3600;

function setup(fixtures: { fixtureId: number; kickoffTs: number }[]) {
  const db = openDb(":memory:");
  upsertFixtures(
    db,
    fixtures.map((f) => ({ ...f, home: "A", away: "B" })),
    NOW,
  );
  return { db, results: new ResultsStore(() => NOW, db) };
}

describe("backfillResults", () => {
  it("fetches and applies results for past-kickoff fixtures without a final result", async () => {
    const { db, results } = setup([
      { fixtureId: 1, kickoffTs: NOW - 7200 }, // ended, missing → fetched
      { fixtureId: 2, kickoffTs: NOW + 3600 }, // future → skipped
      { fixtureId: 3, kickoffTs: NOW - 3600 }, // already final → skipped
      { fixtureId: 4, kickoffTs: NOW - WEEK - 1 }, // beyond lookback → skipped
      { fixtureId: 5, kickoffTs: NOW - 1800 }, // provisional → re-fetched
    ]);
    results.apply({ fixtureId: 3, homeGoals: 1, awayGoals: 0, final: true });
    results.apply({ fixtureId: 5, homeGoals: 0, awayGoals: 0, final: false });

    const fetched: number[] = [];
    const fetchScoreSnapshot = async (id: number): Promise<ScoreEvent | null> => {
      fetched.push(id);
      return { fixtureId: id, homeGoals: 3, awayGoals: 2, final: true };
    };

    const applied = await backfillResults(
      { db, client: { fetchScoreSnapshot }, results },
      NOW,
    );
    expect(fetched.sort()).toEqual([1, 5]);
    expect(applied).toBe(2);
    expect(results.get(1)).toMatchObject({ home: 3, away: 2, final: true });
    expect(results.get(5)).toMatchObject({ home: 3, away: 2, final: true });
    expect(results.get(3)).toMatchObject({ home: 1, away: 0 });
  });

  it("skips null snapshots and keeps going past per-fixture failures", async () => {
    const { db, results } = setup([
      { fixtureId: 1, kickoffTs: NOW - 3600 },
      { fixtureId: 2, kickoffTs: NOW - 3600 },
      { fixtureId: 3, kickoffTs: NOW - 3600 },
    ]);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchScoreSnapshot = async (id: number): Promise<ScoreEvent | null> => {
      if (id === 1) throw new Error("boom");
      if (id === 2) return null;
      return { fixtureId: id, homeGoals: 1, awayGoals: 1, final: true };
    };

    const applied = await backfillResults(
      { db, client: { fetchScoreSnapshot }, results },
      NOW,
    );
    expect(applied).toBe(1);
    expect(results.get(1)).toBeUndefined();
    expect(results.get(2)).toBeUndefined();
    expect(results.get(3)).toMatchObject({ home: 1, away: 1, final: true });
    expect(errorSpy).toHaveBeenCalledOnce();
    errorSpy.mockRestore();
  });
});
