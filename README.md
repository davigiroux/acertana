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
# Program (devnet-configured; builds locally without a validator)
anchor build

# Frontend
cd app
cp .env.example .env   # fill VITE_PRIVY_APP_ID
npm install
npm run dev
```

Note: Privy's embedded wallet needs HTTPS (localhost is exempt). Deploy to an
HTTPS URL early for phone / local-network testing.

## Status

Scaffold only. All design decisions live in `docs/DECISIONS.md`; the build story
so far is in `docs/BUILD_LOG.md`.
