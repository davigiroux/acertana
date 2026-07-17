// @solana/web3.js expects Node's Buffer as a global in the browser.
import { Buffer } from 'buffer'
globalThis.Buffer ??= Buffer

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { PrivyAppProvider } from './lib/wallet/PrivyAppProvider'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // pool lists / stats change rarely; avoid refetch storms on nav
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrivyAppProvider>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </PrivyAppProvider>
  </StrictMode>,
)
