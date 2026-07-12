import { createHash } from "node:crypto";
import { keccak_256 } from "@noble/hashes/sha3.js";
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";

/** Manual Anchor instruction building for the Acertana program (no anchor dep). */
export const PROGRAM_ID = new PublicKey("9hhdvFyxcW95p3bJMUij5Bsq1rrURK4EfTSjqYv4T5zn");

export function anchorDiscriminator(ixName: string): Buffer {
  return createHash("sha256").update(`global:${ixName}`).digest().subarray(0, 8);
}

function u64le(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
}

function i64le(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigInt64LE(n);
  return b;
}

export function fixturePda(fixtureId: bigint): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("fixture"), u64le(fixtureId)],
    PROGRAM_ID,
  )[0];
}

export function poolPda(organizer: PublicKey, poolId: bigint): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool"), organizer.toBuffer(), u64le(poolId)],
    PROGRAM_ID,
  )[0];
}

export function entryPda(pool: PublicKey, participant: PublicKey, fixtureId: bigint): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("entry"), pool.toBuffer(), participant.toBuffer(), u64le(fixtureId)],
    PROGRAM_ID,
  )[0];
}

/**
 * Compute the pick commitment exactly as the program's `reveal_pick` does:
 * keccak256 over the 34-byte preimage [home_u8, away_u8, ...salt(32)].
 * (Duplicated from app/src/lib/commitment — keep in sync.)
 */
export function computeCommitment(homeGoals: number, awayGoals: number, salt: Uint8Array): Uint8Array {
  if (salt.length !== 32) throw new RangeError("salt must be 32 bytes");
  const preimage = new Uint8Array(34);
  preimage[0] = homeGoals;
  preimage[1] = awayGoals;
  preimage.set(salt, 2);
  return keccak_256(preimage);
}

export function registerFixtureIx(
  authority: PublicKey,
  fixtureId: bigint,
  kickoffTs: bigint,
): TransactionInstruction {
  const data = Buffer.concat([
    anchorDiscriminator("register_fixture"),
    u64le(fixtureId),
    i64le(kickoffTs),
  ]);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: fixturePda(fixtureId), isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function createPoolIx(
  organizer: PublicKey,
  poolId: bigint,
  name: string,
): TransactionInstruction {
  const nameBytes = Buffer.from(name, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(nameBytes.length);
  const data = Buffer.concat([
    anchorDiscriminator("create_pool"),
    u64le(poolId),
    len,
    nameBytes,
  ]);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: poolPda(organizer, poolId), isSigner: false, isWritable: true },
      { pubkey: organizer, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function commitPickIx(
  pool: PublicKey,
  participant: PublicKey,
  fixtureId: bigint,
  commitment: Uint8Array,
): TransactionInstruction {
  const data = Buffer.concat([
    anchorDiscriminator("commit_pick"),
    u64le(fixtureId),
    Buffer.from(commitment),
  ]);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: pool, isSigner: false, isWritable: false },
      { pubkey: fixturePda(fixtureId), isSigner: false, isWritable: false },
      { pubkey: entryPda(pool, participant, fixtureId), isSigner: false, isWritable: true },
      { pubkey: participant, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function revealPickIx(
  pool: PublicKey,
  participant: PublicKey,
  fixtureId: bigint,
  homeGoals: number,
  awayGoals: number,
  salt: Uint8Array,
): TransactionInstruction {
  const data = Buffer.concat([
    anchorDiscriminator("reveal_pick"),
    Buffer.from([homeGoals, awayGoals]),
    Buffer.from(salt),
  ]);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: fixturePda(fixtureId), isSigner: false, isWritable: false },
      { pubkey: entryPda(pool, participant, fixtureId), isSigner: false, isWritable: true },
    ],
    data,
  });
}

/** Byte offset of `revealed: bool` in the Entry account (disc+pool+participant+fixture_id+commitment). */
export const ENTRY_REVEALED_OFFSET = 8 + 32 + 32 + 8 + 32;
