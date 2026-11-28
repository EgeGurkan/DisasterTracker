import { render } from 'preact';
import './fonts.css';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import { App } from './app.tsx';
import { getState, subscribe } from './state.ts';
import { STANDALONE } from './standalone.ts';

function applyLook() {
  const s = getState();
  const root = document.documentElement;
  root.lang = s.lang;
  if (s.theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', s.theme);
  root.style.setProperty('--scale', String(s.textScale));
  if (s.reduceMotion) root.setAttribute('data-reduce-motion', '1');
  else root.removeAttribute('data-reduce-motion');

  const sysDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  const themeColor =
    s.theme === 'amoled' ? '#000000'
    : s.theme === 'dark' ? '#08111F'
    : s.theme === 'light' ? '#F4F2ED'
    : sysDark ? '#08111F' : '#F4F2ED';
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', themeColor));
}
applyLook();
subscribe(applyLook);
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', applyLook);

if ('serviceWorker' in navigator && window.isSecureContext && !import.meta.env.DEV && !STANDALONE) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('/sw.js').catch(() => {}); });
  navigator.serviceWorker.addEventListener('message', (e: MessageEvent) => {
    const d = e.data as { type?: string; url?: string };
    if (d?.type === 'navigate' && d.url) location.hash = d.url.replace(/^\/?#/, '');
    window.dispatchEvent(new CustomEvent('afet-sw', { detail: d }));
  });
}

render(<App />, document.getElementById('app')!);
