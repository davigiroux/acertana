/**
 * Client-side Anchor instruction building for the Acertana program.
 * Mirrors backend/src/program.ts (keep in sync) but browser-safe:
 * sha256 from @noble/hashes instead of node:crypto.
 */
import { Buffer } from 'buffer';
import { sha256 } from '@noble/hashes/sha2.js';
import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';

export const PROGRAM_ID = new PublicKey('9hhdvFyxcW95p3bJMUij5Bsq1rrURK4EfTSjqYv4T5zn');

export function anchorDiscriminator(ixName: string): Buffer {
  return Buffer.from(sha256(new TextEncoder().encode(`global:${ixName}`)).subarray(0, 8));
}

function u64le(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n);
  return b;
}

export function fixturePda(fixtureId: bigint): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('fixture'), u64le(fixtureId)],
    PROGRAM_ID,
  )[0];
}

export function entryPda(
  pool: PublicKey,
  participant: PublicKey,
  fixtureId: bigint,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('entry'), pool.toBuffer(), participant.toBuffer(), u64le(fixtureId)],
    PROGRAM_ID,
  )[0];
}

export function poolPda(organizer: PublicKey, poolId: bigint): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('pool'), organizer.toBuffer(), u64le(poolId)],
    PROGRAM_ID,
  )[0];
}

export function createPoolIx(
  organizer: PublicKey,
  poolId: bigint,
  name: string,
): TransactionInstruction {
  const nameBytes = Buffer.from(name, 'utf8');
  if (nameBytes.length > 32) throw new RangeError('pool name exceeds 32 bytes');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(nameBytes.length);
  const data = Buffer.concat([anchorDiscriminator('create_pool'), u64le(poolId), len, nameBytes]);
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
    anchorDiscriminator('commit_pick'),
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

/** Entry account layout (programs/acertana/src/lib.rs `Entry`). */
export interface EntryState {
  revealed: boolean;
  homeGoals: number;
  awayGoals: number;
}

const ENTRY_REVEALED_OFFSET = 8 + 32 + 32 + 8 + 32; // disc+pool+participant+fixture_id+commitment

export function decodeEntry(data: Uint8Array): EntryState {
  if (data.length < ENTRY_REVEALED_OFFSET + 3) {
    throw new RangeError(`Entry account too small: ${data.length} bytes`);
  }
  return {
    revealed: data[ENTRY_REVEALED_OFFSET] === 1,
    homeGoals: data[ENTRY_REVEALED_OFFSET + 1],
    awayGoals: data[ENTRY_REVEALED_OFFSET + 2],
  };
}
