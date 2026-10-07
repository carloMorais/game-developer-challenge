import { useSyncExternalStore } from 'react';

export type LogTab = 'ranking' | 'history';

export type Route =
  | { name: 'menu' }
  | { name: 'options' }
  | { name: 'play' }
  | { name: 'result' }
  | { name: 'log'; tab: LogTab };

/**
 * Minimal hash router: works on any static host without rewrites, survives
 * refresh, and supports the browser back button.
 */
export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/';
  switch (path) {
    case '/options':
      return { name: 'options' };
    case '/play':
      return { name: 'play' };
    case '/result':
      return { name: 'result' };
    case '/log/ranking':
      return { name: 'log', tab: 'ranking' };
    case '/log/history':
      return { name: 'log', tab: 'history' };
    default:
      return { name: 'menu' };
  }
}

export function routeToHash(route: Route): string {
  switch (route.name) {
    case 'menu':
      return '#/';
    case 'log':
      return `#/log/${route.tab}`;
    default:
      return `#/${route.name}`;
  }
}

export function navigate(route: Route, { replace = false } = {}): void {
  const hash = routeToHash(route);
  if (window.location.hash === hash) return;
  if (replace) {
    window.history.replaceState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = hash;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

const getHash = () => window.location.hash;

export function useRoute(): Route {
  return parseRoute(useSyncExternalStore(subscribe, getHash));
}
