import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./program.js";
import { scorePick, type Scoreline } from "./scoring.js";

/** A revealed on-chain Entry, projected to what scoring needs. */
export interface RevealedEntry {
  wallet: string; // participant pubkey (base58)
  fixtureId: number;
  home: number;
  away: number;
}

/** Abstracts where revealed entries come from (chain in prod, fakes in tests). */
export interface EntryProvider {
  getRevealedEntries(poolPubkey: string): Promise<RevealedEntry[]>;
}

export interface Standing {
  rank: number; // ties share rank (1,1,3 style)
  wallet: string;
  points: number;
  exact: number; // 5-point hits
  diff: number; // 3-point hits
  result: number; // 1-point hits
  scored: number; // picks scored against a known result
}

/**
 * Pure aggregation: Σ scorePick over each member's revealed entries versus the
 * known final/provisional results. Members without entries still appear at 0.
 */
export function computeStandings(
  members: string[],
  entries: RevealedEntry[],
  results: ReadonlyMap<number, Scoreline>,
): Standing[] {
  const rows = new Map<string, Omit<Standing, "rank">>();
  for (const wallet of members) {
    rows.set(wallet, { wallet, points: 0, exact: 0, diff: 0, result: 0, scored: 0 });
  }
  for (const e of entries) {
    const row = rows.get(e.wallet);
    const result = results.get(e.fixtureId);
    if (!row || !result) continue;
    const score = scorePick({ home: e.home, away: e.away }, result);
    row.points += score;
    row.scored += 1;
    if (score === 5) row.exact += 1;
    else if (score === 3) row.diff += 1;
    else if (score === 1) row.result += 1;
  }
  const sorted = [...rows.values()].sort(
    (a, b) => b.points - a.points || a.wallet.localeCompare(b.wallet),
  );
  let rank = 0;
  return sorted.map((row, i) => {
    if (i === 0 || sorted[i - 1].points !== row.points) rank = i + 1;
    return { rank, ...row };
  });
}

// --- Chain-backed provider (design §4: getProgramAccounts memcmp on Entry.pool) ---

/** Entry account layout (see program docs §7): disc(8) pool(32) participant(32) fixture_id u64 commitment(32) revealed u8 home u8 away u8 bump u8. */
export const ENTRY_ACCOUNT_SIZE = 116;
export const ENTRY_POOL_OFFSET = 8;

export interface DecodedEntry {
  pool: string;
  participant: string;
  fixtureId: number;
  commitment: Uint8Array;
  revealed: boolean;
  homeGoals: number;
  awayGoals: number;
}

export function decodeEntry(data: Uint8Array): DecodedEntry {
  if (data.length !== ENTRY_ACCOUNT_SIZE) {
    throw new RangeError(`Entry account must be ${ENTRY_ACCOUNT_SIZE} bytes, got ${data.length}`);
  }
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  return {
    pool: new PublicKey(buf.subarray(8, 40)).toBase58(),
    participant: new PublicKey(buf.subarray(40, 72)).toBase58(),
    fixtureId: Number(buf.readBigUInt64LE(72)),
    commitment: Uint8Array.from(buf.subarray(80, 112)),
    revealed: buf[112] !== 0,
    homeGoals: buf[113],
    awayGoals: buf[114],
  };
}

/** Minimal slice of web3 Connection so tests can inject a fake. */
export interface EntryConnection {
  getProgramAccounts(
    programId: PublicKey,
    config: {
      filters: ({ dataSize: number } | { memcmp: { offset: number; bytes: string } })[];
    },
  ): Promise<readonly { account: { data: Uint8Array } }[]>;
}

export class ChainEntryProvider implements EntryProvider {
  constructor(
    private readonly connection: EntryConnection,
    private readonly programId: PublicKey = PROGRAM_ID,
  ) {}

  async getRevealedEntries(poolPubkey: string): Promise<RevealedEntry[]> {
    const accounts = await this.connection.getProgramAccounts(this.programId, {
      filters: [
        { dataSize: ENTRY_ACCOUNT_SIZE },
        { memcmp: { offset: ENTRY_POOL_OFFSET, bytes: poolPubkey } },
      ],
    });
    return accounts
      .map(({ account }) => decodeEntry(account.data))
      .filter((e) => e.revealed)
      .map((e) => ({
        wallet: e.participant,
        fixtureId: e.fixtureId,
        home: e.homeGoals,
        away: e.awayGoals,
      }));
  }
}
