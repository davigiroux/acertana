# Acertana backend

Single Node 22 + TypeScript service: pool join codes + roster (SQLite), encrypted
pick storage, fixture-authority registration, permissionless auto-reveal worker,
TxLINE stub feed.

## Run

```sh
cd backend
npm i
npm test        # vitest (includes bankrun test against target/deploy/acertana.so)
npm run build   # tsc
PICK_STORE_KEY=$(openssl rand -hex 32) npm run dev
```

## Env vars

| Var | Meaning |
|---|---|
| `PICK_STORE_KEY` | 32-byte hex AES-256-GCM key for pick payloads at rest (required) |
| `DB_PATH` | SQLite file path (default `acertana.db`) |
| `PORT` | HTTP port (default 8787) |
| `FIXTURE_AUTHORITY_KEYPAIR` | path to fixture-authority keypair JSON (default `../tests/fixtures/fixture-authority.json`) |

## Routes (no auth yet — TODO verify Privy token)

- `POST /pools` `{name, organizer, poolPubkey}` → `{joinCode}`
- `GET /j/:code` → `{poolPubkey, name}` (404 unknown)
- `POST /pools/:pubkey/join` `{wallet, emailHint?}` (idempotent)
- `GET /pools/:pubkey/members`
- `POST /picks` `{poolPubkey, wallet, fixtureId, homeGoals, awayGoals, saltHex}` — stored AES-GCM encrypted

## Modules

- `src/db.ts` — schema (pools / members / picks)
- `src/crypto.ts` — AES-256-GCM pick payload encryption
- `src/joinCodes.ts` — 6-char unambiguous join codes, collision-safe insert
- `src/program.ts` — manual Anchor ix building (sha256 `global:<name>` discriminators + borsh args), PDAs, keccak commitment helper (dup of `app/src/lib/commitment`)
- `src/fixtureAuthority.ts` — signs `register_fixture` txs from `fixtures.seed.json`
- `src/revealWorker.ts` — post-kickoff permissionless `reveal_pick` submission
- `src/txline/stub.ts` — stub fixture list + fake score-event iterator (real TxLINE TODO)
