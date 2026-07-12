import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Keypair, Transaction, SystemProgram } from "@solana/web3.js";
import { start, Clock } from "solana-bankrun";
import { openDb } from "../src/db.js";
import { encryptPick } from "../src/crypto.js";
import {
  PROGRAM_ID,
  poolPda,
  entryPda,
  computeCommitment,
  createPoolIx,
  commitPickIx,
  ENTRY_REVEALED_OFFSET,
} from "../src/program.js";
import { loadFixtureAuthority, buildRegisterFixtureTx } from "../src/fixtureAuthority.js";
import { runRevealWorker } from "../src/revealWorker.js";
import type { SendTransaction } from "../src/fixtureAuthority.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("revealWorker against the real program (bankrun)", () => {
  it("registers fixture, commits, warps past kickoff, auto-reveals on-chain", async () => {
    const authority = loadFixtureAuthority(path.join(ROOT, "tests/fixtures/fixture-authority.json"));
    const participant = Keypair.generate();
    const lamports = 10_000_000_000n;
    const sysAccount = {
      lamports: Number(lamports),
      data: Buffer.alloc(0),
      owner: SystemProgram.programId,
      executable: false,
    };

    process.env.SBF_OUT_DIR = path.join(ROOT, "target/deploy");
    const context = await start(
      [{ name: "acertana", programId: PROGRAM_ID }],
      [
        { address: authority.publicKey, info: sysAccount },
        { address: participant.publicKey, info: sysAccount },
      ],
    );
    const client = context.banksClient;

    const send: SendTransaction = async (tx: Transaction, signers: Keypair[]) => {
      tx.recentBlockhash = context.lastBlockhash;
      tx.sign(...signers);
      await client.processTransaction(tx);
      return "sig";
    };

    const startClock = await client.getClock();
    const kickoffTs = Number(startClock.unixTimestamp) + 3600;
    const fixtureId = 1001;

    // 1. Register fixture (fixture-authority-signed, from seed-shaped data).
    await send(
      buildRegisterFixtureTx(authority, { fixtureId, home: "Mexico", away: "Poland", kickoffTs }),
      [authority],
    );

    // 2. Create pool.
    const poolId = 1n;
    const pool = poolPda(participant.publicKey, poolId);
    const createTx = new Transaction().add(createPoolIx(participant.publicKey, poolId, "Amigos"));
    createTx.feePayer = participant.publicKey;
    await send(createTx, [participant]);

    // 3. Commit a pick (same keccak commitment helper as the app).
    const salt = Buffer.alloc(32, 0x42);
    const commitment = computeCommitment(2, 1, salt);
    const commitTx = new Transaction().add(
      commitPickIx(pool, participant.publicKey, BigInt(fixtureId), commitment),
    );
    commitTx.feePayer = participant.publicKey;
    await send(commitTx, [participant]);

    // 4. Store the encrypted pick like POST /picks would.
    const db = openDb(":memory:");
    const key = Buffer.alloc(32, 9);
    db.prepare(
      "INSERT INTO picks (pool_pubkey, wallet, fixture_id, ciphertext, revealed) VALUES (?, ?, ?, ?, 0)",
    ).run(
      pool.toBase58(),
      participant.publicKey.toBase58(),
      fixtureId,
      encryptPick({ homeGoals: 2, awayGoals: 1, saltHex: salt.toString("hex") }, key),
    );

    // 5. Before kickoff: worker does nothing.
    const payer = authority;
    const deps = { db, key, payer, send, kickoffOf: () => kickoffTs };
    expect(await runRevealWorker(deps, kickoffTs - 10)).toBe(0);

    // 6. Warp the bank clock past kickoff and run the worker.
    context.setClock(
      new Clock(
        startClock.slot,
        startClock.epochStartTimestamp,
        startClock.epoch,
        startClock.leaderScheduleEpoch,
        BigInt(kickoffTs + 5),
      ),
    );
    expect(await runRevealWorker(deps, kickoffTs + 5)).toBe(1);

    // 7. Entry revealed on-chain with the plaintext scoreline.
    const entry = await client.getAccount(entryPda(pool, participant.publicKey, BigInt(fixtureId)));
    expect(entry).not.toBeNull();
    const data = Buffer.from(entry!.data);
    expect(data[ENTRY_REVEALED_OFFSET]).toBe(1); // revealed = true
    expect(data[ENTRY_REVEALED_OFFSET + 1]).toBe(2); // home_goals
    expect(data[ENTRY_REVEALED_OFFSET + 2]).toBe(1); // away_goals

    // 8. DB row marked revealed; a second run is a no-op.
    const row = db.prepare("SELECT revealed FROM picks").get() as { revealed: number };
    expect(row.revealed).toBe(1);
    expect(await runRevealWorker(deps, kickoffTs + 10)).toBe(0);
  }, 60_000);
});

describe("revealWorker error isolation (mock send)", () => {
  const KEY = Buffer.alloc(32, 9);
  const KICKOFF = 1_000;

  function seedDb(wallets: string[]) {
    const db = openDb(":memory:");
    const insert = db.prepare(
      "INSERT INTO picks (pool_pubkey, wallet, fixture_id, ciphertext, revealed) VALUES (?, ?, ?, ?, 0)",
    );
    // Real base58 pubkeys required by revealPickIx.
    const pool = Keypair.generate().publicKey.toBase58();
    for (const w of wallets) {
      insert.run(pool, w, 1001, encryptPick({ homeGoals: 2, awayGoals: 1, saltHex: "42".repeat(32) }, KEY));
    }
    return { db, pool };
  }

  it("a poison row does not block later rows", async () => {
    const w1 = Keypair.generate().publicKey.toBase58();
    const w2 = Keypair.generate().publicKey.toBase58();
    const { db } = seedDb([w1, w2]);
    let sent = 0;
    const send: SendTransaction = async () => {
      // Fail only the first row's tx.
      if (sent++ === 0) throw new Error("Transaction simulation failed: missing Entry PDA");
      return "sig";
    };
    const deps = { db, key: KEY, payer: Keypair.generate(), send, kickoffOf: () => KICKOFF };
    expect(await runRevealWorker(deps, KICKOFF + 1)).toBe(1);
    const rows = db.prepare("SELECT wallet, revealed FROM picks ORDER BY rowid").all() as {
      wallet: string;
      revealed: number;
    }[];
    expect(rows[0].revealed).toBe(0); // poison row stays unrevealed
    expect(rows[1].revealed).toBe(1); // later row still processed
  });

  it("AlreadyRevealed error marks the row revealed (chain is source of truth)", async () => {
    const w = Keypair.generate().publicKey.toBase58();
    const { db } = seedDb([w]);
    const send: SendTransaction = async () => {
      throw new Error("custom program error: AlreadyRevealed (6004)");
    };
    const deps = { db, key: KEY, payer: Keypair.generate(), send, kickoffOf: () => KICKOFF };
    expect(await runRevealWorker(deps, KICKOFF + 1)).toBe(0);
    const row = db.prepare("SELECT revealed FROM picks").get() as { revealed: number };
    expect(row.revealed).toBe(1);
  });
});
