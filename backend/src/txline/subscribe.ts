import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import nacl from "tweetnacl";
import { readFileSync } from "node:fs";

/**
 * One-time CLI: subscribe to TxLINE's free World Cup tier on devnet and
 * activate the long-lived API token. Prints TXLINE_API_TOKEN for the env.
 *
 *   TXLINE_WALLET=path/to/keypair.json npm run txline-subscribe
 *
 * The wallet only needs devnet SOL for fees/rent (free tier: no TxL cost).
 * Instruction layout comes from the txoracle IDL
 * (github.com/txodds/tx-on-chain, examples/devnet/idl/txoracle.json).
 */

const API_ORIGIN = process.env.TXLINE_API_ORIGIN ?? "https://txline-dev.txodds.com";
const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";
const SERVICE_LEVEL_ID = Number(process.env.TXLINE_SERVICE_LEVEL ?? 1); // free World Cup tier
const WEEKS = Number(process.env.TXLINE_WEEKS ?? 4); // must be a multiple of 4

const TXORACLE_PROGRAM_ID = new PublicKey(
  process.env.TXLINE_PROGRAM_ID ?? "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J",
);
const TXL_MINT = new PublicKey(
  process.env.TXLINE_TXL_MINT ?? "4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG",
);
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

// From the txoracle IDL: subscribe(service_level_id: u16, weeks: u8).
const SUBSCRIBE_DISCRIMINATOR = Buffer.from([254, 28, 191, 138, 156, 179, 183, 53]);

function ata(mint: PublicKey, owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_2022_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
}

function createAtaIx(payer: PublicKey, owner: PublicKey, mint: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: ata(mint, owner), isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.alloc(0),
  });
}

function subscribeIx(user: PublicKey): TransactionInstruction {
  const [pricingMatrix] = PublicKey.findProgramAddressSync(
    [Buffer.from("pricing_matrix")],
    TXORACLE_PROGRAM_ID,
  );
  const [treasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_treasury_v2")],
    TXORACLE_PROGRAM_ID,
  );
  const args = Buffer.alloc(3);
  args.writeUInt16LE(SERVICE_LEVEL_ID, 0);
  args.writeUInt8(WEEKS, 2);
  return new TransactionInstruction({
    programId: TXORACLE_PROGRAM_ID,
    keys: [
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: pricingMatrix, isSigner: false, isWritable: false },
      { pubkey: TXL_MINT, isSigner: false, isWritable: false },
      { pubkey: ata(TXL_MINT, user), isSigner: false, isWritable: true },
      { pubkey: ata(TXL_MINT, treasuryPda), isSigner: false, isWritable: true },
      { pubkey: treasuryPda, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([SUBSCRIBE_DISCRIMINATOR, args]),
  });
}

async function main() {
  const walletPath = process.env.TXLINE_WALLET;
  if (!walletPath) throw new Error("set TXLINE_WALLET to a keypair json path");
  if (WEEKS < 4 || WEEKS % 4 !== 0) throw new Error("TXLINE_WEEKS must be a multiple of 4");
  const wallet = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(walletPath, "utf8"))),
  );
  const connection = new Connection(RPC_URL, "confirmed");
  console.log(`wallet ${wallet.publicKey.toBase58()} on ${RPC_URL}`);

  const tx = new Transaction();
  if (!(await connection.getAccountInfo(ata(TXL_MINT, wallet.publicKey)))) {
    tx.add(createAtaIx(wallet.publicKey, wallet.publicKey, TXL_MINT));
  }
  tx.add(subscribeIx(wallet.publicKey));
  const txSig = await sendAndConfirmTransaction(connection, tx, [wallet]);
  console.log(`subscribed (level ${SERVICE_LEVEL_ID}, ${WEEKS}w): ${txSig}`);

  const jwtRes = await fetch(`${API_ORIGIN}/auth/guest/start`, { method: "POST" });
  if (!jwtRes.ok) throw new Error(`guest JWT failed (${jwtRes.status})`);
  const jwt = ((await jwtRes.json()) as { token: string }).token;

  // Standard bundle (no league selection) → the signed message is `${txSig}::${jwt}`.
  const message = new TextEncoder().encode(`${txSig}::${jwt}`);
  const walletSignature = Buffer.from(nacl.sign.detached(message, wallet.secretKey)).toString(
    "base64",
  );

  const activateRes = await fetch(`${API_ORIGIN}/api/token/activate`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ txSig, walletSignature, leagues: [] }),
  });
  if (!activateRes.ok) {
    throw new Error(`activation failed (${activateRes.status}): ${await activateRes.text()}`);
  }
  const raw = await activateRes.text();
  let apiToken = raw;
  try {
    const parsed = JSON.parse(raw) as { token?: string } | string;
    apiToken = typeof parsed === "string" ? parsed : (parsed.token ?? raw);
  } catch {
    // plain-text token response
  }
  console.log(`\nTXLINE_API_TOKEN=${apiToken}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
