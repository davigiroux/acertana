/** Scoring per design spec §3 (off-chain, fixed). */
export interface Scoreline {
  home: number;
  away: number;
}

export type PickScore = 0 | 1 | 3 | 5;

/**
 * Exact scoreline = 5; correct winner/draw AND goal difference = 3
 * (a predicted draw matching an actual draw with a different score is 3:
 * both differences are 0); correct winner/draw only = 1; else 0.
 */
export function scorePick(pick: Scoreline, result: Scoreline): PickScore {
  if (pick.home === result.home && pick.away === result.away) return 5;
  const pickOutcome = Math.sign(pick.home - pick.away);
  const resultOutcome = Math.sign(result.home - result.away);
  if (pickOutcome !== resultOutcome) return 0;
  if (pick.home - pick.away === result.home - result.away) return 3;
  return 1;
}
