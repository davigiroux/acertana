# Acertana — Build Log

Scaffold session, 2026-07-10. Each step: what was done, why, and what was punted.

## Step 0 — Toolchain

- Installed Solana CLI **4.0.2** (Agave) via the Anza installer script.
- Anchor CLI: the npm `@coral-xyz/anchor-cli` package shipped a macOS arm64
  binary (unusable on linux x86_64), and GitHub release downloads are blocked in
  this environment, so it was compiled from crates.io:
  `cargo install anchor-cli --version 0.31.1 --locked`.
- **Version decision**: crates.io now carries Anchor CLI **1.x** (1.1.2), but
  the npm TypeScript lib `@coral-xyz/anchor` tops out at **0.32.1** — an
  unverified CLI/lib pairing. Pinned the known-good matched pair
  **anchor-cli 0.31.1 + @coral-xyz/anchor 0.31.1** instead. Punt: evaluate the
  Anchor 1.x upgrade (and its IDL/TS story) later.
- Note: the "superpowers" skills mentioned in the kickoff prompt are not
  available in this session; proceeded with standard tooling.

## Step 1 — Repo skeleton

- Created the monorepo layout exactly as proposed in the kickoff prompt
  (programs/acertana, app/src/lib/{wallet,txline}, app/src/features/{pools,
  picks,leaderboard}, docs/). No changes to the suggested layout — it cleanly
  separates the two on-chain touchpoints (wallet, program) from the data feed
  and the three UI features.
- Root `.gitignore` covers target/, node_modules/, .anchor/, dist/, .env*.

## Step 2 — Tooling + pinned deps

- Anchor workspace authored by hand (Anchor.toml, workspace Cargo.toml, program
  crate) rather than `anchor init`, since the CLI was still compiling; verified
  afterwards with `anchor build`. Program name is **acertana** end to end
  (crate name, Anchor.toml, IDL). Cluster: **devnet**.
- Generated a program keypair; `declare_id!` =
  `22uyFYac9ehpM8SjcRFWJVSyQ3Uc4TAiZu4cTGwsxyAo`. The keypair lives in
  `target/deploy/` (gitignored) — regenerate + `anchor keys sync` on a fresh
  clone before deploying.
- Vite app: `npm create vite` (react-ts), Vite 7 / React 19.
- Pinned exact frontend deps (saved with `--save-exact`):
  - `@privy-io/react-auth` **2.25.0** (latest v2.x — deliberately NOT v3, whose
    Solana peer dep is `@solana/kit`; v2 pairs with `@solana/web3.js`)
  - `@solana/web3.js` **1.98.4**
  - `@solana/spl-token` **0.4.15**
  - `@coral-xyz/anchor` **0.31.1** (matched to the CLI, see Step 0)
- Verified: program compiles and IDL builds; `npm run dev` serves; `npm run
  build` typechecks (see Step 7 for the platform-tools caveat).

## Step 3 — Anchor program skeleton

- `programs/acertana/src/lib.rs`: `Pool` (organizer, name) and `Entry`
  (participant, opaque `picks` blob, `locked_at`) accounts; `create_pool` and
  `commit_picks` instructions with stubbed accounts structs. Compiles, no logic.
- Deliberately punted (marked `TODO(docs/DECISIONS.md#...)` in code): pick
  encoding, commit strategy, PDA seeds, exact account sizing, and the on-chain
  kickoff-lock check. Placeholder space constants are clearly labeled as such.
- Guardrail honored: the program touches no tokens, no escrow, no value.

## Step 4 — Privy invisible-wallet skeleton

- `app/src/lib/wallet/PrivyAppProvider.tsx`: `PrivyProvider` at the app root,
  email-only login, Solana embedded wallet `createOnLogin:
  'users-without-wallets'`, using the `@privy-io/react-auth/solana` import path.
  Renders children unwrapped until `VITE_PRIVY_APP_ID` is set.
- `app/src/lib/wallet/useInvisibleWallet.ts`: stub hook exposing the current
  embedded wallet + `signTransaction`, so the wallet spike is one step away.

### Privy gotchas (record for the wallet spike)

1. **Pin the latest v2.x** (`@privy-io/react-auth@2`), not v2.0.0, so all the
   Solana embedded-wallet hooks exist. Confirm `useSignTransaction` is exported
   from the `/solana` path — it is imported in `useInvisibleWallet.ts`, so the
   typecheck enforces this.
2. **The embedded wallet is created AFTER first login**, not during. It does not
   exist in the login callback. Check `useWallets()` / `ready` after login
   completes before signing.
3. **HTTPS is required** — WebCrypto fails silently on plain http (localhost
   excepted). Deploy to an HTTPS URL early for phone / local-network testing.

## Step 5 — TxLINE client skeleton

- `app/src/lib/txline/client.ts`: typed stubs for the known flow — guest JWT
  auth → subscribe → activate → SSE score stream — all throwing
  `TODO` errors. Endpoints and payload shapes were NOT filled from memory;
  every one is a TODO to be filled from the live TxLINE docs.
- `app/src/lib/txline/types.ts`: minimal `Fixture` / `ScoreEvent` shapes, also
  flagged for reconciliation against the live docs.

## Step 6 — Docs

- `docs/DECISIONS.md`: the seven open questions, each a heading with a one-line
  framing, unanswered on purpose.
- `README.md`: project pitch, layout, prerequisites, run instructions.

## Step 4b — Privy optional-peer-dep shim (unplanned)

- `vite build` failed: Privy 2.25.0's `/solana` entry statically imports
  symbols from its OPTIONAL peer deps `@solana/kit`, `@solana-program/system`,
  and `@solana-program/token` (used only by its funding features). Installing
  `@solana/kit` is explicitly forbidden for this project, so
  `app/src/lib/wallet/shims/solana-kit-shim.ts` exports every symbol Privy
  references as a throwing stub, and `vite.config.ts` aliases all three
  packages to it. If a Privy upgrade adds imports, the build fails loudly with
  MISSING_EXPORT — the shim header documents how to re-derive the list.
- Also fixed the wallet hook: on 2.25.0 the `/solana` path exports
  `useSolanaWallets` (not `useWallets`); `useSignTransaction` is present as
  expected (gotcha #1 confirmed).

## Step 7 — Verification

- Frontend: `npm run build` (tsc + vite) passes; `npm run dev` serves on
  localhost (HTTP 200 smoke-checked).
- Program: `cargo check` passes and `anchor idl build` succeeds — IDL emitted
  at `target/idl/acertana.json` with program name `acertana`, instructions
  `create_pool` / `commit_picks`, accounts `Pool` / `Entry`.
- **Caveat**: full `anchor build` (SBF `.so`) could not run in this sandbox —
  it downloads Solana `platform-tools` from github.com, which the session's
  egress policy blocks (403; release.anza.xyz works, github.com does not).
  Everything Rust-side that can compile without the SBF toolchain compiles.
  Run `anchor build` once on a normal network to confirm; no code changes are
  expected.

## Goal 4 — frontend base flow (join → picks → commit)

Wired `/j/:code` (join code → Privy email login → join POST → pool page) and
`/p/:poolPubkey` (fixture list, commit_pick built client-side mirroring
backend/src/program.ts, sent via `Connection(VITE_RPC_URL)` behind a mockable
`ChainClient`). Minimal hand-rolled router (app/src/lib/router.ts) — no
react-router dep. Fixtures come from a static module
(app/src/lib/fixtures.ts) because the backend has no GET fixtures route yet —
TODO(real endpoint).

Manual-path caveats:
- **HTTPS/Privy**: Privy embedded wallets need WebCrypto, so the app must be
  served over HTTPS (localhost is exempt). The embedded wallet is created
  AFTER login completes — pages gate signing on `ready` + `address`.
- **Env vars** (app/.env.example): `VITE_PRIVY_APP_ID` (Privy dashboard),
  `VITE_BACKEND_URL` (Fastify backend base URL), `VITE_RPC_URL` (Solana RPC —
  localnet `http://127.0.0.1:8899` or a devnet endpoint). Backend fetches and
  chain sends throw early with a clear message if unset.
- Commit flow POSTs the plaintext pick + salt to `POST /picks` (backend
  encrypts at rest for auto-reveal), after the on-chain commit confirms.

Gotcha found while testing: an entries-refresh effect that *replaces* state
(`setEntries(Object.fromEntries(...))`) races the post-commit local marker —
the fetch resolves after the commit and clobbers it back to null. Fixed by
merging (fetched non-null wins; null never overwrites an existing key).

## Goals build session, 2026-07-09 (overnight loop)

Autonomous goal loop driven by `docs/GOALS.md`; one stacked PR per goal
(Graphite stack on `davigiroux/acertana-design-spec`).

- **Goal 1 (PR #2)** — program implemented per spec; `anchor build` regenerated
  the program keypair, id is now `9hhdvFyxcW95p3bJMUij5Bsq1rrURK4EfTSjqYv4T5zn`.
  8 LiteSVM (0.6.1) integration tests; ix data built manually in tests to keep
  anchor-lang out of the dev-deps.
- **Goal 2 (PR #3)** — TS commitment lib; hex test vectors generated from the
  Rust keccak first, kept as a permanent Rust cross-check test. Salt message is
  51 bytes ("acertana:v1"=11 + pool 32 + fixture u64 LE 8).
- **Goal 3 (PR #4)** — backend (fastify + better-sqlite3); reveal worker proven
  end-to-end against the compiled .so via solana-bankrun with a clock warp.
- **Goal 4 (PR #6)** — frontend flow with hand-rolled router + mockable
  ChainClient; fixed a post-commit state race in the entries refresh. Fixtures
  come from a static seed mirror until the backend exposes a fixtures endpoint.
- **Goal 5 (PR #5)** — scoring 5/3/1/0 + standings with shared-rank ties;
  ChainEntryProvider (gPA dataSize=116, memcmp pool@8); provisional→final
  results store over the stubbed feed.
- **Goal 6** — full-stack code review sweep, docs, Graphite stack conversion.

Toolchain note: this machine has anchor-cli 1.0.2 + solana-cli 3.1.15; the
crate stays on anchor-lang 0.31.1 and builds/tests fine with both.
