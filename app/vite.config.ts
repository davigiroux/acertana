import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const kitShim = fileURLToPath(
  new URL('./src/lib/wallet/shims/solana-kit-shim.ts', import.meta.url),
)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Privy v2 optionally imports these for its funding features (unused
      // here). We pin @solana/web3.js and must not install @solana/kit, so
      // point both at a throwing shim. See docs/BUILD_LOG.md.
      '@solana/kit': kitShim,
      '@solana-program/system': kitShim,
      '@solana-program/token': kitShim,
    },
  },
})
