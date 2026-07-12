import { describe, it, expect } from "vitest";
import { scorePick } from "../src/scoring.js";

describe("scorePick", () => {
  it.each([
    // exact = 5
    { pick: [2, 1], result: [2, 1], score: 5 },
    { pick: [0, 0], result: [0, 0], score: 5 },
    { pick: [0, 3], result: [0, 3], score: 5 },
    // correct winner + goal diff = 3
    { pick: [2, 1], result: [1, 0], score: 3 },
    { pick: [3, 1], result: [2, 0], score: 3 },
    { pick: [0, 2], result: [1, 3], score: 3 },
    // draw edge: predicted draw + actual draw, different score -> both diffs 0 -> 3
    { pick: [0, 0], result: [1, 1], score: 3 },
    { pick: [2, 2], result: [0, 0], score: 3 },
    // correct winner/draw only = 1
    { pick: [2, 1], result: [3, 1], score: 1 },
    { pick: [1, 0], result: [4, 1], score: 1 },
    { pick: [0, 1], result: [1, 3], score: 1 },
    // wrong result = 0
    { pick: [2, 1], result: [1, 2], score: 0 },
    { pick: [1, 1], result: [1, 0], score: 0 },
    { pick: [0, 2], result: [2, 2], score: 0 },
    { pick: [2, 0], result: [0, 0], score: 0 },
  ])("pick $pick vs result $result -> $score", ({ pick, result, score }) => {
    expect(
      scorePick({ home: pick[0], away: pick[1] }, { home: result[0], away: result[1] }),
    ).toBe(score);
  });
});
