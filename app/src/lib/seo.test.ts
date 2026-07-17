import { describe, it, expect } from 'vitest';
import { titleForRoute, DEFAULT_TITLE } from './seo';
import { matchRoute } from './router';

describe('titleForRoute', () => {
  it('uses the default title on the landing page', () => {
    expect(titleForRoute(matchRoute('/'))).toBe(DEFAULT_TITLE);
  });

  it('gives every route a distinct title ending in the site name', () => {
    const paths = ['/home', '/novo', '/j/ABC123', '/p/somepubkey', '/nope'];
    const titles = paths.map((p) => titleForRoute(matchRoute(p)));
    expect(new Set(titles).size).toBe(titles.length);
    for (const t of titles) expect(t).toMatch(/— Acertana$/);
  });
});
