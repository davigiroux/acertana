# Acertana

A free-to-play World Cup **bolão** — a group match-prediction pool. Friends join
a pool via a share link, predict match outcomes before kickoff, and a
leaderboard updates live from the TxLINE sports-data feed. Points and bragging
rights only — **no money, no stakes, no betting, ever**.

The differentiator: users sign up with just an email. A Solana wallet is created
under the hood (an *invisible wallet*, via Privy) — no seed phrase, no connect
button. Picks are committed on-chain and locked at kickoff, so nobody — not even
the pool organizer — can rig the result. That tamper-proof commitment is the
only thing the blockchain does here.

## Layout

```
programs/acertana/       Anchor program (pick commitment only)
app/                     Vite + React + TypeScript frontend
  src/lib/wallet/        Privy invisible-wallet setup
  src/lib/txline/        TxLINE (TxODDS) data client stubs
  src/features/pools/    create + join by link
  src/features/picks/    pick UI + kickoff lock
  src/features/leaderboard/
docs/BUILD_LOG.md        step-by-step scaffold log
docs/DECISIONS.md        open design questions (resolve before implementing)
```

## Prerequisites

- Node 22+, Rust/Cargo
- Solana CLI (`curl -sSfL https://release.anza.xyz/stable/install | sh`)
- Anchor CLI 0.31.1 (`cargo install anchor-cli --version 0.31.1 --locked`)

## Run

```sh
# Program: build + full test suite (in-process SVM, no validator needed)
anchor build
cargo test -p acertana

# Backend (join codes, roster, fixture authority, auto-reveal, leaderboard)
cd backend
npm install
npm test               # includes an e2e reveal test against the real .so
PICK_STORE_KEY=<64-hex> npm run dev

# Frontend
cd app
cp .env.example .env   # fill VITE_PRIVY_APP_ID, VITE_BACKEND_URL, VITE_RPC_URL
npm install
npm test
npm run dev
```

Note: Privy's embedded wallet needs HTTPS (localhost is exempt). Deploy to an
HTTPS URL early for phone / local-network testing.

## Security notes

- `tests/fixtures/fixture-authority.json` is a PUBLISHED DEV KEY whose pubkey
  is the hardcoded on-chain `FIXTURE_AUTHORITY`. Fine while local-only; MUST
  be rotated (fresh keypair kept out of git + program upgrade) before any real
  deploy.

## Status

Base app implemented per the design spec
(`docs/superpowers/specs/2026-07-09-acertana-design-decisions-design.md`):
program + tests, commit-reveal client lib, backend service, frontend flow,
scoring/leaderboard. Build story: `docs/BUILD_LOG.md`; goal tracker:
`docs/GOALS.md`. Historical open questions: `docs/DECISIONS.md` (all resolved
in the spec). Still stubbed: real TxLINE endpoints, devnet deploy, live Privy
login (see GOALS pre-blocks).
