/**
 * CLI: register fixtures on-chain (design §1).
 *
 *   RPC_URL=http://127.0.0.1:8899 npm run register-fixtures
 *
 * Fixture source: TxLINE when TXLINE_API_TOKEN is set (also upserts the DB
 * fixtures table), else the local seed json.
 * Env: RPC_URL (default local validator), FIXTURE_AUTHORITY_KEYPAIR[_B64],
 * SEED_PATH (seed file override), TXLINE_API_TOKEN / TXLINE_API_ORIGIN /
 * TXLINE_COMPETITION_ID, DB_PATH.
 * Already-registered fixtures ("already in use" Fixture PDA) are skipped.
 */
import { Connection } from "@solana/web3.js";
import { loadFixtureAuthority, registerSeedFixtures, sendViaConnection } from "./fixtureAuthority.js";
import { loadFixtures, type Fixture } from "./txline/stub.js";
import { TxlineClient } from "./txline/client.js";
import { openDb } from "./db.js";
import { upsertFixtures } from "./fixtureSync.js";

async function sourceFixtures(): Promise<Fixture[]> {
  if (!process.env.TXLINE_API_TOKEN) {
    return process.env.SEED_PATH ? loadFixtures(process.env.SEED_PATH) : loadFixtures();
  }
  const txline = new TxlineClient({
    apiOrigin: process.env.TXLINE_API_ORIGIN ?? "https://txline-dev.txodds.com",
    apiToken: process.env.TXLINE_API_TOKEN,
    competitionId: process.env.TXLINE_COMPETITION_ID
      ? Number(process.env.TXLINE_COMPETITION_ID)
      : undefined,
  });
  const fixtures = await txline.fetchFixtures();
  upsertFixtures(openDb(), fixtures, Math.floor(Date.now() / 1000));
  console.log(`sourced ${fixtures.length} fixtures from TxLINE (DB updated)`);
  return fixtures;
}

async function main(): Promise<void> {
  const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8899";
  const connection = new Connection(rpcUrl, "confirmed");
  const authority = loadFixtureAuthority();
  const fixtures = await sourceFixtures();
  const rawSend = sendViaConnection(connection);

  console.log(`registering ${fixtures.length} fixtures on ${rpcUrl} as ${authority.publicKey.toBase58()}`);
  let i = 0;
  // Wrap send so an already-registered Fixture PDA is skipped, not fatal.
  const sigs = await registerSeedFixtures(
    authority,
    async (tx, signers) => {
      const fixture = fixtures[i++];
      try {
        const sig = await rawSend(tx, signers);
        console.log(`fixture ${fixture.fixtureId} (${fixture.home} vs ${fixture.away}): ${sig}`);
        return sig;
      } catch (err) {
        if (String(err).includes("already in use")) {
          console.log(`fixture ${fixture.fixtureId}: already registered, skipping`);
          return "already-registered";
        }
        throw err;
      }
    },
    fixtures,
  );
  console.log(`done: ${sigs.filter((s) => s !== "already-registered").length} registered, ${sigs.length} total`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
