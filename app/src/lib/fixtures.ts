import { backendUrl } from './api';

/**
 * Fixture list for the pool page, fetched from the backend (which syncs it
 * from TxLINE, or from the dev seed under TXLINE_STUB). FIXTURES below is a
 * static fallback for tests and offline dev.
 */
export interface Fixture {
  fixtureId: number;
  home: string;
  away: string;
  kickoffTs: number; // unix seconds
}

export const FIXTURES: Fixture[] = [
  { fixtureId: 1001, home: 'Mexico', away: 'Poland', kickoffTs: 1783691898 },
  { fixtureId: 1002, home: 'Canada', away: 'Morocco', kickoffTs: 1783702698 },
  { fixtureId: 1003, home: 'USA', away: 'Japan', kickoffTs: 1783706298 },
  { fixtureId: 1004, home: 'Brazil', away: 'Senegal', kickoffTs: 1783709898 },
  { fixtureId: 1005, home: 'Argentina', away: 'Denmark', kickoffTs: 1783713498 },
  { fixtureId: 1006, home: 'France', away: 'Australia', kickoffTs: 1783717098 },
  { fixtureId: 1007, home: 'Spain', away: 'South Korea', kickoffTs: 1783720698 },
  { fixtureId: 1008, home: 'Germany', away: 'Ecuador', kickoffTs: 1783724298 },
];

export async function getFixtures(): Promise<Fixture[]> {
  try {
    const res = await fetch(`${backendUrl()}/fixtures`);
    if (!res.ok) throw new Error(`fixtures fetch failed (${res.status})`);
    const { fixtures } = (await res.json()) as { fixtures: Fixture[] };
    if (fixtures.length > 0) return fixtures;
    console.warn('backend returned no fixtures; falling back to static seed');
    return FIXTURES;
  } catch (err) {
    console.warn('fixtures fetch failed; falling back to static seed', err);
    return FIXTURES;
  }
}
