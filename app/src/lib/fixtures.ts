import { backendUrl } from './api';

/**
 * Fixture list for the pool page — always fetched from the backend, which
 * syncs it from TxLINE (or the dev seed when the backend runs TXLINE_STUB=1).
 * No client-side fallback data: a failed fetch surfaces as an error state.
 */
export interface FixtureResult {
  home: number;
  away: number;
  final: boolean;
}

export interface Fixture {
  fixtureId: number;
  home: string;
  away: string;
  homeFlag?: string;
  awayFlag?: string;
  kickoffTs: number; // unix seconds
  /** Live/final score from the feed; null/absent until the match starts producing events. */
  result?: FixtureResult | null;
}

export async function getFixtures(): Promise<Fixture[]> {
  const res = await fetch(`${backendUrl()}/fixtures`);
  if (!res.ok) throw new Error(`fixtures fetch failed (${res.status})`);
  const { fixtures } = (await res.json()) as { fixtures: Fixture[] };
  return fixtures;
}
