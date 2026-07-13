import { readFileSync } from "node:fs";
import { Keypair, Transaction, sendAndConfirmTransaction, type Connection } from "@solana/web3.js";
import { registerFixtureIx } from "./program.js";
import { loadFixtures, type Fixture } from "./txline/stub.js";

/**
 * Fixture authority: the backend key allowed to call register_fixture.
 * Local/test keypair lives at tests/fixtures/fixture-authority.json.
 *
 * Sources, in order: FIXTURE_AUTHORITY_KEYPAIR_B64 (base64 of the keypair
 * json — for hosts like Railway where a secret file is awkward), then
 * FIXTURE_AUTHORITY_KEYPAIR (path), then the local test key.
 */
export function loadFixtureAuthority(
  path = process.env.FIXTURE_AUTHORITY_KEYPAIR ?? "../tests/fixtures/fixture-authority.json",
): Keypair {
  const b64 = process.env.FIXTURE_AUTHORITY_KEYPAIR_B64;
  const json = b64 ? Buffer.from(b64, "base64").toString("utf8") : readFileSync(path, "utf8");
  const secret = JSON.parse(json) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

export interface SendTransaction {
  (tx: Transaction, signers: Keypair[]): Promise<string>;
}

/** Real SendTransaction over an RPC connection. */
export function sendViaConnection(connection: Connection): SendTransaction {
  return (tx, signers) => sendAndConfirmTransaction(connection, tx, signers);
}

/** Build a signed-by-authority register_fixture tx for one fixture. */
export function buildRegisterFixtureTx(authority: Keypair, fixture: Fixture): Transaction {
  const tx = new Transaction().add(
    registerFixtureIx(authority.publicKey, BigInt(fixture.fixtureId), BigInt(fixture.kickoffTs)),
  );
  tx.feePayer = authority.publicKey;
  return tx;
}

/** Register every fixture from the seed file on-chain. */
export async function registerSeedFixtures(
  authority: Keypair,
  send: SendTransaction,
  fixtures: Fixture[] = loadFixtures(),
): Promise<string[]> {
  const sigs: string[] = [];
  for (const fixture of fixtures) {
    sigs.push(await send(buildRegisterFixtureTx(authority, fixture), [authority]));
  }
  return sigs;
}
