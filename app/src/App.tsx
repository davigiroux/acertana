import { useEffect } from 'react'
import { CreatePoolPage } from './pages/CreatePoolPage'
import { JoinPage } from './pages/JoinPage'
import { LandingPage } from './pages/LandingPage'
import { PoolPage } from './pages/PoolPage'
import { MyPoolsPage } from './pages/MyPoolsPage'
import { matchRoute, navigate, usePath } from './lib/router'
import { useInvisibleWallet } from './lib/wallet/useInvisibleWallet'

function App() {
  const route = matchRoute(usePath())
  const { authenticated, login, logout } = useInvisibleWallet()
  const isLanding = route.name === 'home'

  // The landing page is full-bleed; every other route lives inside the
  // fixed-width bordered shell defined in index.css for #root.
  useEffect(() => {
    document.getElementById('root')?.classList.toggle('full-bleed', isLanding)
  }, [isLanding])

  if (isLanding) return <LandingPage />

  return (
    <div className="ac-phone">
      <header className="ac-appbar">
        <div className="ac-logo" onClick={() => navigate(authenticated ? '/home' : '/')} style={{ cursor: 'pointer' }}>
          <div className="ac-logo-mark">
            <div className="ac-logo-dot" />
          </div>
          <span className="ac-logo-word">Acertana</span>
        </div>
        {authenticated && (
          <button
            className="ac-invite-btn"
            onClick={async () => {
              await logout()
              navigate('/')
            }}
          >
            Sair
          </button>
        )}
      </header>
      {route.name === 'create' && <CreatePoolPage />}
      {route.name === 'join' && <JoinPage code={route.code} />}
      {route.name === 'pool' && <PoolPage poolPubkey={route.poolPubkey} />}
      {route.name === 'myPools' && authenticated && <MyPoolsPage />}
      {route.name === 'myPools' && !authenticated && (
        <div className="ac-center-screen">
          <div className="ac-icon-tile" style={{ background: 'var(--blue-soft)' }}>⚽</div>
          <div className="ac-screen-title">Bolão da Copa</div>
          <p className="ac-screen-body">
            Entre com seu e-mail para ver seus bolões, ou abra um link de convite{' '}
            <code>/j/CODIGO</code> para entrar em um bolão.
          </p>
          <button
            className="ac-primary-btn"
            style={{ width: 'auto', height: 48, padding: '0 24px', fontSize: 15 }}
            onClick={login}
          >
            Entrar
          </button>
        </div>
      )}
      {route.name === 'notFound' && (
        <div className="ac-center-screen">
          <div
            className="ac-condensed"
            style={{ fontWeight: 800, fontSize: 88, lineHeight: 0.9, color: '#DDE1EA' }}
          >
            404
          </div>
          <div className="ac-screen-title" style={{ marginTop: 6 }}>Página não encontrada</div>
          <p className="ac-screen-body">O link pode estar quebrado ou o bolão não existe mais.</p>
          <button
            className="ac-primary-btn"
            style={{ width: 'auto', height: 48, padding: '0 24px', fontSize: 15 }}
            onClick={() => navigate('/')}
          >
            Voltar ao início
          </button>
        </div>
      )}
    </div>
  )
}

export default App
