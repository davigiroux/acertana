import { JoinPage } from './pages/JoinPage'
import { PoolPage } from './pages/PoolPage'
import { matchRoute, navigate, usePath } from './lib/router'

function App() {
  const route = matchRoute(usePath())
  return (
    <div className="ac-phone">
      <header className="ac-appbar">
        <div className="ac-logo">
          <div className="ac-logo-mark">
            <div className="ac-logo-dot" />
          </div>
          <span className="ac-logo-word">Acertana</span>
        </div>
      </header>
      {route.name === 'join' && <JoinPage code={route.code} />}
      {route.name === 'pool' && <PoolPage poolPubkey={route.poolPubkey} />}
      {route.name === 'home' && (
        <div className="ac-center-screen">
          <div className="ac-icon-tile" style={{ background: 'var(--blue-soft)' }}>⚽</div>
          <div className="ac-screen-title">Bolão da Copa</div>
          <p className="ac-screen-body">
            Palpite nos placares da Copa antes do apito e dispute o ranking com a galera. Abra um
            link de convite <code>/j/CODIGO</code> para entrar em um bolão.
          </p>
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
