# Acertana — Autonomous Build Goals

Driver doc for the overnight build loop. Spec of record:
`docs/superpowers/specs/2026-07-09-acertana-design-decisions-design.md`.
The loop works goals top-to-bottom, updates `Status`, and never marks a goal
`done` unless its **Done =** criteria pass. Max **3 verify-fix cycles** per
goal; then mark `blocked(<reason>)` with notes and move on. One branch + draft
PR per goal, stacked on `davigiroux/acertana-design-spec`.

End state: base app runs locally end-to-end; remaining human work is UX/UI
polish only.

Model routing: mechanical/glue → sonnet subagents; program logic, crypto,
security review → session model (Fable).

## Goal 1 — Anchor program

Implement the 4 instructions (`register_fixture`, `create_pool`, `commit_pick`,
`reveal_pick`), PDAs, exact sizing, kickoff gates per spec §2/§5/§7. Fixture
authority = program constant (rotatable later). Local only — NO devnet deploy.

- Done = `cargo check` clean + TS test suite green on a local validator or
  bankrun-style harness, covering: happy path; commit at/after kickoff rejected;
  reveal before kickoff rejected; bad preimage rejected; duplicate entry
  rejected; wrong-authority register_fixture rejected.
- Status: done — PR #2 (8 litesvm tests green)

## Goal 2 — Commit-reveal client lib

`app/src/lib/commitment/`: keccak commitment matching the program byte-for-byte,
per-fixture salt derived from a wallet signature over
`"acertana:v1" ‖ pool ‖ fixture_id` (spec §2).

- Done = vitest round-trip: TS commitment == program-side hash for a test-vector
  table (incl. 0–0, 9–9); salt derivation deterministic per (pool, fixture) and
  distinct across fixtures.
- Status: done — PR #3 (11 vitest + Rust cross-check green)

## Goal 3 — Backend skeleton

`backend/` (Node + TS, single service): join-code→pool map + roster (SQLite),
fixture-authority signer + `register_fixture` submitter, auto-reveal worker
(encrypted-at-rest pick store), TxLINE proxy with **stubbed** feed (real
endpoints stay TODO). Provide a `fixtures.seed.json` dev dataset.

- Done = vitest integration: create pool → join via code → roster returns
  member; reveal worker submits a valid reveal against the program on a local
  validator (or bankrun); encrypted store round-trips.
- Status: pending

## Goal 4 — Frontend base flow

Wire features: join link route → Privy email login → invisible wallet →
pick UI (scoreline per fixture from seed data) → commit tx → post-kickoff
revealed state. Plain, functional UI only — polish is explicitly out of scope.

- Done = `npm run build` green + vitest component/flow tests green with wallet +
  chain mocked; manual-path notes in BUILD_LOG for the HTTPS/Privy caveat.
- Status: pending

## Goal 5 — Scoring + leaderboard engine

Pure scoring fn (5/3/1/0 per spec §3, draw rule explicit) + leaderboard
aggregation from Entry-shaped inputs; SSE ingestion behind an interface with the
stub feed. Lives in backend, exposed via one `GET /pools/:id/leaderboard`.

- Done = unit-test table covering every scoring tier + draw edge cases;
  aggregation test over a multi-member fixture set; endpoint test green.
- Status: done — PR #5 (38 backend tests green, tsc clean)

## Goal 6 — Sweep

`/code-review` across all goal branches, fix confirmed findings, update
README + BUILD_LOG (run instructions for program/backend/app), ensure each PR
is green and self-contained.

- Done = review findings addressed or explicitly waived in PR notes; all builds
  and test suites green from a clean checkout.
- Status: pending

## Pre-blocked (do not attempt)

- Real TxLINE endpoints/credentials — blocked(no creds); keep stubs.
- Devnet deploy — blocked(needs SOL + network); local only per user.
- Privy live login test — blocked(needs VITE_PRIVY_APP_ID); mock in tests.
