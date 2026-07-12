import { keccak_256 } from "@noble/hashes/sha3.js";

export const SALT_LENGTH = 32;
export const PREIMAGE_LENGTH = 2 + SALT_LENGTH; // home_u8 ‖ away_u8 ‖ salt

function assertGoals(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new RangeError(`${label} must be an integer in 0..=255, got ${value}`);
  }
}

/**
 * Compute the pick commitment exactly as the Acertana program's
 * `reveal_pick` does: keccak256 over the 34-byte preimage
 * `[home_u8, away_u8, ...salt(32)]`.
 */
export function computeCommitment(
  homeGoals: number,
  awayGoals: number,
  salt: Uint8Array,
): Uint8Array {
  assertGoals(homeGoals, "homeGoals");
  assertGoals(awayGoals, "awayGoals");
  if (salt.length !== SALT_LENGTH) {
    throw new RangeError(`salt must be ${SALT_LENGTH} bytes, got ${salt.length}`);
  }
  const preimage = new Uint8Array(PREIMAGE_LENGTH);
  preimage[0] = homeGoals;
  preimage[1] = awayGoals;
  preimage.set(salt, 2);
  return keccak_256(preimage);
}
