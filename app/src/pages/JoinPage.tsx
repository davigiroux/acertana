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
  const [pending, setPending] = useState(false);
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
      .then((status) => {
        if (status === 'pending') {
          setPending(true);
        } else {
          navigate(`/p/${info.poolPubkey}`);
        }
      })
      .catch((e) => {
        joining.current = false;
        setError(String(e.message ?? e));
      });
  }, [info, authenticated, ready, address, getAccessToken]);

  if (pending) {
    return (
      <div className="ac-center-screen">
        <div className="ac-icon-tile" style={{ background: '#FBF0DE' }}>⏳</div>
        <div className="ac-screen-title">Pedido enviado</div>
        <p className="ac-screen-body">
          Pedido enviado — aguardando aprovação do organizador.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ac-center-screen">
        <div className="ac-icon-tile" style={{ background: '#FBF0DE' }}>🔗</div>
        <div className="ac-screen-title">Convite inválido</div>
        <p className="ac-screen-body" role="alert">
          {error}
        </p>
        <button
          style={{
            height: 46,
            padding: '0 22px',
            borderRadius: 12,
            border: '1px solid var(--input-border)',
            background: '#fff',
            color: 'var(--ink)',
            fontSize: 15,
            fontWeight: 700,
          }}
          onClick={() => navigate('/')}
        >
          Voltar ao início
        </button>
      </div>
    );
  }

  if (!info) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '24px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginBottom: 26 }}>
          <div className="ac-spinner" style={{ width: 18, height: 18, borderWidth: 2.5 }} />
          <span style={{ fontSize: 15, fontWeight: 600, color: '#6B7080' }}>Verificando convite…</span>
        </div>
        <div className="ac-card" style={{ padding: '22px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div className="ac-skel" style={{ height: 12, width: '44%' }} />
          <div className="ac-skel" style={{ height: 30, width: '76%', borderRadius: 8 }} />
          <div className="ac-skel" style={{ height: 12, width: '58%' }} />
          <div className="ac-skel" style={{ height: 48, width: '100%', borderRadius: 12, marginTop: 6 }} />
        </div>
      </div>
    );
  }

  if (authenticated) {
    return (
      <div className="ac-center-screen">
        <div className="ac-spinner" style={{ width: 26, height: 26, marginBottom: 18 }} />
        <div className="ac-screen-title" style={{ fontSize: 24 }}>Entrando no bolão…</div>
        <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 6 }}>{info.name}</div>
      </div>
    );
  }

  return (
    <div className="ac-join">
      <div style={{ textAlign: 'center' }}>
        <div className="ac-join-kicker">Você foi convidado para</div>
        <div className="ac-join-name">{info.name}</div>
      </div>
      <p style={{ textAlign: 'center', fontSize: 15, lineHeight: 1.45, color: '#6B7080', margin: '22px 8px 0' }}>
        Palpite nos placares da Copa antes do apito e dispute o ranking com a galera.
      </p>
      <div style={{ height: 26 }} />
      <button className="ac-primary-btn" onClick={login}>
        Entrar com e-mail
      </button>
      <div style={{ textAlign: 'center', fontSize: 13, color: '#9096A6', marginTop: 12 }}>
        Sem senha e sem carteira — só o seu e-mail.
      </div>
    </div>
  );
}
