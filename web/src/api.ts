import { getState, setState, subscribe } from './state.ts';
import { STANDALONE, standaloneApi } from './standalone.ts';
import { tx } from './i18n.ts';

export class ApiError extends Error {
  status: number;
  constructor(status: number, msg: string) { super(msg); this.status = status; }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown; admin?: string } = {}): Promise<T & { __offline?: boolean }> {
  const method = init.method ?? 'GET';
  const isPublicGet = method === 'GET' && /^\/api\/(events|disasters|reports|sources|stations|faults|alerts|config)(\/|\?|$)/.test(path);
  if (STANDALONE || location.protocol === 'file:') return standaloneApi<T & { __offline?: boolean }>(path, method);
  const headers = new Headers(init.headers);
  const dev = getState().device;
  if (init.admin) headers.set('authorization', `Bearer ${init.admin}`);
  else if (dev) headers.set('authorization', `Device ${dev.id}.${dev.key}`);
  let body = init.body;
  if (init.json !== undefined) { headers.set('content-type', 'application/json'); body = JSON.stringify(init.json); }
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers, body, signal: init.signal ?? AbortSignal.timeout(12_000) });
  } catch {
    if (isPublicGet) return standaloneApi<T & { __offline?: boolean }>(path, method);
    throw new ApiError(0, tx('Kaynağa erişilemiyor. İnternet bağlantını kontrol et.', 'Cannot reach server. Check your internet connection.'));
  }
  if (!res.ok && isPublicGet && [404, 500, 502, 503, 504].includes(res.status)) {
    try { return await standaloneApi<T & { __offline?: boolean }>(path, method); } catch { /* asıl hatayı göster */ }
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    if (res.status === 401 && !init.admin && dev && path.startsWith('/api/devices/me')) {
      // Sunucu cihazı tanımıyor (silinmiş/yeniden kurulmuş): yerel kimliği bırak
      setState(() => ({ device: null }));
    }
    throw new ApiError(res.status, data.error ?? `${tx('Hata', 'Error')} ${res.status}`);
  }
  if (res.headers.get('x-afet-offline') === '1') (data as { __offline?: boolean }).__offline = true;
  return data;
}

export interface Config {
  vapidPublicKey: string;
  env: string;
  transports: Record<string, boolean>;
  eew: { available: boolean; text: string; drillProvider: boolean };
  serverTime: string;
}

let configP: Promise<Config> | null = null;
export function getConfig(): Promise<Config> {
  configP ??= api<Config>('/api/config').catch((e) => { configP = null; throw e; });
  return configP;
}

// ---- Tercih eşitleme: son tercih sunucuya kalıcı yazılır, gönderim anında sunucu son tercihi uygular ----
let syncTimer: number | null = null;
export type SyncStatus = 'idle' | 'pending' | 'saved' | 'offline' | 'error';
let syncStatus: SyncStatus = 'idle';
const syncSubs = new Set<(s: SyncStatus) => void>();
export function onSync(f: (s: SyncStatus) => void) { syncSubs.add(f); f(syncStatus); return () => syncSubs.delete(f); }
function setSync(s: SyncStatus) { syncStatus = s; syncSubs.forEach((f) => f(s)); }

export function scheduleSync(): void {
  if (!getState().device) return;
  setSync('pending');
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => void syncNow(), 600);
}

export async function syncNow(): Promise<void> {
  const s = getState();
  if (!s.device) return;
  try {
    const d = await api<{ env: 'production' | 'drill' }>('/api/devices/me', { method: 'PUT', json: { prefs: s.prefs, label: s.label } });
    if (d.env && d.env !== getState().env) setState(() => ({ env: d.env }));
    setSync('saved');
  } catch (e) {
    setSync(e instanceof ApiError && e.status === 0 ? 'offline' : 'error');
  }
}

/** Ortam (üretim/TEST cihazı) yalnız ekip tarafından atanır; uygulama sunucudan okur. */
export async function refreshDeviceEnv(): Promise<void> {
  if (!getState().device) return;
  try {
    const d = await api<{ env: 'production' | 'drill' }>('/api/devices/me');
    if (d.env && d.env !== getState().env) setState(() => ({ env: d.env }));
  } catch { /* çevrimdışı */ }
}

let lastPrefs = getState().prefs, lastLabel = getState().label;
subscribe(() => {
  const s = getState();
  if (s.prefs !== lastPrefs || s.label !== lastLabel) {
    lastPrefs = s.prefs; lastLabel = s.label;
    scheduleSync();
  }
});
window.addEventListener('online', () => { if (syncStatus === 'offline' || syncStatus === 'error') void syncNow(); });
void refreshDeviceEnv();
setInterval(() => void refreshDeviceEnv(), 5 * 60_000);
