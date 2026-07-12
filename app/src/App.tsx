import { JoinPage } from './pages/JoinPage'
import { PoolPage } from './pages/PoolPage'
import { matchRoute, usePath } from './lib/router'

function App() {
  const route = matchRoute(usePath())
  return (
    <main>
      <h1>Acertana</h1>
      {route.name === 'join' && <JoinPage code={route.code} />}
      {route.name === 'pool' && <PoolPage poolPubkey={route.poolPubkey} />}
      {route.name === 'home' && <p>Free-to-play World Cup bolão. Open a /j/CODE invite link to join a pool.</p>}
      {route.name === 'notFound' && <p>Not found.</p>}
    </main>
  )
}

export default App
