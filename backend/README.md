# Acertana backend

Single Node 22 + TypeScript service: pool join codes + roster (SQLite), encrypted
pick storage, fixture-authority registration, permissionless auto-reveal worker,
TxLINE stub feed.

> **SECURITY:** the default fixture-authority keypair
> (`tests/fixtures/fixture-authority.json`) is a PUBLISHED DEV KEY committed to
> the repo, and its pubkey is the hardcoded on-chain `FIXTURE_AUTHORITY`.
> Acceptable only while local-only. Before ANY real deploy: generate a fresh
> keypair kept out of git and ship a program upgrade with the new pubkey.

## Run

```sh
cd backend
npm i
npm test        # vitest (includes bankrun test against target/deploy/acertana.so)
npm run build   # tsc
PICK_STORE_KEY=$(openssl rand -hex 32) npm run dev

# Register seed fixtures on-chain (idempotent; skips already-registered):
RPC_URL=http://127.0.0.1:8899 npm run register-fixtures
```

## Env vars

| Var | Meaning |
|---|---|
| `PICK_STORE_KEY` | 32-byte hex AES-256-GCM key for pick payloads at rest (required) |
| `DB_PATH` | SQLite file path (default `acertana.db`) |
| `PORT` | HTTP port (default 8787) |
| `RPC_URL` | Solana RPC endpoint (default `http://127.0.0.1:8899`) |
| `FIXTURE_AUTHORITY_KEYPAIR` | path to fixture-authority keypair JSON (default `../tests/fixtures/fixture-authority.json`) |
| `REVEAL_INTERVAL_MS` | auto-reveal worker interval (default 60000) |
| `TXLINE_STUB` | set to `1` to feed the fake TxLINE stub scores into the results store; otherwise results start empty and the leaderboard is provisional-empty until real TxLINE lands |

## Routes (no auth yet — TODO verify Privy token)

- `POST /pools` `{name, organizer, poolPubkey}` → `{joinCode}`
- `GET /j/:code` → `{poolPubkey, name}` (404 unknown)
- `POST /pools/:pubkey/join` `{wallet, emailHint?}` (idempotent)
- `GET /pools/:pubkey/members`
- `POST /picks` `{poolPubkey, wallet, fixtureId, homeGoals, awayGoals, saltHex}` — stored AES-GCM encrypted; 409 if a pick already exists for (pool, wallet, fixture)

## Modules

- `src/db.ts` — schema (pools / members / picks)
- `src/crypto.ts` — AES-256-GCM pick payload encryption
- `src/joinCodes.ts` — 6-char unambiguous join codes, collision-safe insert
- `src/program.ts` — manual Anchor ix building (sha256 `global:<name>` discriminators + borsh args), PDAs, keccak commitment helper (dup of `app/src/lib/commitment`)
- `src/fixtureAuthority.ts` — signs `register_fixture` txs from `fixtures.seed.json`
- `src/registerFixtures.ts` — CLI: registers seed fixtures on-chain (`npm run register-fixtures`)
- `src/revealWorker.ts` — post-kickoff permissionless `reveal_pick` submission
- `src/txline/stub.ts` — stub fixture list + fake score-event iterator (real TxLINE TODO)
