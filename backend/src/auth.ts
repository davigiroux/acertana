import { PrivyClient } from "@privy-io/server-auth";

/** Result of verifying a caller's Privy token against a claimed wallet. */
export interface VerifyResult {
  ok: boolean;
  /** The verified user's email, when Privy has one on file (linked email or account email). */
  email?: string;
}

/**
 * Verifies that the caller's Privy access token is valid AND that `wallet`
 * is one of the verified user's linked wallets — so nobody can join or store
 * picks for someone else's address. On success, also yields the user's
 * VERIFIED email (never trust an email the client sends itself).
 */
export type WalletVerifier = (
  authHeader: string | undefined,
  wallet: string,
) => Promise<VerifyResult>;

const CACHE_TTL_MS = 60_000;

export function privyWalletVerifier(appId: string, appSecret: string): WalletVerifier {
  const privy = new PrivyClient(appId, appSecret);
  // userId -> linked wallets + email; Privy getUser is a network call, so
  // cache briefly (wallets/email change only when a user links a new account).
  const cache = new Map<string, { wallets: Set<string>; email?: string; expiresAt: number }>();

  return async (authHeader, wallet) => {
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
    if (!token) return { ok: false };
    try {
      const claims = await privy.verifyAuthToken(token);
      const cached = cache.get(claims.userId);
      let entry = cached && cached.expiresAt > Date.now() ? cached : undefined;
      if (!entry) {
        const user = await privy.getUser(claims.userId);
        const wallets = new Set(
          user.linkedAccounts
            .filter((a): a is typeof a & { address: string } => a.type === "wallet")
            .map((a) => a.address),
        );
        const emailAccount = user.linkedAccounts.find(
          (a): a is typeof a & { address: string } => a.type === "email",
        );
        const email = emailAccount?.address ?? user.email?.address;
        entry = { wallets, email, expiresAt: Date.now() + CACHE_TTL_MS };
        cache.set(claims.userId, entry);
      }
      return { ok: entry.wallets.has(wallet), email: entry.email };
    } catch {
      return { ok: false };
    }
  };
}
