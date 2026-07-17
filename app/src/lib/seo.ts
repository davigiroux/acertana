/**
 * Per-route document titles. Social crawlers only see the static index.html,
 * so this is purely for humans (browser tabs, history, bookmarks).
 */
import type { Route } from './router';

const SITE = 'Acertana';
export const DEFAULT_TITLE = `${SITE} — Bolão da Copa 2026`;

export function titleForRoute(route: Route): string {
  switch (route.name) {
    case 'home':
      return DEFAULT_TITLE;
    case 'myPools':
      return `Meus bolões — ${SITE}`;
    case 'create':
      return `Criar bolão — ${SITE}`;
    case 'join':
      return `Entrar no bolão — ${SITE}`;
    case 'pool':
      return `Bolão — ${SITE}`;
    case 'notFound':
      return `Página não encontrada — ${SITE}`;
  }
}

/** Lets pages refine the title once data loads, e.g. setTitle('Bolão da firma'). */
export function setTitle(prefix: string): void {
  document.title = `${prefix} — ${SITE}`;
}
