import { describe, it, expect } from "vitest";
import { generateJoinCode, insertPoolWithJoinCode, JOIN_CODE_ALPHABET } from "../src/joinCodes.js";
import { openDb } from "../src/db.js";

describe("joinCodes", () => {
  it("generates 6-char codes from the unambiguous alphabet", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateJoinCode();
      expect(code).toHaveLength(6);
      for (const c of code) expect(JOIN_CODE_ALPHABET).toContain(c);
    }
  });

  it("inserts pools with unique codes", () => {
    const db = openDb(":memory:");
    const codes = new Set<string>();
    for (let i = 0; i < 20; i++) {
      codes.add(insertPoolWithJoinCode(db, { poolPubkey: `pool${i}`, name: "n", organizer: "o" }));
    }
    expect(codes.size).toBe(20);
  });
});
