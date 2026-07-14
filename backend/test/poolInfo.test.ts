import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { openDb, type Db } from "../src/db.js";
import { buildServer } from "../src/server.js";

const KEY = Buffer.alloc(32, 7);
const POOL = "F1xTuReP0oLPubkeyXXXXXXXXXXXXXXXXXXXXXXXXXX";

const verifyWallet = async (header: string | undefined, wallet: string) =>
  header === "Bearer good" && wallet === "OwnedWallet";

describe("GET /pools/:pubkey", () => {
  let db: Db;

  beforeEach(async () => {
    db = openDb(":memory:");
  });

  it("404 for unknown pool", async () => {
    const app = buildServer({ db, pickKey: KEY });
    const res = await app.inject({ method: "GET", url: "/pools/Nope" });
    expect(res.statusCode).toBe(404);
  });

  it("no verifier: joinCode returned only for organizer/member wallet param", async () => {
    const app = buildServer({ db, pickKey: KEY });
    await app.inject({
      method: "POST",
      url: "/pools",
      payload: { name: "P", organizer: "Org", poolPubkey: POOL },
    });
    await app.inject({ method: "POST", url: `/pools/${POOL}/join`, payload: { wallet: "Alice" } });

    const noWallet = await app.inject({ method: "GET", url: `/pools/${POOL}` });
    expect(noWallet.json()).toEqual({ poolPubkey: POOL, name: "P", organizer: "Org" });

    const organizer = await app.inject({ method: "GET", url: `/pools/${POOL}?wallet=Org` });
    expect(organizer.json().joinCode).toBeTruthy();

    const member = await app.inject({ method: "GET", url: `/pools/${POOL}?wallet=Alice` });
    expect(member.json().joinCode).toBeTruthy();

    const stranger = await app.inject({ method: "GET", url: `/pools/${POOL}?wallet=Stranger` });
    expect(stranger.json().joinCode).toBeUndefined();
  });

  it("with verifier: requires proof of wallet ownership before revealing joinCode", async () => {
    const app = buildServer({ db, pickKey: KEY, verifyWallet });
    await app.inject({
      method: "POST",
      url: "/pools",
      headers: { authorization: "Bearer good" },
      payload: { name: "P", organizer: "OwnedWallet", poolPubkey: POOL },
    });

    const noAuth = await app.inject({ method: "GET", url: `/pools/${POOL}?wallet=OwnedWallet` });
    expect(noAuth.json().joinCode).toBeUndefined();

    const withAuth = await app.inject({
      method: "GET",
      url: `/pools/${POOL}?wallet=OwnedWallet`,
      headers: { authorization: "Bearer good" },
    });
    expect(withAuth.json().joinCode).toBeTruthy();

    const wrongToken = await app.inject({
      method: "GET",
      url: `/pools/${POOL}?wallet=SomeoneElse`,
      headers: { authorization: "Bearer good" },
    });
    expect(wrongToken.json().joinCode).toBeUndefined();
  });
});

describe("GET /wallets/:wallet/pools", () => {
  let db: Db;

  beforeEach(async () => {
    db = openDb(":memory:");
  });

  it("lists pools a wallet joined, ordered by joined_at desc", async () => {
    const app = buildServer({ db, pickKey: KEY });
    const poolA = "PoolAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
    const poolB = "PoolBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
    await app.inject({
      method: "POST",
      url: "/pools",
      payload: { name: "A", organizer: "Org", poolPubkey: poolA },
    });
    await app.inject({
      method: "POST",
      url: "/pools",
      payload: { name: "B", organizer: "Org", poolPubkey: poolB },
    });
    await app.inject({ method: "POST", url: `/pools/${poolA}/join`, payload: { wallet: "Alice" } });
    await app.inject({ method: "POST", url: `/pools/${poolB}/join`, payload: { wallet: "Alice" } });
    // Force distinct joined_at (both joins can land in the same second).
    db.prepare("UPDATE members SET joined_at = 100 WHERE pool_pubkey = ?").run(poolA);
    db.prepare("UPDATE members SET joined_at = 200 WHERE pool_pubkey = ?").run(poolB);

    const res = await app.inject({ method: "GET", url: "/wallets/Alice/pools" });
    expect(res.statusCode).toBe(200);
    expect(res.json().pools.map((p: { poolPubkey: string }) => p.poolPubkey)).toEqual([
      poolB,
      poolA,
    ]);
  });

  it("with verifier: requires token proving the wallet", async () => {
    const app = buildServer({ db, pickKey: KEY, verifyWallet });
    const noAuth = await app.inject({ method: "GET", url: "/wallets/OwnedWallet/pools" });
    expect(noAuth.statusCode).toBe(401);

    const ok = await app.inject({
      method: "GET",
      url: "/wallets/OwnedWallet/pools",
      headers: { authorization: "Bearer good" },
    });
    expect(ok.statusCode).toBe(200);
  });
});
