import { Connection } from "@solana/web3.js";
import { openDb } from "./db.js";
import { loadKey } from "./crypto.js";
import { buildServer } from "./server.js";
import { ChainEntryProvider } from "./leaderboard.js";
import { ResultsStore } from "./results.js";
import { loadFixtures, scoreEvents } from "./txline/stub.js";
import { TxlineClient } from "./txline/client.js";
import { loadFixtureAuthority, sendViaConnection } from "./fixtureAuthority.js";
import { runRevealWorker } from "./revealWorker.js";

const connection = new Connection(process.env.RPC_URL ?? "http://127.0.0.1:8899", "confirmed");
const resultsStore = new ResultsStore();
// Score feed precedence: opt-in stub for local dev; else the real TxLINE SSE
// stream when an API token is configured (mint one with `npm run
// txline-subscribe`); else the store starts empty (leaderboard shows zeros).
if (process.env.TXLINE_STUB === "1") {
  resultsStore.consume(scoreEvents()).catch((err) => console.error("score feed failed", err));
} else if (process.env.TXLINE_API_TOKEN) {
  const txline = new TxlineClient({
    apiOrigin: process.env.TXLINE_API_ORIGIN ?? "https://txline-dev.txodds.com",
    apiToken: process.env.TXLINE_API_TOKEN,
    competitionId: process.env.TXLINE_COMPETITION_ID
      ? Number(process.env.TXLINE_COMPETITION_ID)
      : undefined,
  });
  resultsStore
    .consume(txline.scoreEvents())
    .catch((err) => console.error("txline score feed failed", err));
}

const db = openDb();
const pickKey = loadKey();
const app = buildServer({
  db,
  pickKey,
  entryProvider: new ChainEntryProvider({
    getProgramAccounts: (programId, config) => connection.getProgramAccounts(programId, config),
  }),
  resultsStore,
});

// Auto-reveal worker (design §2): decrypt stored picks past kickoff and submit
// permissionless reveal_pick txs on an interval.
// TODO: dedicated reveal fee payer; reuses the fixture-authority keypair for now.
const kickoffs = new Map(loadFixtures().map((f) => [f.fixtureId, f.kickoffTs]));
const revealDeps = {
  db,
  key: pickKey,
  payer: loadFixtureAuthority(),
  send: sendViaConnection(connection),
  kickoffOf: (fixtureId: number) => kickoffs.get(fixtureId),
};
const revealIntervalMs = Number(process.env.REVEAL_INTERVAL_MS ?? 60_000);
setInterval(() => {
  runRevealWorker(revealDeps, Math.floor(Date.now() / 1000))
    .then((n) => n > 0 && console.log(`revealed ${n} picks`))
    .catch((err) => console.error("reveal worker failed", err));
}, revealIntervalMs);

const port = Number(process.env.PORT ?? 8787);
app
  .listen({ port, host: "0.0.0.0" })
  .then((addr) => console.log(`acertana backend listening on ${addr}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
