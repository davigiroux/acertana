import { describe, it, expect } from "vitest";
import { encrypt, decrypt, encryptPick, decryptPick, loadKey } from "../src/crypto.js";

describe("crypto", () => {
  const key = Buffer.alloc(32, 1);

  it("round-trips", () => {
    const ct = encrypt("hello world", key);
    expect(decrypt(ct, key)).toBe("hello world");
  });

  it("pick payload round-trips", () => {
    const payload = { homeGoals: 2, awayGoals: 1, saltHex: "ab".repeat(32) };
    expect(decryptPick(encryptPick(payload, key), key)).toEqual(payload);
  });

  it("wrong key fails", () => {
    const ct = encrypt("secret", key);
    expect(() => decrypt(ct, Buffer.alloc(32, 2))).toThrow();
  });

  it("loadKey validates length", () => {
    expect(() => loadKey("abcd")).toThrow();
    expect(loadKey("00".repeat(32))).toHaveLength(32);
  });
});
