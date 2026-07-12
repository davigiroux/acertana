import { Connection } from "@solana/web3.js";
import { openDb } from "./db.js";
import { loadKey } from "./crypto.js";
import { buildServer } from "./server.js";
import { ChainEntryProvider } from "./leaderboard.js";
import { ResultsStore } from "./results.js";
import { scoreEvents } from "./txline/stub.js";

const connection = new Connection(process.env.RPC_URL ?? "http://127.0.0.1:8899", "confirmed");
const resultsStore = new ResultsStore();
// Stub feed for now; real TxLINE SSE stream later (resume via last-event-id).
resultsStore.consume(scoreEvents()).catch((err) => console.error("score feed failed", err));

const app = buildServer({
  db: openDb(),
  pickKey: loadKey(),
  entryProvider: new ChainEntryProvider({
    getProgramAccounts: (programId, config) => connection.getProgramAccounts(programId, config),
  }),
  resultsStore,
});
const port = Number(process.env.PORT ?? 8787);
app
  .listen({ port, host: "0.0.0.0" })
  .then((addr) => console.log(`acertana backend listening on ${addr}`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
