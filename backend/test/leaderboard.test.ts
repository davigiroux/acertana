import { describe, it, expect } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  ChainEntryProvider,
  computeStandings,
  decodeEntry,
  ENTRY_ACCOUNT_SIZE,
  ENTRY_POOL_OFFSET,
  type EntryConnection,
  type RevealedEntry,
} from "../src/leaderboard.js";
import { PROGRAM_ID } from "../src/program.js";

describe("computeStandings", () => {
  const results = new Map([
    [1, { home: 2, away: 1 }],
    [2, { home: 0, away: 0 }],
    [3, { home: 1, away: 3 }],
    [4, { home: 1, away: 0 }],
  ]);
  const entries: RevealedEntry[] = [
    // A: 5 + 3 + 1 + 5 = 14 (exact 2, diff 1, result 1)
    { wallet: "A", fixtureId: 1, home: 2, away: 1 },
    { wallet: "A", fixtureId: 2, home: 1, away: 1 },
    { wallet: "A", fixtureId: 3, home: 0, away: 1 },
    { wallet: "A", fixtureId: 4, home: 1, away: 0 },
    // B: 3 + 5 + 5 + 1 = 14 (exact 2, diff 1, result 1) — ties A
    { wallet: "B", fixtureId: 1, home: 1, away: 0 },
    { wallet: "B", fixtureId: 2, home: 0, away: 0 },
    { wallet: "B", fixtureId: 3, home: 1, away: 3 },
    { wallet: "B", fixtureId: 4, home: 3, away: 1 },
    // C: 0 + 0 + 0 = 0, no pick for fixture 4
    { wallet: "C", fixtureId: 1, home: 1, away: 2 },
    { wallet: "C", fixtureId: 2, home: 2, away: 1 },
    { wallet: "C", fixtureId: 3, home: 3, away: 1 },
    // entry for a fixture without a result yet -> ignored
    { wallet: "C", fixtureId: 99, home: 1, away: 1 },
  ];

  it("aggregates points and hit counts, ties share rank", () => {
    const standings = computeStandings(["A", "B", "C"], entries, results);
    expect(standings).toEqual([
      { rank: 1, wallet: "A", points: 14, exact: 2, diff: 1, result: 1, scored: 4 },
      { rank: 1, wallet: "B", points: 14, exact: 2, diff: 1, result: 1, scored: 4 },
      { rank: 3, wallet: "C", points: 0, exact: 0, diff: 0, result: 0, scored: 3 },
    ]);
  });

  it("members with no entries appear at 0; non-member entries ignored", () => {
    const standings = computeStandings(["A", "D"], entries, results);
    expect(standings).toEqual([
      { rank: 1, wallet: "A", points: 14, exact: 2, diff: 1, result: 1, scored: 4 },
      { rank: 2, wallet: "D", points: 0, exact: 0, diff: 0, result: 0, scored: 0 },
    ]);
  });
});

/** Build Entry account bytes with the exact on-chain layout (design §7). */
function entryBytes(fields: {
  pool: PublicKey;
  participant: PublicKey;
  fixtureId: bigint;
  revealed: boolean;
  home: number;
  away: number;
}): Uint8Array {
  const buf = Buffer.alloc(ENTRY_ACCOUNT_SIZE);
  buf.set(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]), 0); // discriminator (opaque)
  buf.set(fields.pool.toBuffer(), ENTRY_POOL_OFFSET);
  buf.set(fields.participant.toBuffer(), 40);
  buf.writeBigUInt64LE(fields.fixtureId, 72);
  buf.set(Buffer.alloc(32, 0xab), 80); // commitment
  buf[112] = fields.revealed ? 1 : 0;
  buf[113] = fields.home;
  buf[114] = fields.away;
  buf[115] = 254; // bump
  return Uint8Array.from(buf);
}

describe("decodeEntry", () => {
  it("round-trips the program's Entry layout", () => {
    const pool = Keypair.generate().publicKey;
    const participant = Keypair.generate().publicKey;
    const decoded = decodeEntry(
      entryBytes({ pool, participant, fixtureId: 1001n, revealed: true, home: 2, away: 1 }),
    );
    expect(decoded).toEqual({
      pool: pool.toBase58(),
      participant: participant.toBase58(),
      fixtureId: 1001,
      commitment: new Uint8Array(32).fill(0xab),
      revealed: true,
      homeGoals: 2,
      awayGoals: 1,
    });
  });

  it("rejects wrong-size accounts", () => {
    expect(() => decodeEntry(new Uint8Array(115))).toThrow(RangeError);
  });
});

describe("ChainEntryProvider", () => {
  it("filters by pool memcmp at offset 8 and returns only revealed entries", async () => {
    const pool = Keypair.generate().publicKey;
    const alice = Keypair.generate().publicKey;
    const bob = Keypair.generate().publicKey;
    const calls: unknown[] = [];
    const fake: EntryConnection = {
      async getProgramAccounts(programId, config) {
        calls.push({ programId: programId.toBase58(), config });
        return [
          { account: { data: entryBytes({ pool, participant: alice, fixtureId: 1n, revealed: true, home: 2, away: 1 }) } },
          { account: { data: entryBytes({ pool, participant: bob, fixtureId: 1n, revealed: false, home: 0, away: 0 }) } },
        ];
      },
    };
    const entries = await new ChainEntryProvider(fake).getRevealedEntries(pool.toBase58());
    expect(entries).toEqual([
      { wallet: alice.toBase58(), fixtureId: 1, home: 2, away: 1 },
    ]);
    expect(calls).toEqual([
      {
        programId: PROGRAM_ID.toBase58(),
        config: {
          filters: [
            { dataSize: ENTRY_ACCOUNT_SIZE },
            { memcmp: { offset: ENTRY_POOL_OFFSET, bytes: pool.toBase58() } },
          ],
        },
      },
    ]);
  });
});
