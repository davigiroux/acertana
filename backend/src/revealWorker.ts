import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import type { Db } from "./db.js";
import { decryptPick } from "./crypto.js";
import { revealPickIx } from "./program.js";
import type { SendTransaction } from "./fixtureAuthority.js";

export interface RevealWorkerDeps {
  db: Db;
  key: Buffer; // PICK_STORE_KEY
  payer: Keypair; // fee payer for the permissionless reveal txs
  send: SendTransaction;
  /** fixture_id -> kickoff unix ts */
  kickoffOf: (fixtureId: number) => number | undefined;
}

interface PickRow {
  pool_pubkey: string;
  wallet: string;
  fixture_id: number;
  ciphertext: string;
}

/**
 * Auto-reveal (design §2): find unrevealed picks whose fixture has kicked off,
 * decrypt the stored plaintext+salt, submit a permissionless reveal_pick tx,
 * mark the row revealed. Returns the number of picks revealed.
 */
export async function runRevealWorker(deps: RevealWorkerDeps, nowTs: number): Promise<number> {
  const rows = deps.db
    .prepare("SELECT pool_pubkey, wallet, fixture_id, ciphertext FROM picks WHERE revealed = 0")
    .all() as PickRow[];
  const markRevealed = deps.db.prepare(
    "UPDATE picks SET revealed = 1 WHERE pool_pubkey = ? AND wallet = ? AND fixture_id = ?",
  );

  let revealed = 0;
  for (const row of rows) {
    const kickoff = deps.kickoffOf(row.fixture_id);
    if (kickoff === undefined || nowTs < kickoff) continue;

    const pick = decryptPick(row.ciphertext, deps.key);
    const tx = new Transaction().add(
      revealPickIx(
        new PublicKey(row.pool_pubkey),
        new PublicKey(row.wallet),
        BigInt(row.fixture_id),
        pick.homeGoals,
        pick.awayGoals,
        Buffer.from(pick.saltHex, "hex"),
      ),
    );
    tx.feePayer = deps.payer.publicKey;
    await deps.send(tx, [deps.payer]);
    markRevealed.run(row.pool_pubkey, row.wallet, row.fixture_id);
    revealed++;
  }
  return revealed;
}
