/**
 * TxLINE (TxODDS) sports-data types — minimal shapes for the scaffold.
 * TODO: reconcile field names with the live TxLINE docs before implementing.
 */

export interface TxlineAuth {
  /** Guest JWT returned by the auth step. TODO: confirm token field names. */
  token: string;
  expiresAt?: string;
}

export interface Fixture {
  id: string;
  homeTeam: string;
  awayTeam: string;
  /** Kickoff timestamp — the source for the on-chain kickoff lock
   *  (docs/DECISIONS.md#kickoff-lock-source). */
  kickoff: string;
  competition?: string;
}

export interface ScoreEvent {
  fixtureId: string;
  homeScore: number;
  awayScore: number;
  /** e.g. goal, period start/end. TODO: enumerate from live docs. */
  type: string;
  timestamp: string;
}

export type ScoreStreamHandler = (event: ScoreEvent) => void;
