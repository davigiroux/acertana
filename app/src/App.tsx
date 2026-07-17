import { useEffect } from 'react'
import { JoinPage } from './pages/JoinPage'
import { LandingPage } from './pages/LandingPage'
import { PoolPage } from './pages/PoolPage'
import { matchRoute, usePath } from './lib/router'

function App() {
  const route = matchRoute(usePath())
  const isLanding = route.name === 'home'

  // The landing page is full-bleed; every other route lives inside the
  // fixed-width bordered shell defined in index.css for #root.
  useEffect(() => {
    document.getElementById('root')?.classList.toggle('full-bleed', isLanding)
  }, [isLanding])

  if (isLanding) return <LandingPage />

  return (
    <main>
      <h1>Acertana</h1>
      {route.name === 'join' && <JoinPage code={route.code} />}
      {route.name === 'pool' && <PoolPage poolPubkey={route.poolPubkey} />}
      {route.name === 'notFound' && <p>Not found.</p>}
    </main>
  )
}

export default App
