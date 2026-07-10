import type { ReactNode } from 'react';
import { PrivyProvider } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';

/**
 * App-root Privy provider configured for "invisible wallet" UX:
 * email-only login, a Solana embedded wallet created automatically,
 * and no wallet UI ever shown to the user.
 *
 * Gotchas (see docs/BUILD_LOG.md, "Privy gotchas"):
 * - The embedded wallet is created AFTER first login, not during it.
 * - HTTPS is required for WebCrypto (localhost excepted).
 * - Keep @privy-io/react-auth pinned to latest v2.x (NOT v3 / @solana/kit).
 */
export function PrivyAppProvider({ children }: { children: ReactNode }) {
  const appId = import.meta.env.VITE_PRIVY_APP_ID as string | undefined;

  if (!appId) {
    // TODO: create a Privy app and set VITE_PRIVY_APP_ID in app/.env
    return <>{children}</>;
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ['email'],
        embeddedWallets: {
          solana: {
            createOnLogin: 'users-without-wallets',
          },
        },
        externalWallets: {
          solana: { connectors: toSolanaWalletConnectors() },
        },
        appearance: {
          // Invisible-wallet UX: never surface wallet chrome.
          showWalletLoginFirst: false,
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
