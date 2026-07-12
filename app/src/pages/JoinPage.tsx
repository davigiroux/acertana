import { useEffect, useRef, useState } from 'react';
import { getJoinInfo, postJoin, type JoinInfo } from '../lib/api';
import { navigate } from '../lib/router';
import { useInvisibleWallet } from '../lib/wallet/useInvisibleWallet';

/**
 * /j/:code — resolve join code, email-login via Privy, join the pool
 * with the invisible wallet, then land on the pool page.
 */
export function JoinPage({ code }: { code: string }) {
  const { authenticated, ready, address, login, getAccessToken } = useInvisibleWallet();
  const [info, setInfo] = useState<JoinInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const joining = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getJoinInfo(code)
      .then((i) => !cancelled && setInfo(i))
      .catch((e) => !cancelled && setError(String(e.message ?? e)));
    return () => {
      cancelled = true;
    };
  }, [code]);

  useEffect(() => {
    // Wallet is created AFTER login completes; gate on ready + address.
    if (!info || !authenticated || !ready || !address || joining.current) return;
    joining.current = true;
    getAccessToken()
      .then((token) => postJoin(info.poolPubkey, address, token ?? undefined))
      .then(() => navigate(`/p/${info.poolPubkey}`))
      .catch((e) => {
        joining.current = false;
        setError(String(e.message ?? e));
      });
  }, [info, authenticated, ready, address, getAccessToken]);

  if (error) return <p role="alert">Error: {error}</p>;
  if (!info) return <p>Looking up join code…</p>;

  return (
    <section>
      <h2>Join pool: {info.name}</h2>
      {!authenticated ? (
        <button onClick={login}>Log in with email</button>
      ) : (
        <p>Joining…</p>
      )}
    </section>
  );
}
