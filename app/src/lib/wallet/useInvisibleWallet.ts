import { usePrivy } from '@privy-io/react-auth';
import { useSolanaWallets, useSignTransaction } from '@privy-io/react-auth/solana';

/**
 * The user's invisible Solana wallet — the embedded wallet Privy creates
 * after first email login. Consumers never see a seed phrase or connect button.
 *
 * IMPORTANT: the embedded wallet does NOT exist inside the login callback.
 * It is created after login completes; always gate on `ready` before signing.
 *
 * TODO(wallet spike): finish wiring signing for the commit_picks transaction.
 */
export function useInvisibleWallet() {
  const { authenticated, user } = usePrivy();
  const { wallets, ready } = useSolanaWallets();
  const { signTransaction } = useSignTransaction();

  const embedded = wallets.find((w) => w.walletClientType === 'privy');

  return {
    /** Email-authenticated with Privy. */
    authenticated,
    /** Wallets list has settled — do not sign before this is true. */
    ready,
    /** The invisible embedded wallet, or null until created post-login. */
    wallet: embedded ?? null,
    /** Base58 address of the invisible wallet, or null. */
    address: embedded?.address ?? null,
    user,
    signTransaction,
  };
}
