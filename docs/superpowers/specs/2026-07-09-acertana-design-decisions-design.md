# Acertana — Design Decisions (resolved)

Date: 2026-07-09

Resolves the seven open questions in [`docs/DECISIONS.md`](../../DECISIONS.md). The
scaffold's `TODO(docs/DECISIONS.md#...)` markers can now be implemented against
this spec. No implementation plan is written yet (spec only).

## Product frame (unchanged)

Free-to-play World Cup **bolão**. Friends join a pool by link, predict scorelines
before kickoff, a leaderboard updates live from the TxLINE feed. Bragging rights
only — **no money, no stakes, ever**. Email sign-up creates an invisible Solana
wallet (Privy). The chain's *only* job is tamper-proof, kickoff-locked,
copy-proof pick commitment.

## 1. Pick data model

A pick is a **predicted exact scoreline** for one fixture: two goal counts
(`home_goals`, `away_goals`, each `u8`). Scored on **both** the result and the
exact score (see §3). Fixed-size — no opaque `Vec<u8>` blob.

## 2. Commit unit & strategy

- **One `Entry` per fixture**, PDA `["entry", pool, participant, fixture_id]`.
  Each match is committed and locked independently at its own kickoff.
- **Salted commit-reveal.** Before kickoff the Entry stores only
  `commitment = keccak(home_goals ‖ away_goals ‖ salt)`. After kickoff the
  plaintext is revealed and verified against the commitment.
- **Why salted:** a scoreline has ~100 plausible values, so a bare
  `hash(home,away)` is brute-forceable. The secret salt is what makes the
  commitment hiding.
- **Salt derivation:** per-fixture, derived client-side from a wallet signature
  over a domain-separated message `"acertana:v1" ‖ pool ‖ fixture_id`. Revealing
  one pick never exposes another; picks can't be correlated pre-kickoff.
- **Auto-reveal:** the backend stores each pick's plaintext + salt **encrypted at
  rest** and submits the reveal tx after kickoff. A client-side reveal on next
  app open is the fallback. The reveal tx is **permissionless** (it only proves a
  preimage), so any payer can submit it. Operator-visibility tradeoff accepted:
  the commit-reveal's job is to stop *co-players* copying, and there is no money.

## 3. Scoring scheme (off-chain, fixed)

Per revealed pick, versus the final result:

| Outcome | Points |
|---|---|
| Exact scoreline correct | **5** |
| Correct winner/draw **and** correct goal difference | **3** |
| Correct winner/draw only | **1** |
| Wrong result | **0** |

Draw handling: a predicted draw that matches the result but not the score scores
at the goal-difference tier (both differences are 0) → 3.

## 4. Leaderboard computation (off-chain)

- **Scope:** a pool covers the **whole tournament** (all fixtures). One running
  leaderboard = Σ scores over every roster member's revealed entries.
- **Source of picks:** `getProgramAccounts` for `Entry` filtered by `pool` (the
  `pool` field is stored on `Entry` precisely to enable this memcmp filter).
- **Source of results:** the TxLINE SSE score stream (never on-chain).
- **Cadence:** provisional standings recompute live on each score event;
  finalized on match-end.
- **Reconnection:** resume the SSE stream via last-event-id, then backfill from a
  fixtures snapshot to cover any gap before resuming live updates.

## 5. Kickoff-lock source

An **on-chain `Fixture` registry**, one account per match, seeds
`["fixture", fixture_id]`, holding `kickoff_ts`. Written by a **fixture
authority** (the app backend) from TxLINE data via `register_fixture`, gated on a
program-known (rotatable) authority key. `commit_pick` reads `Fixture.kickoff_ts`
and enforces `Clock::now < kickoff_ts`. Trust reduces to "the authority set
correct kickoff times once" — and the World Cup schedule is public and immutable.
No backend is needed at commit time.

## 6. Pool join flow

- Share link `acertana.app/j/<code>`; the backend maps the short **join code →
  pool pubkey**.
- Opening it: email sign-in → invisible wallet → backend adds the user to the
  pool **roster (off-chain DB)**.
- **No on-chain membership account.** A participant's only on-chain footprint is
  their picks. `Pool` remains on-chain as a validated identity anchor that entries
  reference.

## 7. PDA seeds & account sizing

`fixture_id` is a **`u64`**: the fixture authority maps TxLINE's native id to a
stable u64, keeping every seed and account size fixed regardless of TxLINE's id
format.

| Account | PDA seeds | Fields | Size (bytes) |
|---|---|---|---|
| `Fixture` | `["fixture", fixture_id: u64]` | `fixture_id u64`, `kickoff_ts i64`, `bump u8` | 8 + 8 + 8 + 1 = **25** |
| `Pool` | `["pool", organizer: Pubkey, pool_id: u64]` | `organizer Pubkey`, `pool_id u64`, `name String≤32`, `bump u8` | 8 + 32 + 8 + (4+32) + 1 = **85** |
| `Entry` | `["entry", pool: Pubkey, participant: Pubkey, fixture_id: u64]` | `pool Pubkey`, `participant Pubkey`, `fixture_id u64`, `commitment [u8;32]`, `revealed bool`, `home_goals u8`, `away_goals u8`, `bump u8` | 8 + 32 + 32 + 8 + 32 + 1 + 1 + 1 + 1 = **116** |

`home_goals` / `away_goals` are meaningful only when `revealed == true` (0 before
reveal). Rent per Entry ≈ 0.0009 SOL — negligible.

## Instruction set

1. `register_fixture(fixture_id: u64, kickoff_ts: i64)` — fixture-authority-only;
   inits `Fixture`.
2. `create_pool(pool_id: u64, name: String)` — organizer; inits `Pool`.
3. `commit_pick(fixture_id: u64, commitment: [u8;32])` — participant; inits
   `Entry`; `require!(Clock::now < Fixture.kickoff_ts)`; stores hash only.
4. `reveal_pick(home_goals: u8, away_goals: u8, salt: [u8;32])` — permissionless;
   `require!(Clock::now >= Fixture.kickoff_ts)` (reveal only after kickoff, so an
   early reveal can't leak the pick to co-players);
   `require!(keccak(home_goals ‖ away_goals ‖ salt) == entry.commitment)`; sets
   `revealed = true` and the goal fields.

## Guardrails (unchanged, must hold)

No token custody, no escrow, no staking, no value transfer anywhere in the
program. The only on-chain data is fixtures (public schedule), pool identity, and
committed/revealed picks.

## Explicitly out of scope for the first build

- Implementation plan (deferred — spec only per this session).
- TxLINE endpoint/payload shapes (fill from live docs during the backend build).
- Fixture-authority key management beyond a single rotatable key.
- Anchor 1.x upgrade (staying on the pinned 0.31.1 pair — see `docs/BUILD_LOG.md`).
