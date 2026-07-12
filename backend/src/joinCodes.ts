import { randomInt } from "node:crypto";
import type { Db } from "./db.js";

/** Unambiguous alphabet: no 0/O, 1/I/L, or lowercase. */
export const JOIN_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const JOIN_CODE_LENGTH = 6;

export function generateJoinCode(): string {
  let code = "";
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Insert a pool with a fresh join code, retrying on the (astronomically rare)
 * join-code collision. Throws on pool_pubkey conflict.
 */
export function insertPoolWithJoinCode(
  db: Db,
  pool: { poolPubkey: string; name: string; organizer: string },
): string {
  const stmt = db.prepare(
    "INSERT INTO pools (pool_pubkey, join_code, name, organizer) VALUES (?, ?, ?, ?)",
  );
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateJoinCode();
    try {
      stmt.run(pool.poolPubkey, code, pool.name, pool.organizer);
      return code;
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e.code === "SQLITE_CONSTRAINT_UNIQUE" && e.message?.includes("join_code")) {
        continue; // collision: retry with a new code
      }
      throw err;
    }
  }
  throw new Error("could not allocate a unique join code");
}
