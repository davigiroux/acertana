import { Connection, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { openDb } from "./db.js";
import { loadKey } from "./crypto.js";
import { buildServer } from "./server.js";
import { ChainEntryProvider } from "./leaderboard.js";
import { ResultsStore } from "./results.js";
import { loadFixtures, scoreEvents } from "./txline/stub.js";
import { TxlineClient } from "./txline/client.js";
import { kickoffOf, upsertFixtures } from "./fixtureSync.js";
import { privyWalletVerifier } from "./auth.js";
import { loadFixtureAuthority, sendViaConnection } from "./fixtureAuthority.js";
import { runRevealWorker } from "./revealWorker.js";

const connection = new Connection(process.env.RPC_URL ?? "http://127.0.0.1:8899", "confirmed");
const resultsStore = new ResultsStore();
const db = openDb();

let txline: TxlineClient | undefined;
// Score feed precedence: opt-in stub for local dev; else the real TxLINE SSE
// stream when an API token is configured (mint one with `npm run
// txline-subscribe`); else the store starts empty (leaderboard shows zeros).
if (process.env.TXLINE_STUB === "1") {
  // Local dev: seed the fixtures table + fake score feed from the seed json.
  upsertFixtures(db, loadFixtures(), Math.floor(Date.now() / 1000));
  resultsStore.consume(scoreEvents()).catch((err) => console.error("score feed failed", err));
} else if (process.env.TXLINE_API_TOKEN) {
  txline = new TxlineClient({
    apiOrigin: process.env.TXLINE_API_ORIGIN ?? "https://txline-dev.txodds.com",
    apiToken: process.env.TXLINE_API_TOKEN,
    competitionId: process.env.TXLINE_COMPETITION_ID
      ? Number(process.env.TXLINE_COMPETITION_ID)
      : undefined,
  });
  resultsStore
    .consume(txline.scoreEvents())
    .catch((err) => console.error("txline score feed failed", err));

  // Periodic fixtures sync from TxLINE into the DB (API + reveal worker source).
  // On-chain registration of new fixtures runs from registerFixtures CLI or here.
  const syncFixtures = async () => {
    const fixtures = await txline!.fetchFixtures();
    upsertFixtures(db, fixtures, Math.floor(Date.now() / 1000));
    console.log(`synced ${fixtures.length} fixtures from txline`);
  };
  syncFixtures().catch((err) => console.error("fixture sync failed", err));
  setInterval(
    () => syncFixtures().catch((err) => console.error("fixture sync failed", err)),
    Number(process.env.FIXTURE_SYNC_INTERVAL_MS ?? 6 * 3600_000),
  );
}

const pickKey = loadKey();
// Fail closed: without Privy creds the server refuses to start unless local
// dev explicitly opts out with ALLOW_UNAUTHENTICATED=1.
const verifyWallet =
  process.env.PRIVY_APP_ID && process.env.PRIVY_APP_SECRET
    ? privyWalletVerifier(process.env.PRIVY_APP_ID, process.env.PRIVY_APP_SECRET)
    : undefined;
if (!verifyWallet) {
  if (process.env.ALLOW_UNAUTHENTICATED !== "1") {
    throw new Error(
      "PRIVY_APP_ID/PRIVY_APP_SECRET unset. Set them, or ALLOW_UNAUTHENTICATED=1 for local dev.",
    );
  }
  console.warn("ALLOW_UNAUTHENTICATED=1 — join/picks run without auth (local dev only)");
}
const app = buildServer({
  db,
  pickKey,
  entryProvider: new ChainEntryProvider({
    getProgramAccounts: (programId, config) => connection.getProgramAccounts(programId, config),
  }),
  resultsStore,
  verifyWallet,
  adminToken: process.env.ADMIN_TOKEN,
  // Devnet fee faucet: top up empty invisible wallets from the authority key
  // so their create/commit txs can pay fees. No-ops when already funded.
  faucet: async (wallet) => {
    const target = new PublicKey(wallet);
    const min = Number(process.env.FAUCET_MIN_LAMPORTS ?? 0.005 * LAMPORTS_PER_SOL);
    const topUp = Number(process.env.FAUCET_TOPUP_LAMPORTS ?? 0.02 * LAMPORTS_PER_SOL);
    if ((await connection.getBalance(target)) >= min) return;
    const payer = loadFixtureAuthority();
    const tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: payer.publicKey, toPubkey: target, lamports: topUp }),
    );
    await sendViaConnection(connection)(tx, [payer]);
    console.log(`faucet: topped up ${wallet}`);
  },
});

// Auto-reveal worker (design §2): decrypt stored picks past kickoff and submit
// permissionless reveal_pick txs on an interval.
// TODO: dedicated reveal fee payer; reuses the fixture-authority keypair for now.
const revealDeps = {
  db,
  key: pickKey,
  payer: loadFixtureAuthority(),
  send: sendViaConnection(connection),
  // Kickoffs come from the DB fixtures table (seeded by stub or TxLINE sync),
  // so picks on fixtures beyond the static seed still auto-reveal.
  kickoffOf: (fixtureId: number) => kickoffOf(db, fixtureId),
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
