import { useState } from 'react';
import { postCreatePool, postFaucet } from '../lib/api';
import { navigate } from '../lib/router';
import { createChainClient, type ChainClient } from '../lib/chain/ChainClient';
import { useInvisibleWallet } from '../lib/wallet/useInvisibleWallet';

/**
 * /novo — organizer creates a pool: on-chain create_pool signed by the
 * invisible wallet, then the backend mints a short join code to share.
 * `chainClient` is injectable for tests.
 */
export function CreatePoolPage({ chainClient }: { chainClient?: ChainClient }) {
  const { authenticated, ready, address, wallet, login, getAccessToken } = useInvisibleWallet();
  const [name, setName] = useState('');
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ joinCode: string; poolPubkey: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const create = async () => {
    if (!wallet || !address || busy) return;
    setBusy(true);
    setError(null);
    try {
      const token = (await getAccessToken()) ?? undefined;
      // Invisible wallets start empty; ask the backend for fee dust first.
      await postFaucet(address, token).catch(() => undefined);
      const chain = chainClient ?? createChainClient();
      const poolPubkey = await chain.createPool({
        organizer: address,
        poolId: BigInt(Date.now()),
        name: name.trim(),
        signTransaction: (tx) => wallet.signTransaction(tx),
      });
      const res = await postCreatePool(name.trim(), address, poolPubkey, token, requiresApproval);
      setResult(res);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  };

  if (!authenticated) {
    return (
      <div className="ac-center-screen">
        <div className="ac-icon-tile" style={{ background: 'var(--blue-soft)' }}>🏆</div>
        <div className="ac-screen-title">Crie seu bolão</div>
        <p className="ac-screen-body">Entre com seu e-mail para criar um bolão e convidar a galera.</p>
        <button className="ac-primary-btn" style={{ width: 'auto', padding: '0 24px' }} onClick={login}>
          Entrar com e-mail
        </button>
      </div>
    );
  }
  if (!ready || !address) return <p className="ac-screen-body">Preparando carteira…</p>;

  if (result) {
    const link = `${window.location.origin}/j/${result.joinCode}`;
    return (
      <div className="ac-center-screen">
        <div className="ac-icon-tile" style={{ background: '#E8F6EC' }}>🎉</div>
        <div className="ac-screen-title">Bolão criado!</div>
        <p className="ac-screen-body">Compartilhe o link de convite com a galera:</p>
        <code data-testid="join-link" style={{ fontSize: 15, padding: '8px 12px' }}>{link}</code>
        <button
          className="ac-primary-btn"
          style={{ width: 'auto', padding: '0 24px', marginTop: 12 }}
          onClick={() => {
            navigator.clipboard?.writeText(link).catch(() => undefined);
            setCopied(true);
          }}
        >
          {copied ? 'Copiado ✓' : 'Copiar link'}
        </button>
        <button
          style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--blue)', fontSize: 14 }}
          onClick={() => navigate(`/p/${result.poolPubkey}`)}
        >
          Ir para o bolão →
        </button>
      </div>
    );
  }

  return (
    <div className="ac-center-screen">
      <div className="ac-icon-tile" style={{ background: 'var(--blue-soft)' }}>🏆</div>
      <div className="ac-screen-title">Crie seu bolão</div>
      <p className="ac-screen-body">Dê um nome (até 32 caracteres) e receba um link de convite.</p>
      <input
        aria-label="Nome do bolão"
        value={name}
        maxLength={32}
        placeholder="Bolão dos amigos"
        onChange={(e) => setName(e.target.value)}
        style={{
          height: 46,
          padding: '0 14px',
          borderRadius: 12,
          border: '1px solid var(--input-border)',
          fontSize: 15,
          width: '100%',
          maxWidth: 320,
        }}
      />
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 14,
          fontSize: 14,
          color: 'var(--ink)',
        }}
      >
        <input
          type="checkbox"
          checked={requiresApproval}
          onChange={(e) => setRequiresApproval(e.target.checked)}
        />
        Aprovar entradas manualmente
      </label>
      {error && (
        <p className="ac-screen-body" role="alert" style={{ color: '#B4232A' }}>
          {error}
        </p>
      )}
      <button
        className="ac-primary-btn"
        style={{ width: 'auto', padding: '0 24px', marginTop: 12 }}
        disabled={busy || name.trim().length === 0}
        onClick={create}
      >
        {busy ? 'Criando…' : 'Criar bolão'}
      </button>
    </div>
  );
}
