import Fastify, { type FastifyInstance } from "fastify";
import type { Db } from "./db.js";
import { insertPoolWithJoinCode } from "./joinCodes.js";
import { encryptPick, type PickPayload } from "./crypto.js";

export interface ServerDeps {
  db: Db;
  pickKey: Buffer;
}

// TODO: verify Privy auth token on every route; no auth for now.
export function buildServer({ db, pickKey }: ServerDeps): FastifyInstance {
  const app = Fastify();

  // Create pool (design §6): organizer registers the on-chain pool pubkey,
  // backend mints the short join code.
  app.post<{ Body: { name?: string; organizer?: string; poolPubkey?: string } }>(
    "/pools",
    async (req, reply) => {
      const { name, organizer, poolPubkey } = req.body ?? {};
      if (!name || !organizer || !poolPubkey) {
        return reply.code(400).send({ error: "name, organizer, poolPubkey required" });
      }
      const joinCode = insertPoolWithJoinCode(db, { poolPubkey, name, organizer });
      return reply.code(201).send({ joinCode, poolPubkey });
    },
  );

  // Resolve join code -> pool.
  app.get<{ Params: { code: string } }>("/j/:code", async (req, reply) => {
    const row = db
      .prepare("SELECT pool_pubkey, name FROM pools WHERE join_code = ?")
      .get(req.params.code.toUpperCase()) as { pool_pubkey: string; name: string } | undefined;
    if (!row) return reply.code(404).send({ error: "unknown join code" });
    return { poolPubkey: row.pool_pubkey, name: row.name };
  });

  // Join roster (off-chain; no on-chain membership per design §6). Idempotent.
  app.post<{ Params: { pubkey: string }; Body: { wallet?: string; emailHint?: string } }>(
    "/pools/:pubkey/join",
    async (req, reply) => {
      const { wallet, emailHint } = req.body ?? {};
      if (!wallet) return reply.code(400).send({ error: "wallet required" });
      const pool = db
        .prepare("SELECT pool_pubkey FROM pools WHERE pool_pubkey = ?")
        .get(req.params.pubkey);
      if (!pool) return reply.code(404).send({ error: "unknown pool" });
      db.prepare(
        `INSERT INTO members (pool_pubkey, wallet, email_hint, joined_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (pool_pubkey, wallet) DO NOTHING`,
      ).run(req.params.pubkey, wallet, emailHint ?? null, Math.floor(Date.now() / 1000));
      return { poolPubkey: req.params.pubkey, wallet };
    },
  );

  app.get<{ Params: { pubkey: string } }>("/pools/:pubkey/members", async (req, reply) => {
    const pool = db
      .prepare("SELECT pool_pubkey FROM pools WHERE pool_pubkey = ?")
      .get(req.params.pubkey);
    if (!pool) return reply.code(404).send({ error: "unknown pool" });
    const members = db
      .prepare(
        "SELECT wallet, email_hint, joined_at FROM members WHERE pool_pubkey = ? ORDER BY joined_at",
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
    if (
      !poolPubkey ||
      !wallet ||
      typeof fixtureId !== "number" ||
      typeof homeGoals !== "number" ||
      typeof awayGoals !== "number" ||
      !saltHex ||
      Buffer.from(saltHex, "hex").length !== 32
    ) {
      return reply
        .code(400)
        .send({ error: "poolPubkey, wallet, fixtureId, homeGoals, awayGoals, saltHex(32B) required" });
    }
    const payload: PickPayload = { homeGoals, awayGoals, saltHex };
    db.prepare(
      `INSERT INTO picks (pool_pubkey, wallet, fixture_id, ciphertext, revealed)
       VALUES (?, ?, ?, ?, 0)
       ON CONFLICT (pool_pubkey, wallet, fixture_id)
       DO UPDATE SET ciphertext = excluded.ciphertext, revealed = 0`,
    ).run(poolPubkey, wallet, fixtureId, encryptPick(payload, pickKey));
    return reply.code(201).send({ ok: true });
  });

  return app;
}
