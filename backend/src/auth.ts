import { PrivyClient } from "@privy-io/server-auth";

/**
 * Verifies that the caller's Privy access token is valid AND that `wallet`
 * is one of the verified user's linked wallets — so nobody can join or store
 * picks for someone else's address.
 */
export type WalletVerifier = (
  authHeader: string | undefined,
  wallet: string,
) => Promise<boolean>;

const CACHE_TTL_MS = 60_000;

export function privyWalletVerifier(appId: string, appSecret: string): WalletVerifier {
  const privy = new PrivyClient(appId, appSecret);
  // userId -> linked wallet addresses; Privy getUser is a network call, so
  // cache briefly (wallets change only when a user links a new account).
  const cache = new Map<string, { wallets: Set<string>; expiresAt: number }>();

  return async (authHeader, wallet) => {
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
    if (!token) return false;
    try {
      const claims = await privy.verifyAuthToken(token);
      const cached = cache.get(claims.userId);
      let wallets = cached && cached.expiresAt > Date.now() ? cached.wallets : undefined;
      if (!wallets) {
        const user = await privy.getUser(claims.userId);
        wallets = new Set(
          user.linkedAccounts
            .filter((a): a is typeof a & { address: string } => a.type === "wallet")
            .map((a) => a.address),
        );
        cache.set(claims.userId, { wallets, expiresAt: Date.now() + CACHE_TTL_MS });
      }
      return wallets.has(wallet);
    } catch {
      return false;
    }
  };
}
