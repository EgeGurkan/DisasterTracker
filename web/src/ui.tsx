import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { Icon } from './icons.tsx';
import { api } from './api.ts';
import { fmtNum, getMagClass, isEn, tx } from './i18n.ts';

export function MagBadge({ m, type, size }: { m: number | null; type?: string | null; size?: 'lg' }) {
  const c = getMagClass(m);
  return (
    <div class={`mag ${c.key} ${size ?? ''}`} role="img"
      aria-label={m == null ? tx('Büyüklük bilinmiyor', 'Magnitude unknown') : `${tx('Büyüklük', 'Magnitude')} ${fmtNum(m)}${type ? ' ' + type : ''}, ${c.label}`}>
      <span aria-hidden="true">{m == null ? '?' : fmtNum(m)}</span>
      <small aria-hidden="true">{c.label}</small>
    </div>
  );
}

export function Switch({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; id?: string }) {
  return (
    <span class="switch">
      <input id={id} type="checkbox" role="switch" checked={checked} aria-label={label} onChange={(e) => onChange((e.target as HTMLInputElement).checked)} />
      <span class="track" aria-hidden="true"><span class="knob">{checked ? '' : ''}</span></span>
    </span>
  );
}

export function ToggleRow({ title, desc, example, checked, onChange, badge }: {
  title: string; desc?: ComponentChildren; example?: string; checked: boolean; onChange: (v: boolean) => void; badge?: ComponentChildren;
}) {
  return (
    <div class="toggle-row">
      <div class="txt">
        <div class="row wrap" style="gap:6px">
          <strong>{title}</strong>{badge}
          <span class={`pill ${checked ? 'teal' : 'neutral'}`}>{checked ? tx('Açık', 'On') : tx('Kapalı', 'Off')}</span>
        </div>
        {desc && <div class="small muted">{desc}</div>}
        {example && (
          <div class="ex">
            <span class="sr-only">{tx('Örnek bildirim: ', 'Example notification: ')}</span>
            <strong aria-hidden="true">{tx('Örnek: ', 'Example: ')}</strong>{example}
          </div>
        )}
      </div>
      <Switch checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ComponentChildren }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.(); };
  }, []);
  // Panel body'ye taşınır: üst bardaki backdrop-filter, içindeki position:fixed öğeleri o bara hapsediyor.
  return createPortal(
    <>
      <div class="sheet-backdrop" onClick={onClose} />
      <div class="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div class="grab" aria-hidden="true" />
        <div class="sheet-head">
          <strong style="flex:1">{title}</strong>
          <button class="btn sm ghost" onClick={onClose} aria-label={tx('Paneli kapat', 'Close panel')}><Icon name="close" /> {tx('Kapat', 'Close')}</button>
        </div>
        {children}
      </div>
    </>,
    document.body,
  );
}

let toastSet: ((m: string | null) => void) | null = null;
export function toast(m: string) { toastSet?.(m); }
export function ToastHost() {
  const [m, setM] = useState<string | null>(null);
  useEffect(() => { toastSet = setM; return () => { toastSet = null; }; }, []);
  useEffect(() => { if (!m) return; const t = setTimeout(() => setM(null), 4000); return () => clearTimeout(t); }, [m]);
  return <div aria-live="polite" role="status">{m && <div class="toast">{m}</div>}</div>;
}

export function useFetch<T>(url: string | null, deps: unknown[] = [], refreshMs = 0): { data: T | null; error: string | null; loading: boolean; offline: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    setLoading(true);
    const run = () => api<T>(url)
      .then((d) => { if (alive) { setData(d); setOffline(!!(d as { __offline?: boolean }).__offline); setError(null); } })
      .catch((e: Error) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    void run();
    const t = refreshMs ? setInterval(run, refreshMs) : null;
    return () => { alive = false; if (t) clearInterval(t); };
  }, [url, n, ...deps]);
  const reload = useCallback(() => setN((x) => x + 1), []);
  return { data, error, loading, offline, reload };
}

/** Yenile düğmesi: yüklenirken döner. */
export function RefreshButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button class={`btn sm refresh-btn ${loading ? 'busy' : ''}`} onClick={onClick} aria-label={loading ? tx('Yenileniyor', 'Refreshing') : tx('Yenile', 'Refresh')} aria-busy={loading}>
      <Icon name="refresh" />
    </button>
  );
}

/**
 * Dokunmatik ekranda sayfa en üstteyken aşağı çekince yeniler.
 * Klavye ve ekran okuyucu kullanıcıları için aynı işlev Yenile düğmesindedir.
 */
export function PullToRefresh({ onRefresh, loading }: { onRefresh: () => void; loading: boolean }) {
  const [pull, setPull] = useState(0);
  const start = useRef<number | null>(null);
  const pullRef = useRef(0);
  const TRIGGER = 72;
  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      if (window.scrollY > 0 || document.querySelector('.sheet')) { start.current = null; return; }
      start.current = e.touches[0]!.clientY;
    };
    const onMove = (e: TouchEvent) => {
      if (start.current == null) return;
      const dy = e.touches[0]!.clientY - start.current;
      if (dy <= 0 || window.scrollY > 0) { pullRef.current = 0; setPull(0); return; }
      const v = Math.min(120, dy * 0.5);
      pullRef.current = v;
      setPull(v);
      if (v > 8 && e.cancelable) e.preventDefault();
    };
    const onEnd = () => {
      if (start.current != null && pullRef.current >= TRIGGER * 0.6) onRefresh();
      start.current = null; pullRef.current = 0; setPull(0);
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [onRefresh]);
  const show = pull > 4 || loading;
  const ready = pull >= TRIGGER * 0.6;
  return (
    <div class="ptr" aria-hidden="true" style={{ height: loading ? '44px' : `${pull}px`, opacity: show ? 1 : 0 }}>
      <span class={`ptr-dot ${loading ? 'spinning' : ''}`} style={{ transform: loading ? undefined : `rotate(${pull * 3}deg)` }}><Icon name="refresh" /></span>
      <span class="small muted">{loading ? tx('Yenileniyor…', 'Refreshing…') : ready ? tx('Bırak, yenilensin', 'Release to refresh') : tx('Yenilemek için çek', 'Pull to refresh')}</span>
    </div>
  );
}

export function Ext({ href, children }: { href: string; children: ComponentChildren }) {
  return <a href={href} target="_blank" rel="noopener noreferrer">{children}<span class="sr-only">{tx(' (yeni pencerede açılır)', ' (opens in new tab)')}</span> <span aria-hidden="true">↗</span></a>;
}

export function Notice({ kind = '', icon = 'info', children }: { kind?: '' | 'amber' | 'red' | 'teal' | 'green'; icon?: string; children: ComponentChildren }) {
  return <div class={`notice ${kind}`}><Icon name={icon} /><div>{children}</div></div>;
}

export function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return tx('bilinmiyor', 'unknown');
  if (Math.abs(ms) < 1000) return `${Math.round(ms)} ms`;
  const en = isEn();
  return `${(ms / 1000).toLocaleString(en ? 'en-US' : 'tr-TR', { maximumFractionDigits: 2 })} ${en ? 's' : 'sn'}`;
}
