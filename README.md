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

## Deploy (devnet demo)

Backend → Railway (Dockerfile in `backend/`, mount a volume and point `DB_PATH`
at it). App → Vercel (static Vite build of `app/`). Program → devnet via
`FIXTURE_AUTHORITY_PUBKEY=<fresh pubkey> anchor build && anchor deploy`.

Backend env:

| Var | Purpose |
|---|---|
| `PICK_STORE_KEY` | 64-hex AES-256-GCM key for the encrypted pick store |
| `RPC_URL` | Solana RPC (devnet: `https://api.devnet.solana.com`) |
| `FIXTURE_AUTHORITY_KEYPAIR` / `_B64` | authority keypair path, or base64 of its json |
| `PRIVY_APP_ID` / `PRIVY_APP_SECRET` | Privy server auth (required unless `ALLOW_UNAUTHENTICATED=1`) |
| `TXLINE_API_TOKEN` | TxLINE data token — mint once with `npm run txline-subscribe` |
| `TXLINE_API_ORIGIN` / `TXLINE_COMPETITION_ID` | optional TxLINE overrides |
| `CORS_ORIGIN` | comma-separated allowed origins (the app's URL) |
| `ADMIN_TOKEN` | enables `POST /admin/results` for manual result injection |
| `DB_PATH` | SQLite path (persistent volume in prod) |
| `TXLINE_STUB=1` | local dev only: seed fixtures + fake score feed |

App env (`app/.env`): `VITE_PRIVY_APP_ID`, `VITE_BACKEND_URL`, `VITE_RPC_URL`.
Add the deployed app URL to the Privy app's allowed origins.

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
