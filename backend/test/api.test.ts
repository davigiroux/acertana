import { describe, it, expect, beforeEach } from "vitest";
import { openDb, type Db } from "../src/db.js";
import { buildServer } from "../src/server.js";
import type { FastifyInstance } from "fastify";

const KEY = Buffer.alloc(32, 7);
const POOL = "F1xTuReP0oLPubkeyXXXXXXXXXXXXXXXXXXXXXXXXXX";

describe("API", () => {
  let db: Db;
  let app: FastifyInstance;

  beforeEach(() => {
    db = openDb(":memory:");
    app = buildServer({ db, pickKey: KEY });
  });

  it("create pool -> resolve join code -> join -> members lists wallet", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/pools",
      payload: { name: "Copa dos Amigos", organizer: "OrgWallet111", poolPubkey: POOL },
    });
    expect(create.statusCode).toBe(201);
    const { joinCode } = create.json();
    expect(joinCode).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);

    const resolve = await app.inject({ method: "GET", url: `/j/${joinCode}` });
    expect(resolve.statusCode).toBe(200);
    expect(resolve.json()).toEqual({ poolPubkey: POOL, name: "Copa dos Amigos" });

    const join = await app.inject({
      method: "POST",
      url: `/pools/${POOL}/join`,
      payload: { wallet: "MemberWallet111", emailHint: "d***@gmail.com" },
    });
    expect(join.statusCode).toBe(200);

    const members = await app.inject({ method: "GET", url: `/pools/${POOL}/members` });
    expect(members.statusCode).toBe(200);
    const list = members.json().members;
    expect(list).toHaveLength(1);
    expect(list[0].wallet).toBe("MemberWallet111");
    expect(list[0].emailHint).toBe("d***@gmail.com");
  });

  it("duplicate join is idempotent", async () => {
    await app.inject({
      method: "POST",
      url: "/pools",
      payload: { name: "P", organizer: "O", poolPubkey: POOL },
    });
    for (let i = 0; i < 2; i++) {
      const res = await app.inject({
        method: "POST",
        url: `/pools/${POOL}/join`,
        payload: { wallet: "W1" },
      });
      expect(res.statusCode).toBe(200);
    }
    const members = await app.inject({ method: "GET", url: `/pools/${POOL}/members` });
    expect(members.json().members).toHaveLength(1);
  });

  it("unknown join code -> 404", async () => {
    const res = await app.inject({ method: "GET", url: "/j/ZZZZZZ" });
    expect(res.statusCode).toBe(404);
  });

  it("stores encrypted pick", async () => {
    await app.inject({
      method: "POST",
      url: "/pools",
      payload: { name: "P", organizer: "O", poolPubkey: POOL },
    });
    const res = await app.inject({
      method: "POST",
      url: "/picks",
      payload: {
        poolPubkey: POOL,
        wallet: "W1",
        fixtureId: 1001,
        homeGoals: 2,
        awayGoals: 1,
        saltHex: "11".repeat(32),
      },
    });
    expect(res.statusCode).toBe(201);
    const row = db.prepare("SELECT ciphertext, revealed FROM picks").get() as {
      ciphertext: string;
      revealed: number;
    };
    expect(row.revealed).toBe(0);
    expect(row.ciphertext).not.toContain("11".repeat(32)); // stored encrypted
  });

  const pick = (overrides: Record<string, unknown> = {}) => ({
    poolPubkey: POOL,
    wallet: "W1",
    fixtureId: 1001,
    homeGoals: 2,
    awayGoals: 1,
    saltHex: "11".repeat(32),
    ...overrides,
  });

  it("second pick for same (pool, wallet, fixture) -> 409, row unchanged", async () => {
    const first = await app.inject({ method: "POST", url: "/picks", payload: pick() });
    expect(first.statusCode).toBe(201);
    const before = db.prepare("SELECT ciphertext FROM picks").get() as { ciphertext: string };

    const second = await app.inject({
      method: "POST",
      url: "/picks",
      payload: pick({ homeGoals: 5, awayGoals: 5 }),
    });
    expect(second.statusCode).toBe(409);
    const after = db.prepare("SELECT ciphertext, revealed FROM picks").get() as {
      ciphertext: string;
      revealed: number;
    };
    expect(after.ciphertext).toBe(before.ciphertext);
    expect(after.revealed).toBe(0);
  });

  it.each([
    ["homeGoals 300", pick({ homeGoals: 300 })],
    ["homeGoals 2.5", pick({ homeGoals: 2.5 })],
    ["fixtureId 1.5", pick({ fixtureId: 1.5 })],
  ])("rejects invalid pick (%s) -> 400", async (_name, payload) => {
    const res = await app.inject({ method: "POST", url: "/picks", payload });
    expect(res.statusCode).toBe(400);
    expect((db.prepare("SELECT COUNT(*) AS n FROM picks").get() as { n: number }).n).toBe(0);
  });
});
