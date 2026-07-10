import { keccak_256 } from "@noble/hashes/sha3.js";
import { PublicKey } from "@solana/web3.js";

export const SALT_DOMAIN_PREFIX = "acertana:v1";
export const SALT_MESSAGE_LENGTH = SALT_DOMAIN_PREFIX.length + 32 + 8; // 11 + 32 + 8 = 51

/**
 * Build the domain-separated message a wallet signs to derive a pick salt:
 * utf8("acertana:v1") ‖ pool pubkey bytes (32) ‖ fixtureId as u64 LE (8).
 */
export function buildSaltMessage(pool: string, fixtureId: bigint): Uint8Array {
  if (fixtureId < 0n || fixtureId > 0xffffffffffffffffn) {
    throw new RangeError(`fixtureId must fit in u64, got ${fixtureId}`);
  }
  const prefix = new TextEncoder().encode(SALT_DOMAIN_PREFIX);
  const poolBytes = new PublicKey(pool).toBytes();
  const message = new Uint8Array(prefix.length + 32 + 8);
  message.set(prefix, 0);
  message.set(poolBytes, prefix.length);
  new DataView(message.buffer).setBigUint64(prefix.length + 32, fixtureId, true);
  return message;
}

/**
 * Derive a deterministic 32-byte salt for a (pool, fixture) pick by asking
 * the wallet to sign the domain-separated message and hashing the signature.
 * Same inputs → same salt; different fixtures → distinct salts.
 */
export async function deriveSalt(
  signMessage: (msg: Uint8Array) => Promise<Uint8Array>,
  pool: string,
  fixtureId: bigint,
): Promise<Uint8Array> {
  const signature = await signMessage(buildSaltMessage(pool, fixtureId));
  return keccak_256(signature);
}
