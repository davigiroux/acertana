import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { openDb, type Db } from "../src/db.js";
import { buildServer } from "../src/server.js";
import type { EntryProvider, RevealedEntry } from "../src/leaderboard.js";
import { ResultsStore } from "../src/results.js";

const KEY = Buffer.alloc(32, 7);
const POOL = "F1xTuReP0oLPubkeyXXXXXXXXXXXXXXXXXXXXXXXXXX";

describe("GET /pools/:pubkey/leaderboard", () => {
  let db: Db;
  let app: FastifyInstance;
  let store: ResultsStore;
  const requestedPools: string[] = [];
  const entries: RevealedEntry[] = [
    { wallet: "Alice", fixtureId: 1, home: 2, away: 1 }, // exact -> 5
    { wallet: "Alice", fixtureId: 2, home: 0, away: 0 }, // draw diff -> 3
    { wallet: "Bob", fixtureId: 1, home: 3, away: 1 }, // winner only -> 1
    { wallet: "Bob", fixtureId: 2, home: 1, away: 0 }, // wrong -> 0
  ];
  const fakeProvider: EntryProvider = {
    async getRevealedEntries(pool) {
      requestedPools.push(pool);
      return entries;
    },
  };

  beforeEach(async () => {
    db = openDb(":memory:");
    store = new ResultsStore(() => 42);
    app = buildServer({ db, pickKey: KEY, entryProvider: fakeProvider, resultsStore: store });
    requestedPools.length = 0;
    await app.inject({
      method: "POST",
      url: "/pools",
      payload: { name: "P", organizer: "O", poolPubkey: POOL },
    });
    for (const wallet of ["Alice", "Bob", "Carol"]) {
      await app.inject({
        method: "POST",
        url: `/pools/${POOL}/join`,
        payload: { wallet, emailHint: `${wallet.toLowerCase()}@ex.com` },
      });
    }
  });

  it("returns standings, updatedAt, provisional", async () => {
    store.apply({ fixtureId: 1, homeGoals: 2, awayGoals: 1, final: true });
    store.apply({ fixtureId: 2, homeGoals: 1, awayGoals: 1, final: false });

    // Member caller (dev mode, no verifier) sees emails.
    const res = await app.inject({ method: "GET", url: `/pools/${POOL}/leaderboard?wallet=Alice` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      updatedAt: 42,
      provisional: true,
      standings: [
        { rank: 1, wallet: "Alice", points: 8, exact: 1, diff: 1, result: 0, scored: 2, email: "alice@ex.com" },
        { rank: 2, wallet: "Bob", points: 1, exact: 0, diff: 0, result: 1, scored: 2, email: "bob@ex.com" },
        { rank: 3, wallet: "Carol", points: 0, exact: 0, diff: 0, result: 0, scored: 0, email: "carol@ex.com" },
      ],
    });
    expect(requestedPools).toEqual([POOL]);

    // Anonymous callers get standings but NO emails (PII gate).
    const anon = await app.inject({ method: "GET", url: `/pools/${POOL}/leaderboard` });
    expect(anon.json().standings.map((s: { email: string | null }) => s.email)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it("provisional flips false once every result is final", async () => {
    store.apply({ fixtureId: 1, homeGoals: 2, awayGoals: 1, final: true });
    store.apply({ fixtureId: 2, homeGoals: 1, awayGoals: 1, final: true });
    const res = await app.inject({ method: "GET", url: `/pools/${POOL}/leaderboard` });
    expect(res.json().provisional).toBe(false);
  });

  it("unknown pool -> 404", async () => {
    const res = await app.inject({ method: "GET", url: "/pools/Nope/leaderboard" });
    expect(res.statusCode).toBe(404);
  });

  it("503 when leaderboard deps are not wired", async () => {
    const bare = buildServer({ db, pickKey: KEY });
    const res = await bare.inject({ method: "GET", url: `/pools/${POOL}/leaderboard` });
    expect(res.statusCode).toBe(503);
  });
});
