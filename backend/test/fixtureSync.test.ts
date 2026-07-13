import { describe, expect, it } from "vitest";
import { openDb } from "../src/db.js";
import { kickoffOf, listFixtures, registerPendingFixtures, upsertFixtures } from "../src/fixtureSync.js";

const F1 = { fixtureId: 101, home: "Brazil", away: "Senegal", kickoffTs: 1000 };
const F2 = { fixtureId: 102, home: "USA", away: "Japan", kickoffTs: 2000 };

describe("fixtureSync", () => {
  it("upserts and lists fixtures ordered by kickoff", () => {
    const db = openDb(":memory:");
    upsertFixtures(db, [F2, F1], 1);
    expect(listFixtures(db)).toEqual([F1, F2]);
    expect(kickoffOf(db, 102)).toBe(2000);
    expect(kickoffOf(db, 999)).toBeUndefined();
  });

  it("updates kickoff on re-sync without duplicating", () => {
    const db = openDb(":memory:");
    upsertFixtures(db, [F1], 1);
    upsertFixtures(db, [{ ...F1, kickoffTs: 1500 }], 2);
    expect(listFixtures(db)).toEqual([{ ...F1, kickoffTs: 1500 }]);
  });

  it("registers pending fixtures once, tolerating already-in-use", async () => {
    const db = openDb(":memory:");
    upsertFixtures(db, [F1, F2], 1);
    const calls: bigint[] = [];
    const register = async (id: bigint) => {
      calls.push(id);
      if (id === 102n) throw new Error("Allocate: account already in use");
    };
    expect(await registerPendingFixtures(db, register)).toBe(1);
    expect(calls).toEqual([101n, 102n]);
    // both are now marked registered — nothing to do on the next pass
    expect(await registerPendingFixtures(db, register)).toBe(0);
    expect(calls).toHaveLength(2);
  });

  it("keeps genuinely failed fixtures pending for retry", async () => {
    const db = openDb(":memory:");
    upsertFixtures(db, [F1], 1);
    await registerPendingFixtures(db, async () => {
      throw new Error("blockhash not found");
    });
    let retried = 0;
    await registerPendingFixtures(db, async () => {
      retried += 1;
    });
    expect(retried).toBe(1);
  });
});
