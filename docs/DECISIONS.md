# Acertana — Open Design Decisions

Each of these is deliberately UNDECIDED in the scaffold. Code that touches one
carries a `TODO(docs/DECISIONS.md#...)` marker. Resolve each here first, then
implement.

## Pick data model

What is a "pick" — match result only (1X2), exact score, or both — and how is it
encoded compactly on-chain?

## Commit strategy

Plaintext picks with a per-fixture kickoff lock, or commit-reveal (hash before
kickoff, reveal after) to prevent pick-copying?

## Scoring scheme

How many points for a correct result vs a correct exact score (one simple
scheme, not configurable)?

## Leaderboard computation

Leaderboards are computed off-chain from the TxLINE SSE stream — how do pools
map to fixtures, at what cadence do standings update, and how is stream
reconnection handled?

## PDA seed design and account sizing

What are the PDA seeds and exact account sizes for `Pool` and `Entry`?

## Pool join flow

How does a share link encode the pool, and what does joining actually do (join
code vs deep link; on-chain vs off-chain membership)?

## Kickoff-lock source

Where do fixture kickoff timestamps come from (TxLINE fixtures), and how is the
lock enforced on-chain in `commit_picks`?
