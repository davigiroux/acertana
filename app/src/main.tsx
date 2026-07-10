// @solana/web3.js expects Node's Buffer as a global in the browser.
import { Buffer } from 'buffer'
globalThis.Buffer ??= Buffer

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PrivyAppProvider } from './lib/wallet/PrivyAppProvider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrivyAppProvider>
      <App />
    </PrivyAppProvider>
  </StrictMode>,
)
