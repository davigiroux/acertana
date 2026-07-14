import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { openDb, type Db } from "../src/db.js";
import { buildServer } from "../src/server.js";
import type { EntryProvider, RevealedEntry } from "../src/leaderboard.js";
import { ResultsStore } from "../src/results.js";

const KEY = Buffer.alloc(32, 7);
const POOL = "F1xTuReP0oLPubkeyXXXXXXXXXXXXXXXXXXXXXXXXXX";

describe("GET /pools/:pubkey/picks", () => {
  let db: Db;
  let app: FastifyInstance;
  let store: ResultsStore;
  const entries: RevealedEntry[] = [
    { wallet: "Alice", fixtureId: 1, home: 2, away: 1 }, // exact -> 5
    { wallet: "Bob", fixtureId: 1, home: 3, away: 1 }, // winner only -> 1
    { wallet: "Alice", fixtureId: 2, home: 0, away: 0 }, // no result yet
    { wallet: "Mallory", fixtureId: 1, home: 2, away: 1 }, // not a member
  ];
  const fakeProvider: EntryProvider = {
    async getRevealedEntries() {
      return entries;
    },
  };

  beforeEach(async () => {
    db = openDb(":memory:");
    store = new ResultsStore(() => 42);
    app = buildServer({ db, pickKey: KEY, entryProvider: fakeProvider, resultsStore: store });
    await app.inject({
      method: "POST",
      url: "/pools",
      payload: { name: "P", organizer: "O", poolPubkey: POOL },
    });
    for (const wallet of ["Alice", "Bob"]) {
      await app.inject({
        method: "POST",
        url: `/pools/${POOL}/join`,
        payload: { wallet, emailHint: `${wallet.toLowerCase()}@ex.com` },
      });
    }
  });

  it("groups revealed picks by fixture with result and points", async () => {
    store.apply({ fixtureId: 1, homeGoals: 2, awayGoals: 1, final: true });

    const res = await app.inject({ method: "GET", url: `/pools/${POOL}/picks?wallet=Alice` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      fixtures: [
        {
          fixtureId: 1,
          result: { home: 2, away: 1, final: true },
          picks: [
            { wallet: "Alice", email: "alice@ex.com", home: 2, away: 1, points: 5 },
            { wallet: "Bob", email: "bob@ex.com", home: 3, away: 1, points: 1 },
          ],
        },
        {
          fixtureId: 2,
          result: null,
          picks: [{ wallet: "Alice", email: "alice@ex.com", home: 0, away: 0, points: null }],
        },
      ],
    });
  });

  it("hides emails from anonymous callers", async () => {
    const res = await app.inject({ method: "GET", url: `/pools/${POOL}/picks` });
    const emails = res
      .json()
      .fixtures.flatMap((f: { picks: { email: string | null }[] }) => f.picks.map((p) => p.email));
    expect(emails.every((e: string | null) => e === null)).toBe(true);
  });

  it("excludes entries from non-members", async () => {
    const res = await app.inject({ method: "GET", url: `/pools/${POOL}/picks` });
    const wallets = res
      .json()
      .fixtures.flatMap((f: { picks: { wallet: string }[] }) => f.picks.map((p) => p.wallet));
    expect(wallets).not.toContain("Mallory");
  });

  it("unknown pool -> 404; unwired deps -> 503", async () => {
    expect((await app.inject({ method: "GET", url: "/pools/Nope/picks" })).statusCode).toBe(404);
    const bare = buildServer({ db, pickKey: KEY });
    expect((await bare.inject({ method: "GET", url: `/pools/${POOL}/picks` })).statusCode).toBe(503);
  });
});
