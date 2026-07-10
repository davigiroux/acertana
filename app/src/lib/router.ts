/**
 * Minimal hand-rolled router — two routes, no dependency.
 * Chosen over react-router: lighter, trivially testable via history API.
 */
import { useSyncExternalStore } from 'react';

function subscribe(cb: () => void): () => void {
  window.addEventListener('popstate', cb);
  return () => window.removeEventListener('popstate', cb);
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
}

export function navigate(path: string): void {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export type Route =
  | { name: 'home' }
  | { name: 'join'; code: string }
  | { name: 'pool'; poolPubkey: string }
  | { name: 'notFound' };

export function matchRoute(path: string): Route {
  const join = path.match(/^\/j\/([^/]+)$/);
  if (join) return { name: 'join', code: decodeURIComponent(join[1]) };
  const pool = path.match(/^\/p\/([^/]+)$/);
  if (pool) return { name: 'pool', poolPubkey: decodeURIComponent(pool[1]) };
  if (path === '/') return { name: 'home' };
  return { name: 'notFound' };
}
