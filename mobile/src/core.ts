// Mobil çekirdek: yerel durum, dil algılama, tema, sunucu API'si, push kaydı ve makbuzlar.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { DevicePrefs, Lang, PushPayload, ThemeMode } from '../../shared/src/types.ts';
import { defaultPrefs, sanitizePrefs } from '../../shared/src/defaults.ts';

export const API_BASE: string = (Constants.expoConfig?.extra as { apiBase?: string } | undefined)?.apiBase ?? 'http://localhost:8787';

export function detectDeviceLang(): Lang {
  try {
    const loc = (Intl.DateTimeFormat().resolvedOptions().locale || '').toLowerCase();
    return loc.startsWith('tr') ? 'tr' : 'en';
  } catch {
    return 'en';
  }
}

export interface Contact { id: string; name: string; phone: string }
export interface MobileState {
  device: { id: string; key: string } | null;
  label: string;
  env: 'production' | 'drill';
  lang: Lang;
  langExplicit: boolean;
  theme: ThemeMode;
  prefs: DevicePrefs;
  contacts: Contact[];
  lastTestId: string | null;
}

const KEY = 'afet:mobile:v1';
const VALID_THEMES: ThemeMode[] = ['system', 'light', 'dark', 'amoled'];
const initLang = detectDeviceLang();

let state: MobileState = {
  device: null,
  label: `${Device.modelName ?? (initLang === 'en' ? 'Phone' : 'Telefon')}`,
  env: 'production',
  lang: initLang,
  langExplicit: false,
  theme: 'system',
  prefs: { ...defaultPrefs(), lang: initLang },
  contacts: [],
  lastTestId: null,
};
const subs = new Set<() => void>();

export const mtx = (tr: string, en: string): string => (state.lang === 'en' ? en : tr);

export async function loadState(): Promise<MobileState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MobileState>;
      const explicit = parsed.langExplicit === true && (parsed.lang === 'tr' || parsed.lang === 'en');
      const resolvedLang: Lang = explicit ? parsed.lang! : detectDeviceLang();
      const theme: ThemeMode = VALID_THEMES.includes(parsed.theme as ThemeMode) ? (parsed.theme as ThemeMode) : 'system';
      state = {
        ...state,
        ...parsed,
        lang: resolvedLang,
        langExplicit: explicit,
        theme,
        prefs: sanitizePrefs({ ...(parsed.prefs ?? state.prefs), lang: resolvedLang }),
      };
    }
  } catch { /* ilk açılış */ }
  subs.forEach((f) => f());
  return state;
}
export function getState(): MobileState { return state; }
export function setState(patch: Partial<MobileState>): void {
  const prefsChanged = patch.prefs && patch.prefs !== state.prefs;
  state = { ...state, ...patch };
  if (patch.prefs) state.prefs = sanitizePrefs({ ...patch.prefs, lang: state.lang });
  void AsyncStorage.setItem(KEY, JSON.stringify(state));
  subs.forEach((f) => f());
  if ((prefsChanged || patch.label || patch.env || patch.lang) && state.device) void syncPrefs();
}
export function setLang(next: Lang | 'auto'): void {
  if (next === 'auto') {
    const detected = detectDeviceLang();
    setState({ lang: detected, langExplicit: false, prefs: sanitizePrefs({ ...state.prefs, lang: detected }) });
    return;
  }
  setState({ lang: next, langExplicit: true, prefs: sanitizePrefs({ ...state.prefs, lang: next }) });
}
export function setTheme(theme: ThemeMode): void {
  setState({ theme });
}
export function cycleTheme(): ThemeMode {
  const order: ThemeMode[] = ['light', 'dark', 'amoled', 'system'];
  const next = order[(order.indexOf(state.theme) + 1) % order.length]!;
  setTheme(next);
  return next;
}
export function subscribe(f: () => void): () => void { subs.add(f); return () => { subs.delete(f); }; }

export async function api<T>(path: string, init: { method?: string; json?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (state.device) headers.authorization = `Device ${state.device.id}.${state.device.key}`;
  const r = await fetch(API_BASE + path, { method: init.method ?? 'GET', headers, body: init.json !== undefined ? JSON.stringify(init.json) : undefined });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(j.error ?? `${mtx('Hata', 'Error')} ${r.status}`);
  return j;
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;
export function syncPrefs(): Promise<void> {
  if (syncTimer) clearTimeout(syncTimer);
  return new Promise((resolve) => {
    syncTimer = setTimeout(async () => {
      try {
        const d = await api<{ env?: 'production' | 'drill' }>('/api/devices/me', { method: 'PUT', json: { prefs: state.prefs, label: state.label } });
        if (d.env && d.env !== state.env) setState({ env: d.env });
      } catch { /* çevrimdışı: sonra */ }
      resolve();
    }, 500);
  });
}

export function platformId(): string { return Platform.OS === 'ios' ? 'ios-native' : 'android-native'; }

/** Android bildirim kanalları. Kullanıcı ses/titreşimi sistem ayarlarından kanal bazında değiştirebilir. */
export async function ensureChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('deprem', { name: mtx('Depremler (yakın ve kayıtlı konumlar, dünya)', 'Earthquakes (nearby, saved places, worldwide)'), importance: Notifications.AndroidImportance.HIGH, lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC, vibrationPattern: [0, 200, 100, 200] });
  await Notifications.setNotificationChannelAsync('deprem-sessiz', { name: mtx('Depremler (sessiz saatler)', 'Earthquakes (quiet hours)'), importance: Notifications.AndroidImportance.DEFAULT, sound: null, lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC });
  await Notifications.setNotificationChannelAsync('erken-uyari', { name: mtx('Sarsıntı erken uyarısı (bulunduğun bölge)', 'Earthquake early warning (your area)'), importance: Notifications.AndroidImportance.MAX, sound: 'siren.wav', bypassDnd: true, lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC, vibrationPattern: [0, 600, 200, 600, 200, 600] });
  await Notifications.setNotificationChannelAsync('erken-uyari-uzak', { name: mtx('Sarsıntı uyarısı (uzaktaki kayıtlı konum)', 'Shaking alert (remote saved place)'), importance: Notifications.AndroidImportance.HIGH, lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC });
  await Notifications.setNotificationChannelAsync('test', { name: mtx('Bildirim denemesi', 'Notification test'), importance: Notifications.AndroidImportance.HIGH });
}

export interface PermissionInfo { granted: boolean; canAskAgain: boolean; critical: boolean | null; text: string }
export async function permissionInfo(): Promise<PermissionInfo> {
  const p = await Notifications.getPermissionsAsync();
  const critical = Platform.OS === 'ios' ? p.ios?.allowsCriticalAlerts ?? false : null;
  return {
    granted: p.granted,
    canAskAgain: p.canAskAgain,
    critical,
    text: p.granted
      ? mtx('Bildirim izni verildi', 'Notification permission granted')
      : p.canAskAgain
        ? mtx('Henüz izin verilmedi', 'Permission not granted yet')
        : mtx('İzin reddedildi — sistem ayarlarından aç', 'Permission denied — enable in system settings'),
  };
}

/** İzin ister, yerel push belirtecini (FCM/APNs) alır ve cihazı sunucuya kaydeder. */
export async function enableNotifications(): Promise<string> {
  if (!Device.isDevice) return mtx('Push bildirimleri yalnız gerçek cihazda çalışır.', 'Push notifications only work on a physical device.');
  await ensureChannels();
  const req = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: true, allowCriticalAlerts: true } });
  if (!req.granted) return mtx('Bildirim izni verilmedi. Ayarlar → Bildirimler → Afet Takip yolundan açabilirsin.', 'Notification permission denied. Enable it in Settings → Notifications → Afet Takip.');
  const tok = await Notifications.getDevicePushTokenAsync();
  const transport = Platform.OS === 'ios' ? 'apns' : 'fcm';
  const body = { label: state.label, platform: platformId(), transport, push: { token: String(tok.data) }, prefs: state.prefs };
  if (state.device) {
    try { await api('/api/devices/me', { method: 'PUT', json: body }); return mtx('Bildirimler açık.', 'Notifications enabled.'); } catch { /* yeniden kaydol */ }
  }
  const r = await api<{ deviceId: string; deviceKey: string }>('/api/devices', { method: 'POST', json: body });
  setState({ device: { id: r.deviceId, key: r.deviceKey } });
  return mtx('Bildirimler açık.', 'Notifications enabled.');
}

/** Cihazdan teslim makbuzu (Service Worker’daki ile aynı uç nokta). */
export async function receipt(p: PushPayload | null, stage: 'received' | 'displayed' | 'opened'): Promise<void> {
  if (!p?.receiptUrl) return;
  try {
    await fetch(API_BASE + p.receiptUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ stage, at: Date.now(), clientNow: Date.now() }) });
  } catch { /* çevrimdışı */ }
}

export function payloadOf(n: Notifications.Notification | Notifications.NotificationResponse['notification']): PushPayload | null {
  const d = n.request.content.data as Record<string, unknown> | undefined;
  const raw = (d?.payload ?? (d as { p?: unknown })?.p) as string | PushPayload | undefined;
  if (!raw) return null;
  try { return typeof raw === 'string' ? (JSON.parse(raw) as PushPayload) : raw; } catch { return null; }
}
