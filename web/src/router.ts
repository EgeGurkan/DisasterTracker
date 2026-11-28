import { useEffect, useState } from 'preact/hooks';

export interface Route { path: string[]; query: URLSearchParams; raw: string }

function parse(): Route {
  const h = location.hash.replace(/^#/, '') || '/afetler';
  const [p, q] = h.split('?');
  return { path: (p ?? '').split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(q ?? ''), raw: h };
}

export function useRoute(): Route {
  const [r, setR] = useState(parse);
  useEffect(() => {
    const f = () => setR(parse());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return r;
}

export function go(hash: string): void {
  location.hash = hash.startsWith('#') ? hash : `#${hash}`;
}
