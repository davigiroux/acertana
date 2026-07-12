import { keccak_256 } from "@noble/hashes/sha3.js";
import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { buildSaltMessage, deriveSalt, SALT_MESSAGE_LENGTH } from "./salt";

const POOL = "9hhdvFyxcW95p3bJMUij5Bsq1rrURK4EfTSjqYv4T5zn";
const OTHER_POOL = "H83TTjZvtwWBVc18F3R3CecctPun6YcFv26UKTy9ozFk";

// Fake deterministic wallet: "signature" = keccak of the message, twice over.
const fakeSignMessage = async (msg: Uint8Array): Promise<Uint8Array> => {
  const h = keccak_256(msg);
  const sig = new Uint8Array(64);
  sig.set(h, 0);
  sig.set(h, 32);
  return sig;
};

describe("buildSaltMessage", () => {
  it("lays out prefix(11) ‖ pool(32) ‖ fixtureId u64 LE (51 bytes)", () => {
    const fixtureId = 0x0102030405060708n;
    const msg = buildSaltMessage(POOL, fixtureId);
    expect(msg).toHaveLength(SALT_MESSAGE_LENGTH);
    expect(msg).toHaveLength(51);
    expect(new TextDecoder().decode(msg.slice(0, 11))).toBe("acertana:v1");
    expect(msg.slice(11, 43)).toEqual(new PublicKey(POOL).toBytes());
    // little-endian u64
    expect(Array.from(msg.slice(43))).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
  });

  it("rejects fixtureId outside u64", () => {
    expect(() => buildSaltMessage(POOL, -1n)).toThrow(RangeError);
    expect(() => buildSaltMessage(POOL, 1n << 64n)).toThrow(RangeError);
  });
});

describe("deriveSalt", () => {
  it("is deterministic for the same (pool, fixture)", async () => {
    const a = await deriveSalt(fakeSignMessage, POOL, 42n);
    const b = await deriveSalt(fakeSignMessage, POOL, 42n);
    expect(a).toHaveLength(32);
    expect(a).toEqual(b);
  });

  it("differs across fixtureIds", async () => {
    const a = await deriveSalt(fakeSignMessage, POOL, 42n);
    const b = await deriveSalt(fakeSignMessage, POOL, 43n);
    expect(a).not.toEqual(b);
  });

  it("differs across pools", async () => {
    const a = await deriveSalt(fakeSignMessage, POOL, 42n);
    const b = await deriveSalt(fakeSignMessage, OTHER_POOL, 42n);
    expect(a).not.toEqual(b);
  });

  it("returns keccak256 of the wallet signature", async () => {
    const msg = buildSaltMessage(POOL, 7n);
    const expected = keccak_256(await fakeSignMessage(msg));
    expect(await deriveSalt(fakeSignMessage, POOL, 7n)).toEqual(expected);
  });
});
