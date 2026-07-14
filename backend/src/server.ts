import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import type { Db } from "./db.js";
import { insertPoolWithJoinCode } from "./joinCodes.js";
import { encryptPick, type PickPayload } from "./crypto.js";
import { computeStandings, type EntryProvider } from "./leaderboard.js";
import { ResultsStore } from "./results.js";
import { listFixtures } from "./fixtureSync.js";
import type { WalletVerifier } from "./auth.js";

export interface ServerDeps {
  db: Db;
  pickKey: Buffer;
  entryProvider?: EntryProvider;
  resultsStore?: ResultsStore;
  /** When set, join/picks require a Privy token proving ownership of the wallet. */
  verifyWallet?: WalletVerifier;
  /** When set, enables POST /admin/results guarded by the x-admin-token header. */
  adminToken?: string;
  /** Tops up a wallet with dust for tx fees (devnet UX — invisible wallets start empty). */
  faucet?: (wallet: string) => Promise<void>;
}

export function buildServer({
  db,
  pickKey,
  entryProvider,
  resultsStore,
  verifyWallet,
  adminToken,
  faucet,
}: ServerDeps): FastifyInstance {
  const app = Fastify();

  // Browser app is served from a different origin (vite :5173 in dev).
  // CORS_ORIGIN accepts a comma-separated allowlist; set it in any deployment.
  const origins = process.env.CORS_ORIGIN?.split(",").map((s) => s.trim());
  app.register(cors, { origin: origins ?? true });

  // Fixture list for the app's pick UI (synced from TxLINE or the dev seed).
  app.get("/fixtures", async () => ({ fixtures: listFixtures(db) }));

  // Create pool (design §6): organizer registers the on-chain pool pubkey,
  // backend mints the short join code.
  app.post<{
    Body: { name?: string; organizer?: string; poolPubkey?: string; requiresApproval?: boolean };
  }>("/pools", async (req, reply) => {
    const { name, organizer, poolPubkey, requiresApproval } = req.body ?? {};
    if (!name || !organizer || !poolPubkey) {
      return reply.code(400).send({ error: "name, organizer, poolPubkey required" });
    }
    if (verifyWallet && !(await verifyWallet(req.headers.authorization, organizer))) {
      return reply.code(401).send({ error: "invalid auth token for organizer" });
    }
    const joinCode = insertPoolWithJoinCode(db, {
      poolPubkey,
      name,
      organizer,
      requiresApproval: !!requiresApproval,
    });
    return reply.code(201).send({ joinCode, poolPubkey });
  });

  // Resolve join code -> pool.
  app.get<{ Params: { code: string } }>("/j/:code", async (req, reply) => {
    const row = db
      .prepare("SELECT pool_pubkey, name FROM pools WHERE join_code = ?")
      .get(req.params.code.toUpperCase()) as { pool_pubkey: string; name: string } | undefined;
    if (!row) return reply.code(404).send({ error: "unknown join code" });
    return { poolPubkey: row.pool_pubkey, name: row.name };
  });

  // Pool info; joinCode only returned to proven members/organizer (share link stays private).
  app.get<{ Params: { pubkey: string }; Querystring: { wallet?: string } }>(
    "/pools/:pubkey",
    async (req, reply) => {
      const row = db
        .prepare("SELECT pool_pubkey, name, join_code, organizer FROM pools WHERE pool_pubkey = ?")
        .get(req.params.pubkey) as
        | { pool_pubkey: string; name: string; join_code: string; organizer: string }
        | undefined;
      if (!row) return reply.code(404).send({ error: "unknown pool" });
      const { wallet } = req.query ?? {};
      const isActiveMember = (w: string) =>
        !!db
          .prepare(
            "SELECT 1 FROM members WHERE pool_pubkey = ? AND wallet = ? AND status = 'member'",
          )
          .get(req.params.pubkey, w);
      let isMember = false;
      if (wallet) {
        if (verifyWallet) {
          isMember =
            (await verifyWallet(req.headers.authorization, wallet)) &&
            (wallet === row.organizer || isActiveMember(wallet));
        } else {
          isMember = wallet === row.organizer || isActiveMember(wallet);
        }
      }
      return {
        poolPubkey: row.pool_pubkey,
        name: row.name,
        organizer: row.organizer,
        ...(isMember ? { joinCode: row.join_code } : {}),
      };
    },
  );

  // Pools a wallet belongs to (for the "Meus bolões" home list).
  app.get<{ Params: { wallet: string } }>("/wallets/:wallet/pools", async (req, reply) => {
    const { wallet } = req.params;
    if (verifyWallet && !(await verifyWallet(req.headers.authorization, wallet))) {
      return reply.code(401).send({ error: "invalid auth token for wallet" });
    }
    const rows = db
      .prepare(
        `SELECT p.pool_pubkey AS pool_pubkey, p.name AS name, m.joined_at AS joined_at
         FROM members m JOIN pools p ON p.pool_pubkey = m.pool_pubkey
         WHERE m.wallet = ?
         ORDER BY m.joined_at DESC`,
      )
      .all(wallet) as { pool_pubkey: string; name: string; joined_at: number }[];
    return {
      pools: rows.map((r) => ({ poolPubkey: r.pool_pubkey, name: r.name, joinedAt: r.joined_at })),
    };
  });

  // Join roster (off-chain; no on-chain membership per design §6). Idempotent.
  app.post<{ Params: { pubkey: string }; Body: { wallet?: string; emailHint?: string } }>(
    "/pools/:pubkey/join",
    async (req, reply) => {
      const { wallet, emailHint } = req.body ?? {};
      if (!wallet) return reply.code(400).send({ error: "wallet required" });
      if (verifyWallet && !(await verifyWallet(req.headers.authorization, wallet))) {
        return reply.code(401).send({ error: "invalid auth token for wallet" });
      }
      const pool = db
        .prepare("SELECT pool_pubkey, requires_approval FROM pools WHERE pool_pubkey = ?")
        .get(req.params.pubkey) as { pool_pubkey: string; requires_approval: number } | undefined;
      if (!pool) return reply.code(404).send({ error: "unknown pool" });
      const status = pool.requires_approval ? "pending" : "member";
      db.prepare(
        `INSERT INTO members (pool_pubkey, wallet, email_hint, joined_at, status)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (pool_pubkey, wallet) DO NOTHING`,
      ).run(req.params.pubkey, wallet, emailHint ?? null, Math.floor(Date.now() / 1000), status);
      const existing = db
        .prepare("SELECT status FROM members WHERE pool_pubkey = ? AND wallet = ?")
        .get(req.params.pubkey, wallet) as { status: string } | undefined;
      return { poolPubkey: req.params.pubkey, wallet, status: existing?.status ?? status };
    },
  );

  app.get<{ Params: { pubkey: string } }>("/pools/:pubkey/members", async (req, reply) => {
    const pool = db
      .prepare("SELECT pool_pubkey FROM pools WHERE pool_pubkey = ?")
      .get(req.params.pubkey);
    if (!pool) return reply.code(404).send({ error: "unknown pool" });
    const members = db
      .prepare(
        "SELECT wallet, email_hint, joined_at FROM members WHERE pool_pubkey = ? AND status = 'member' ORDER BY joined_at",
      )
      .all(req.params.pubkey) as { wallet: string; email_hint: string | null; joined_at: number }[];
    return {
      members: members.map((m) => ({
        wallet: m.wallet,
        emailHint: m.email_hint,
        joinedAt: m.joined_at,
      })),
    };
  });

  // Pending join requests (organizer-only) — approval-gated pools.
  app.get<{ Params: { pubkey: string }; Querystring: { wallet?: string } }>(
    "/pools/:pubkey/requests",
    async (req, reply) => {
      const row = db
        .prepare("SELECT pool_pubkey, organizer FROM pools WHERE pool_pubkey = ?")
        .get(req.params.pubkey) as { pool_pubkey: string; organizer: string } | undefined;
      if (!row) return reply.code(404).send({ error: "unknown pool" });
      const { wallet } = req.query ?? {};
      if (!wallet || wallet !== row.organizer) {
        return reply.code(401).send({ error: "organizer only" });
      }
      if (verifyWallet && !(await verifyWallet(req.headers.authorization, wallet))) {
        return reply.code(401).send({ error: "invalid auth token for organizer" });
      }
      const requests = db
        .prepare(
          "SELECT wallet, email_hint, joined_at FROM members WHERE pool_pubkey = ? AND status = 'pending' ORDER BY joined_at",
        )
        .all(req.params.pubkey) as { wallet: string; email_hint: string | null; joined_at: number }[];
      return {
        requests: requests.map((m) => ({
          wallet: m.wallet,
          emailHint: m.email_hint,
          joinedAt: m.joined_at,
        })),
      };
    },
  );

  // Approve/reject a pending join request (organizer-only).
  app.post<{
    Params: { pubkey: string; wallet: string };
    Body: { action?: "approve" | "reject"; wallet?: string };
  }>("/pools/:pubkey/requests/:wallet", async (req, reply) => {
    const row = db
      .prepare("SELECT pool_pubkey, organizer FROM pools WHERE pool_pubkey = ?")
      .get(req.params.pubkey) as { pool_pubkey: string; organizer: string } | undefined;
    if (!row) return reply.code(404).send({ error: "unknown pool" });
    const { action, wallet: organizerWallet } = req.body ?? {};
    if (!organizerWallet || organizerWallet !== row.organizer) {
      return reply.code(401).send({ error: "organizer only" });
    }
    if (verifyWallet && !(await verifyWallet(req.headers.authorization, organizerWallet))) {
      return reply.code(401).send({ error: "invalid auth token for organizer" });
    }
    if (action !== "approve" && action !== "reject") {
      return reply.code(400).send({ error: "action must be 'approve' or 'reject'" });
    }
    const requester = req.params.wallet;
    const pending = db
      .prepare(
        "SELECT 1 FROM members WHERE pool_pubkey = ? AND wallet = ? AND status = 'pending'",
      )
      .get(req.params.pubkey, requester);
    if (!pending) return reply.code(404).send({ error: "no pending request for wallet" });
    if (action === "approve") {
      db.prepare(
        "UPDATE members SET status = 'member' WHERE pool_pubkey = ? AND wallet = ?",
      ).run(req.params.pubkey, requester);
    } else {
      db.prepare("DELETE FROM members WHERE pool_pubkey = ? AND wallet = ?").run(
        req.params.pubkey,
        requester,
      );
    }
    return { poolPubkey: req.params.pubkey, wallet: requester, status: action === "approve" ? "member" : "rejected" };
  });

  // Leaderboard (design §3/§4): revealed on-chain entries × TxLINE results.
  app.get<{ Params: { pubkey: string } }>("/pools/:pubkey/leaderboard", async (req, reply) => {
    if (!entryProvider || !resultsStore) {
      return reply.code(503).send({ error: "leaderboard not configured" });
    }
    const pool = db
      .prepare("SELECT pool_pubkey FROM pools WHERE pool_pubkey = ?")
      .get(req.params.pubkey);
    if (!pool) return reply.code(404).send({ error: "unknown pool" });
    const members = (
      db.prepare(
        "SELECT wallet FROM members WHERE pool_pubkey = ? AND status = 'member' ORDER BY joined_at",
      ).all(req.params.pubkey) as { wallet: string }[]
    ).map((m) => m.wallet);
    const entries = await entryProvider.getRevealedEntries(req.params.pubkey);
    return {
      standings: computeStandings(members, entries, resultsStore.scorelines()),
      updatedAt: resultsStore.updatedAt(),
      provisional: resultsStore.hasProvisional(),
    };
  });

  // Store encrypted pick payload (plaintext + salt) for auto-reveal (design §2).
  app.post<{
    Body: {
      poolPubkey?: string;
      wallet?: string;
      fixtureId?: number;
      homeGoals?: number;
      awayGoals?: number;
      saltHex?: string;
    };
  }>("/picks", async (req, reply) => {
    const { poolPubkey, wallet, fixtureId, homeGoals, awayGoals, saltHex } = req.body ?? {};
    if (wallet && verifyWallet && !(await verifyWallet(req.headers.authorization, wallet))) {
      return reply.code(401).send({ error: "invalid auth token for wallet" });
    }
    const isGoals = (n: unknown): n is number =>
      typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 9;
    if (
      !poolPubkey ||
      !wallet ||
      typeof fixtureId !== "number" ||
      !Number.isSafeInteger(fixtureId) ||
      fixtureId <= 0 ||
      !isGoals(homeGoals) ||
      !isGoals(awayGoals) ||
      !saltHex ||
      Buffer.from(saltHex, "hex").length !== 32
    ) {
      return reply
        .code(400)
        .send({ error: "poolPubkey, wallet, fixtureId, homeGoals(0-9), awayGoals(0-9), saltHex(32B) required" });
    }
    const payload: PickPayload = { homeGoals, awayGoals, saltHex };
    // Entry is init-only on-chain, so a stored pick is immutable too: reject overwrites.
    const existing = db
      .prepare("SELECT 1 FROM picks WHERE pool_pubkey = ? AND wallet = ? AND fixture_id = ?")
      .get(poolPubkey, wallet, fixtureId);
    if (existing) return reply.code(409).send({ error: "pick already stored" });
    db.prepare(
      `INSERT INTO picks (pool_pubkey, wallet, fixture_id, ciphertext, revealed)
       VALUES (?, ?, ?, ?, 0)`,
    ).run(poolPubkey, wallet, fixtureId, encryptPick(payload, pickKey));
    return reply.code(201).send({ ok: true });
  });

  // Fee top-up for invisible wallets (they start with 0 SOL; commit/create
  // txs are payer-funded). Auth-gated; the implementation rate-limits by
  // checking the wallet's current balance.
  app.post<{ Body: { wallet?: string } }>("/faucet", async (req, reply) => {
    if (!faucet) return reply.code(404).send({ error: "not enabled" });
    const { wallet } = req.body ?? {};
    if (!wallet) return reply.code(400).send({ error: "wallet required" });
    if (verifyWallet && !(await verifyWallet(req.headers.authorization, wallet))) {
      return reply.code(401).send({ error: "invalid auth token for wallet" });
    }
    await faucet(wallet);
    return { ok: true };
  });

  // Remove a fixture from the local table (admin cleanup — e.g. rows synced
  // before a competition filter was applied). On-chain Fixture accounts are
  // permanent; this only affects what /fixtures serves and the reveal worker.
  app.delete<{ Params: { fixtureId: string } }>(
    "/admin/fixtures/:fixtureId",
    async (req, reply) => {
      if (!adminToken) return reply.code(404).send({ error: "not enabled" });
      if (req.headers["x-admin-token"] !== adminToken) {
        return reply.code(401).send({ error: "bad admin token" });
      }
      const id = Number(req.params.fixtureId);
      const info = db.prepare("DELETE FROM fixtures WHERE fixture_id = ?").run(id);
      return { deleted: info.changes };
    },
  );

  // Manual result injection (demos; fixtures outside the live feed's coverage).
  app.post<{
    Body: { fixtureId?: number; homeGoals?: number; awayGoals?: number; final?: boolean };
  }>("/admin/results", async (req, reply) => {
    if (!adminToken || !resultsStore) return reply.code(404).send({ error: "not enabled" });
    if (req.headers["x-admin-token"] !== adminToken) {
      return reply.code(401).send({ error: "bad admin token" });
    }
    const { fixtureId, homeGoals, awayGoals, final } = req.body ?? {};
    if (
      typeof fixtureId !== "number" ||
      typeof homeGoals !== "number" ||
      typeof awayGoals !== "number"
    ) {
      return reply.code(400).send({ error: "fixtureId, homeGoals, awayGoals required" });
    }
    resultsStore.apply({ fixtureId, homeGoals, awayGoals, final: final ?? true });
    return { ok: true };
  });

  return app;
}
