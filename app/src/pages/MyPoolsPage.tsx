import { useQuery } from '@tanstack/react-query';
import { getMyPools } from '../lib/api';
import { navigate } from '../lib/router';
import { useInvisibleWallet } from '../lib/wallet/useInvisibleWallet';

/** Home screen for logged-in users: their pools, plus the create-pool CTA. */
export function MyPoolsPage() {
  const { address, getAccessToken } = useInvisibleWallet();

  const { data: pools, error, isPending } = useQuery({
    queryKey: ['myPools', address],
    enabled: !!address,
    queryFn: async () => {
      const token = await getAccessToken();
      return getMyPools(address!, token ?? undefined);
    },
  });

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px 22px', gap: 16 }}>
      <div className="ac-screen-title" style={{ fontSize: 22 }}>Meus bolões</div>

      {error && (
        <p className="ac-screen-body" role="alert" style={{ color: '#B4232A' }}>
          {String((error as Error).message ?? error)}
        </p>
      )}

      {!error && isPending && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} aria-label="Carregando bolões">
          {[0, 1, 2].map((i) => (
            <div key={i} className="ac-skel" style={{ height: 50, borderRadius: 16 }} />
          ))}
        </div>
      )}

      {!error && pools && pools.length === 0 && (
        <p className="ac-screen-body">Você ainda não entrou em nenhum bolão.</p>
      )}

      {!error && pools && pools.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pools.map((p) => (
            <button
              key={p.poolPubkey}
              className="ac-card"
              style={{
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                padding: '14px 16px',
                border: 'none',
                cursor: 'pointer',
              }}
              onClick={() => navigate(`/p/${p.poolPubkey}`)}
            >
              <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{p.name}</span>
            </button>
          ))}
        </div>
      )}

      <button
        className="ac-primary-btn"
        style={{ width: 'auto', height: 48, padding: '0 24px', fontSize: 15, alignSelf: 'center', marginTop: 8 }}
        onClick={() => navigate('/novo')}
      >
        Criar um bolão
      </button>
    </div>
  );
}
