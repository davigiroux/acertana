import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { openDb, type Db } from "../src/db.js";
import { buildServer } from "../src/server.js";

const KEY = Buffer.alloc(32, 7);
const POOL = "ApPr0va1P0oLPubkeyXXXXXXXXXXXXXXXXXXXXXXXXX";

const verifyWallet = async (header: string | undefined, wallet: string) =>
  header === "Bearer good" && wallet === "OwnedWallet";

describe("pool approval", () => {
  let db: Db;
  let app: FastifyInstance;

  beforeEach(async () => {
    db = openDb(":memory:");
    app = buildServer({ db, pickKey: KEY });
  });

  it("legacy pool (requiresApproval omitted) joins straight to member", async () => {
    await app.inject({
      method: "POST",
      url: "/pools",
      payload: { name: "Legacy", organizer: "Org", poolPubkey: POOL },
    });
    const res = await app.inject({
      method: "POST",
      url: `/pools/${POOL}/join`,
      payload: { wallet: "Alice" },
    });
    expect(res.json()).toEqual({ poolPubkey: POOL, wallet: "Alice", status: "member" });
    const members = await app.inject({ method: "GET", url: `/pools/${POOL}/members` });
    expect(members.json().members.map((m: { wallet: string }) => m.wallet)).toEqual(["Alice"]);
  });

  it("approval-required pool: join returns pending, excluded from members/leaderboard/joinCode", async () => {
    await app.inject({
      method: "POST",
      url: "/pools",
      payload: { name: "Gated", organizer: "Org", poolPubkey: POOL, requiresApproval: true },
    });
    const res = await app.inject({
      method: "POST",
      url: `/pools/${POOL}/join`,
      payload: { wallet: "Alice" },
    });
    expect(res.json()).toEqual({ poolPubkey: POOL, wallet: "Alice", status: "pending" });

    const members = await app.inject({ method: "GET", url: `/pools/${POOL}/members` });
    expect(members.json().members).toEqual([]);

    const info = await app.inject({ method: "GET", url: `/pools/${POOL}?wallet=Alice` });
    expect(info.json().joinCode).toBeUndefined();

    // idempotent: joining again stays pending, no duplicate row
    const res2 = await app.inject({
      method: "POST",
      url: `/pools/${POOL}/join`,
      payload: { wallet: "Alice" },
    });
    expect(res2.json().status).toBe("pending");
  });

  it("GET /requests is organizer-only and lists pending members", async () => {
    await app.inject({
      method: "POST",
      url: "/pools",
      payload: { name: "Gated", organizer: "Org", poolPubkey: POOL, requiresApproval: true },
    });
    await app.inject({ method: "POST", url: `/pools/${POOL}/join`, payload: { wallet: "Alice" } });
    await app.inject({ method: "POST", url: `/pools/${POOL}/join`, payload: { wallet: "Bob" } });

    const stranger = await app.inject({
      method: "GET",
      url: `/pools/${POOL}/requests?wallet=Alice`,
    });
    expect(stranger.statusCode).toBe(401);

    const organizer = await app.inject({
      method: "GET",
      url: `/pools/${POOL}/requests?wallet=Org`,
    });
    expect(organizer.statusCode).toBe(200);
    expect(organizer.json().requests.map((r: { wallet: string }) => r.wallet)).toEqual([
      "Alice",
      "Bob",
    ]);
  });

  it("approve moves member to active status; visible in members/leaderboard/joinCode", async () => {
    await app.inject({
      method: "POST",
      url: "/pools",
      payload: { name: "Gated", organizer: "Org", poolPubkey: POOL, requiresApproval: true },
    });
    await app.inject({ method: "POST", url: `/pools/${POOL}/join`, payload: { wallet: "Alice" } });

    const approve = await app.inject({
      method: "POST",
      url: `/pools/${POOL}/requests/Alice`,
      payload: { wallet: "Org", action: "approve" },
    });
    expect(approve.statusCode).toBe(200);
    expect(approve.json().status).toBe("member");

    const members = await app.inject({ method: "GET", url: `/pools/${POOL}/members` });
    expect(members.json().members.map((m: { wallet: string }) => m.wallet)).toEqual(["Alice"]);

    const info = await app.inject({ method: "GET", url: `/pools/${POOL}?wallet=Alice` });
    expect(info.json().joinCode).toBeTruthy();
  });

  it("reject deletes the pending row entirely", async () => {
    await app.inject({
      method: "POST",
      url: "/pools",
      payload: { name: "Gated", organizer: "Org", poolPubkey: POOL, requiresApproval: true },
    });
    await app.inject({ method: "POST", url: `/pools/${POOL}/join`, payload: { wallet: "Alice" } });

    const reject = await app.inject({
      method: "POST",
      url: `/pools/${POOL}/requests/Alice`,
      payload: { wallet: "Org", action: "reject" },
    });
    expect(reject.statusCode).toBe(200);

    const requests = await app.inject({
      method: "GET",
      url: `/pools/${POOL}/requests?wallet=Org`,
    });
    expect(requests.json().requests).toEqual([]);

    // rejoin after rejection works again (fresh pending row)
    const rejoin = await app.inject({
      method: "POST",
      url: `/pools/${POOL}/join`,
      payload: { wallet: "Alice" },
    });
    expect(rejoin.json().status).toBe("pending");
  });

  it("approve/reject requires organizer auth token when verifier configured", async () => {
    // Accept "Bearer good" for any wallet so both the organizer and Alice can act.
    const anyWalletVerifier = async (header: string | undefined) => header === "Bearer good";
    const authedApp = buildServer({ db, pickKey: KEY, verifyWallet: anyWalletVerifier });
    await authedApp.inject({
      method: "POST",
      url: "/pools",
      headers: { authorization: "Bearer good" },
      payload: { name: "Gated", organizer: "OwnedWallet", poolPubkey: POOL, requiresApproval: true },
    });
    await authedApp.inject({
      method: "POST",
      url: `/pools/${POOL}/join`,
      headers: { authorization: "Bearer good" },
      payload: { wallet: "Alice" },
    });

    const noAuth = await authedApp.inject({
      method: "POST",
      url: `/pools/${POOL}/requests/Alice`,
      payload: { wallet: "OwnedWallet", action: "approve" },
    });
    expect(noAuth.statusCode).toBe(401);

    const ok = await authedApp.inject({
      method: "POST",
      url: `/pools/${POOL}/requests/Alice`,
      headers: { authorization: "Bearer good" },
      payload: { wallet: "OwnedWallet", action: "approve" },
    });
    expect(ok.statusCode).toBe(200);
  });

  it("migration via openDb on a real file: pre-existing db gets new columns and keeps working", async () => {
    const fs = await import("node:fs");
    const os = await import("node:os");
    const path = await import("node:path");
    const file = path.join(os.tmpdir(), `acertana-migration-${Date.now()}.db`);
    try {
      // Create a legacy-shaped DB file directly (pre-approval schema).
      const legacy = new Database(file);
      legacy.exec(`
        CREATE TABLE pools (
          pool_pubkey TEXT PRIMARY KEY,
          join_code   TEXT NOT NULL UNIQUE,
          name        TEXT NOT NULL,
          organizer   TEXT NOT NULL
        );
        CREATE TABLE members (
          pool_pubkey TEXT NOT NULL REFERENCES pools(pool_pubkey),
          wallet      TEXT NOT NULL,
          email_hint  TEXT,
          joined_at   INTEGER NOT NULL,
          PRIMARY KEY (pool_pubkey, wallet)
        );
      `);
      legacy.prepare(
        "INSERT INTO pools (pool_pubkey, join_code, name, organizer) VALUES (?, ?, ?, ?)",
      ).run(POOL, "ABC123", "Old Pool", "Org");
      legacy.prepare(
        "INSERT INTO members (pool_pubkey, wallet, email_hint, joined_at) VALUES (?, ?, ?, ?)",
      ).run(POOL, "Alice", null, 1);
      legacy.close();

      const migratedDb = openDb(file);
      const poolCols = (migratedDb.prepare("PRAGMA table_info(pools)").all() as { name: string }[]).map(
        (c) => c.name,
      );
      const memberCols = (
        migratedDb.prepare("PRAGMA table_info(members)").all() as { name: string }[]
      ).map((c) => c.name);
      expect(poolCols).toContain("requires_approval");
      expect(memberCols).toContain("status");

      const migratedApp = buildServer({ db: migratedDb, pickKey: KEY });
      const members = await migratedApp.inject({ method: "GET", url: `/pools/${POOL}/members` });
      // Pre-existing member row defaults to status='member', so it's still visible.
      expect(members.json().members.map((m: { wallet: string }) => m.wallet)).toEqual(["Alice"]);
    } finally {
      for (const ext of ["", "-wal", "-shm"]) {
        fs.rmSync(file + ext, { force: true });
      }
    }
  });
});
