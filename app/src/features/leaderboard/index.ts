/**
 * Leaderboard feature — live standings computed off-chain from the TxLINE
 * SSE score stream plus on-chain committed picks.
 *
 * TODO(docs/DECISIONS.md#scoring-scheme): points for result vs exact score.
 * TODO(docs/DECISIONS.md#leaderboard-computation): pool->fixture mapping,
 *   update cadence, and SSE reconnection handling.
 */

export function LeaderboardPage() {
  return null; // TODO: live leaderboard fed by openScoreStream()
}
