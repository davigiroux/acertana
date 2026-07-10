import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM at-rest encryption for pick payloads (plaintext scoreline + salt).
 * Key: env PICK_STORE_KEY, 32-byte hex.
 */
export function loadKey(hex = process.env.PICK_STORE_KEY): Buffer {
  if (!hex) throw new Error("PICK_STORE_KEY env var is required (32-byte hex)");
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) throw new Error("PICK_STORE_KEY must be 32 bytes of hex");
  return key;
}

/** Returns base64 of iv(12) ‖ authTag(16) ‖ ciphertext. */
export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decrypt(payload: string, key: Buffer): string {
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

/** Pick payload stored (encrypted) so the backend can auto-reveal after kickoff. */
export interface PickPayload {
  homeGoals: number;
  awayGoals: number;
  saltHex: string; // 32 bytes hex
}

export function encryptPick(payload: PickPayload, key: Buffer): string {
  return encrypt(JSON.stringify(payload), key);
}

export function decryptPick(ciphertext: string, key: Buffer): PickPayload {
  return JSON.parse(decrypt(ciphertext, key)) as PickPayload;
}
