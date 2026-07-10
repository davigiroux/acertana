import { readFileSync } from "node:fs";
import { Keypair, Transaction } from "@solana/web3.js";
import { registerFixtureIx } from "./program.js";
import { loadFixtures, type Fixture } from "./txline/stub.js";

/**
 * Fixture authority: the backend key allowed to call register_fixture.
 * Local/test keypair lives at tests/fixtures/fixture-authority.json.
 */
export function loadFixtureAuthority(
  path = process.env.FIXTURE_AUTHORITY_KEYPAIR ?? "../tests/fixtures/fixture-authority.json",
): Keypair {
  const secret = JSON.parse(readFileSync(path, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

export interface SendTransaction {
  (tx: Transaction, signers: Keypair[]): Promise<string>;
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
