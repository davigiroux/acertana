/**
 * CLI: register the seed fixtures on-chain (design §1).
 *
 *   RPC_URL=http://127.0.0.1:8899 npm run register-fixtures
 *
 * Env: RPC_URL (default local validator), FIXTURE_AUTHORITY_KEYPAIR (path to
 * authority keypair JSON), SEED_PATH (optional fixtures seed file override).
 * Already-registered fixtures ("already in use" Fixture PDA) are skipped.
 */
import { Connection } from "@solana/web3.js";
import { loadFixtureAuthority, registerSeedFixtures, sendViaConnection } from "./fixtureAuthority.js";
import { loadFixtures } from "./txline/stub.js";

async function main(): Promise<void> {
  const rpcUrl = process.env.RPC_URL ?? "http://127.0.0.1:8899";
  const connection = new Connection(rpcUrl, "confirmed");
  const authority = loadFixtureAuthority();
  const fixtures = process.env.SEED_PATH ? loadFixtures(process.env.SEED_PATH) : loadFixtures();
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
