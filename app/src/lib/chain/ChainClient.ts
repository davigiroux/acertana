import {
  Connection,
  PublicKey,
  Transaction,
  type VersionedTransaction,
} from '@solana/web3.js';
import { commitPickIx, createPoolIx, decodeEntry, entryPda, poolPda, type EntryState } from './program';

export type { EntryState };

/** Signs (does not send) a legacy transaction. Adapt Privy's hook to this. */
export type TransactionSigner = (
  tx: Transaction,
) => Promise<Transaction | VersionedTransaction>;

/**
 * Everything the UI needs from the chain, behind an interface so tests
 * can mock it and never touch RPC or a wallet.
 */
export interface ChainClient {
  /** Build, sign, and send commit_pick. Resolves to the tx signature. */
  commitPick(args: {
    pool: string;
    participant: string;
    fixtureId: bigint;
    commitment: Uint8Array;
    signTransaction: TransactionSigner;
  }): Promise<string>;
  /** Fetch + decode the Entry PDA, or null if not created yet. */
  getEntry(pool: string, participant: string, fixtureId: bigint): Promise<EntryState | null>;
  /** Build, sign, and send create_pool. Resolves to the pool PDA address. */
  createPool(args: {
    organizer: string;
    poolId: bigint;
    name: string;
    signTransaction: TransactionSigner;
  }): Promise<string>;
}

export function rpcUrl(): string {
  const url = import.meta.env.VITE_RPC_URL as string | undefined;
  if (!url) throw new Error('VITE_RPC_URL is not set (see app/.env.example)');
  return url;
}

/** Real implementation over web3.js Connection(VITE_RPC_URL). */
export function createChainClient(connection?: Connection): ChainClient {
  const conn = () => connection ?? (connection = new Connection(rpcUrl(), 'confirmed'));
  return {
    async commitPick({ pool, participant, fixtureId, commitment, signTransaction }) {
      const poolPk = new PublicKey(pool);
      const participantPk = new PublicKey(participant);
      const ix = commitPickIx(poolPk, participantPk, fixtureId, commitment);
      const { blockhash, lastValidBlockHeight } = await conn().getLatestBlockhash();
      const tx = new Transaction({
        feePayer: participantPk,
        blockhash,
        lastValidBlockHeight,
      }).add(ix);
      const signed = await signTransaction(tx);
      const sig = await conn().sendRawTransaction(signed.serialize());
      await conn().confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
      return sig;
    },
    async createPool({ organizer, poolId, name, signTransaction }) {
      const organizerPk = new PublicKey(organizer);
      const ix = createPoolIx(organizerPk, poolId, name);
      const { blockhash, lastValidBlockHeight } = await conn().getLatestBlockhash();
      const tx = new Transaction({
        feePayer: organizerPk,
        blockhash,
        lastValidBlockHeight,
      }).add(ix);
      const signed = await signTransaction(tx);
      const sig = await conn().sendRawTransaction(signed.serialize());
      await conn().confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
      return poolPda(organizerPk, poolId).toBase58();
    },
    async getEntry(pool, participant, fixtureId) {
      const pda = entryPda(new PublicKey(pool), new PublicKey(participant), fixtureId);
      const info = await conn().getAccountInfo(pda);
      return info ? decodeEntry(info.data) : null;
    },
  };
}
