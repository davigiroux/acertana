import { describe, it, expect, beforeEach } from "vitest";
import { openDb, type Db } from "../src/db.js";
import { buildServer } from "../src/server.js";
import { upsertFixtures } from "../src/fixtureSync.js";
import { ResultsStore } from "../src/results.js";
import type { FastifyInstance } from "fastify";

const KEY = Buffer.alloc(32, 7);
const POOL = "F1xTuReP0oLPubkeyXXXXXXXXXXXXXXXXXXXXXXXXXX";
const SALT = "ab".repeat(32);

/** Fake verifier: accepts only "Bearer good" for wallet "OwnedWallet". */
const verifyWallet = async (header: string | undefined, wallet: string) => ({
  ok: header === "Bearer good" && wallet === "OwnedWallet",
  email: header === "Bearer good" && wallet === "OwnedWallet" ? "owned@ex.com" : undefined,
});

function createPool(app: FastifyInstance) {
  // OwnedWallet + good token so the helper works when a verifier is configured.
  return app.inject({
    method: "POST",
    url: "/pools",
    headers: { authorization: "Bearer good" },
    payload: { name: "p", organizer: "OwnedWallet", poolPubkey: POOL },
  });
}

describe("GET /fixtures", () => {
  it("returns DB fixtures ordered by kickoff", async () => {
    const db = openDb(":memory:");
    upsertFixtures(
      db,
      [
        { fixtureId: 2, home: "USA", away: "Japan", kickoffTs: 200 },
        { fixtureId: 1, home: "Brazil", away: "Senegal", kickoffTs: 100 },
      ],
      1,
    );
    const app = buildServer({ db, pickKey: KEY });
    const res = await app.inject({ method: "GET", url: "/fixtures" });
    expect(res.statusCode).toBe(200);
    expect(res.json().fixtures.map((f: { fixtureId: number }) => f.fixtureId)).toEqual([1, 2]);
  });
});

describe("wallet auth", () => {
  let db: Db;
  let app: FastifyInstance;

  beforeEach(async () => {
    db = openDb(":memory:");
    app = buildServer({ db, pickKey: KEY, verifyWallet });
    await createPool(app);
  });

  it("rejects join without a valid token for the wallet", async () => {
    for (const [headers, wallet, code] of [
      [{}, "OwnedWallet", 401],
      [{ authorization: "Bearer bad" }, "OwnedWallet", 401],
      [{ authorization: "Bearer good" }, "SomeoneElse", 401],
      [{ authorization: "Bearer good" }, "OwnedWallet", 200],
    ] as const) {
      const res = await app.inject({
        method: "POST",
        url: `/pools/${POOL}/join`,
        headers,
        payload: { wallet },
      });
      expect(res.statusCode).toBe(code);
    }
  });

  it("rejects picks for wallets the token does not own", async () => {
    const pick = (wallet: string, auth?: string) =>
      app.inject({
        method: "POST",
        url: "/picks",
        headers: auth ? { authorization: auth } : {},
        payload: { poolPubkey: POOL, wallet, fixtureId: 1, homeGoals: 2, awayGoals: 1, saltHex: SALT },
      });
    expect((await pick("OwnedWallet")).statusCode).toBe(401);
    expect((await pick("SomeoneElse", "Bearer good")).statusCode).toBe(401);
    expect((await pick("OwnedWallet", "Bearer good")).statusCode).toBe(201);
  });

  it("stores the verified email on join, ignoring a spoofed emailHint in the body", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/pools/${POOL}/join`,
      headers: { authorization: "Bearer good" },
      payload: { wallet: "OwnedWallet", emailHint: "attacker@evil.com" },
    });
    expect(res.statusCode).toBe(200);
    const members = await app.inject({ method: "GET", url: `/pools/${POOL}/members` });
    expect(members.json().members).toEqual([
      expect.objectContaining({ wallet: "OwnedWallet", emailHint: "owned@ex.com" }),
    ]);
  });

  it("stays open when no verifier is configured", async () => {
    const openApp = buildServer({ db: openDb(":memory:"), pickKey: KEY });
    await createPool(openApp);
    const res = await openApp.inject({
      method: "POST",
      url: `/pools/${POOL}/join`,
      payload: { wallet: "AnyWallet" },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("POST /pools auth", () => {
  it("rejects pool creation for organizers the token does not own", async () => {
    const app = buildServer({ db: openDb(":memory:"), pickKey: KEY, verifyWallet });
    const res = await app.inject({
      method: "POST",
      url: "/pools",
      headers: { authorization: "Bearer good" },
      payload: { name: "p", organizer: "SomeoneElse", poolPubkey: POOL },
    });
    expect(res.statusCode).toBe(401);
    expect((await createPool(app)).statusCode).toBe(201);
  });
});

describe("POST /faucet", () => {
  it("404 when not configured, auth-gated, calls the faucet", async () => {
    const closed = buildServer({ db: openDb(":memory:"), pickKey: KEY });
    expect(
      (await closed.inject({ method: "POST", url: "/faucet", payload: { wallet: "w" } }))
        .statusCode,
    ).toBe(404);

    const topped: string[] = [];
    const app = buildServer({
      db: openDb(":memory:"),
      pickKey: KEY,
      verifyWallet,
      faucet: async (w) => {
        topped.push(w);
      },
    });
    const bad = await app.inject({
      method: "POST",
      url: "/faucet",
      headers: { authorization: "Bearer good" },
      payload: { wallet: "SomeoneElse" },
    });
    expect(bad.statusCode).toBe(401);
    const ok = await app.inject({
      method: "POST",
      url: "/faucet",
      headers: { authorization: "Bearer good" },
      payload: { wallet: "OwnedWallet" },
    });
    expect(ok.statusCode).toBe(200);
    expect(topped).toEqual(["OwnedWallet"]);
  });
});

describe("DELETE /admin/fixtures/:id", () => {
  it("is guarded and deletes the row", async () => {
    const db = openDb(":memory:");
    upsertFixtures(db, [{ fixtureId: 9, home: "A", away: "B", kickoffTs: 1 }], 1);
    const app = buildServer({ db, pickKey: KEY, adminToken: "s3cret" });
    expect(
      (await app.inject({ method: "DELETE", url: "/admin/fixtures/9" })).statusCode,
    ).toBe(401);
    const ok = await app.inject({
      method: "DELETE",
      url: "/admin/fixtures/9",
      headers: { "x-admin-token": "s3cret" },
    });
    expect(ok.json()).toEqual({ deleted: 1 });
    expect((await app.inject({ method: "GET", url: "/fixtures" })).json().fixtures).toEqual([]);
  });
});

describe("POST /admin/results", () => {
  it("is 404 when not enabled, guarded when enabled, and feeds the store", async () => {
    const store = new ResultsStore(() => 42);
    const closed = buildServer({ db: openDb(":memory:"), pickKey: KEY, resultsStore: store });
    expect(
      (await closed.inject({ method: "POST", url: "/admin/results", payload: {} })).statusCode,
    ).toBe(404);

    const app = buildServer({
      db: openDb(":memory:"),
      pickKey: KEY,
      resultsStore: store,
      adminToken: "s3cret",
    });
    const bad = await app.inject({
      method: "POST",
      url: "/admin/results",
      headers: { "x-admin-token": "wrong" },
      payload: { fixtureId: 7, homeGoals: 2, awayGoals: 1 },
    });
    expect(bad.statusCode).toBe(401);

    const ok = await app.inject({
      method: "POST",
      url: "/admin/results",
      headers: { "x-admin-token": "s3cret" },
      payload: { fixtureId: 7, homeGoals: 2, awayGoals: 1 },
    });
    expect(ok.statusCode).toBe(200);
    expect(store.get(7)).toMatchObject({ home: 2, away: 1, final: true });

    const invalid = await app.inject({
      method: "POST",
      url: "/admin/results",
      headers: { "x-admin-token": "s3cret" },
      payload: { fixtureId: 7 },
    });
    expect(invalid.statusCode).toBe(400);
  });
});
