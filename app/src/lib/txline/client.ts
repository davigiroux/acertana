import type { TxlineAuth, ScoreStreamHandler } from './types';

/**
 * TxLINE (TxODDS) client — SCAFFOLD ONLY.
 *
 * The known flow is: guest JWT auth -> subscribe -> activate -> consume the
 * SSE score stream. Endpoints and payload shapes are deliberately NOT filled
 * in from memory — fill each TODO from the live TxLINE docs.
 */

// TODO: fill from live TxLINE docs. Do not guess.
const TXLINE_BASE_URL = import.meta.env.VITE_TXLINE_BASE_URL as string | undefined;

/** Step 1 — obtain a guest JWT. TODO: endpoint + request/response shape. */
export async function authenticateGuest(): Promise<TxlineAuth> {
  void TXLINE_BASE_URL;
  throw new Error('TODO: implement TxLINE guest auth from the live docs');
}

/** Step 2 — subscribe to the fixtures/competition feed. TODO: endpoint + params. */
export async function subscribe(_auth: TxlineAuth): Promise<void> {
  throw new Error('TODO: implement TxLINE subscribe from the live docs');
}

/** Step 3 — activate the subscription. TODO: endpoint + params. */
export async function activate(_auth: TxlineAuth): Promise<void> {
  throw new Error('TODO: implement TxLINE activate from the live docs');
}

/**
 * Step 4 — open the SSE score stream and invoke `onEvent` per score change.
 * Returns a close function.
 *
 * TODO: SSE endpoint, event names, parsing, and reconnection/backoff policy
 * (docs/DECISIONS.md#leaderboard-computation covers cadence + reconnection).
 */
export function openScoreStream(
  _auth: TxlineAuth,
  _onEvent: ScoreStreamHandler,
): () => void {
  throw new Error('TODO: implement TxLINE SSE stream from the live docs');
}
