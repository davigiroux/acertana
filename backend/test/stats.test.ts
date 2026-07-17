import { describe, it, expect, beforeEach } from "vitest";
import { openDb, type Db } from "../src/db.js";
import { buildServer } from "../src/server.js";

const KEY = Buffer.alloc(32, 7);
const POOL_A = "StatsPoolAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
const POOL_B = "StatsPoolBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

describe("GET /stats", () => {
  let db: Db;

  beforeEach(() => {
    db = openDb(":memory:");
  });

  it("returns 0 players on an empty database", async () => {
    const app = buildServer({ db, pickKey: KEY });
    const res = await app.inject({ method: "GET", url: "/stats" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ players: 0 });
  });

  it("counts distinct member wallets across pools, excluding pending", async () => {
    const app = buildServer({ db, pickKey: KEY });
    await app.inject({
      method: "POST",
      url: "/pools",
      payload: { name: "A", organizer: "Org", poolPubkey: POOL_A },
    });
    await app.inject({
      method: "POST",
      url: "/pools",
      payload: { name: "B", organizer: "Org", poolPubkey: POOL_B, requiresApproval: true },
    });
    // Alice in both pools counts once; Bob's join in B is pending approval.
    await app.inject({ method: "POST", url: `/pools/${POOL_A}/join`, payload: { wallet: "Alice" } });
    await app.inject({ method: "POST", url: `/pools/${POOL_B}/join`, payload: { wallet: "Alice" } });
    await app.inject({ method: "POST", url: `/pools/${POOL_B}/join`, payload: { wallet: "Bob" } });

    const res = await app.inject({ method: "GET", url: "/stats" });
    const players = res.json().players;
    // Alice is a member of A; her B join and Bob's are pending.
    expect(players).toBe(1);
  });
});
