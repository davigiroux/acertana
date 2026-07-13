/**
 * Fixture list for the pool page.
 *
 * TODO(real endpoint): the backend has no GET fixtures route yet
 * (see backend/src/server.ts). This mirrors backend/fixtures.seed.json;
 * replace with a fetch once the endpoint exists.
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
  // TODO(real endpoint): fetch `${VITE_BACKEND_URL}/fixtures` when added.
  return FIXTURES;
}
