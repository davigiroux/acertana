import type { Db } from "../db.js";
import type { ResultsStore } from "../results.js";
import type { TxlineClient } from "./client.js";

/** Only chase results this far back — older gaps are stale, not recoverable noise. */
const LOOKBACK_SECONDS = 7 * 24 * 3600;

/**
 * Backfill results the SSE stream missed (design §4): for every fixture past
 * kickoff without a final result, pull the TxLINE scores snapshot and apply
 * it. Replays are harmless — ResultsStore is final-wins. Returns the number
 * of results applied.
 */
export async function backfillResults(
  deps: { db: Db; client: Pick<TxlineClient, "fetchScoreSnapshot">; results: ResultsStore },
  nowTs: number,
): Promise<number> {
  const rows = deps.db
    .prepare("SELECT fixture_id FROM fixtures WHERE kickoff_ts <= ? AND kickoff_ts >= ?")
    .all(nowTs, nowTs - LOOKBACK_SECONDS) as { fixture_id: number }[];
  let applied = 0;
  for (const { fixture_id } of rows) {
    if (deps.results.get(fixture_id)?.final) continue;
    try {
      const event = await deps.client.fetchScoreSnapshot(fixture_id);
      if (!event) continue;
      deps.results.apply(event);
      applied += 1;
    } catch (err) {
      console.error(`score backfill failed for fixture ${fixture_id}:`, err);
    }
  }
  return applied;
}
