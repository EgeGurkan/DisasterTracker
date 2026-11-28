// Cihaz/kurulum biçimi tespiti ve Web Push desteği. İzin istemeden önce destek kontrol edilir.

import { api, getConfig } from './api.ts';
import { getState, setState } from './state.ts';
import { serverOnlyText, STANDALONE } from './standalone.ts';
import { isEn, tx } from './i18n.ts';

export const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isAndroid = /Android/i.test(navigator.userAgent);
export const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
export const hasTouch = navigator.maxTouchPoints > 0;

export function platformId(): string {
  if (isIOS) return isStandalone ? 'ios-pwa' : 'ios-safari';
  if (isAndroid) return isStandalone ? 'android-pwa' : 'android-web';
  return 'desktop-web';
}

export function platformLabel(p: string): string {
  if (isEn()) {
    return ({
      'ios-pwa': 'iPhone · Home Screen web app', 'ios-safari': 'iPhone · Safari', 'android-pwa': 'Android · Installed web app',
      'android-web': 'Android · Browser', 'desktop-web': 'Desktop browser', 'android-native': 'Android app', 'ios-native': 'iOS app', test: 'Test',
    } as Record<string, string>)[p] ?? p;
  }
  return ({
    'ios-pwa': 'iPhone · ana ekran web uygulaması', 'ios-safari': 'iPhone · Safari', 'android-pwa': 'Android · yüklü web uygulaması',
    'android-web': 'Android · tarayıcı', 'desktop-web': 'Masaüstü tarayıcı', 'android-native': 'Android uygulaması', 'ios-native': 'iOS uygulaması', test: 'Test',
  } as Record<string, string>)[p] ?? p;
}

export type PushSupport =
  | { ok: true }
  | { ok: false; reason: 'standalone' | 'ios-needs-install' | 'no-sw' | 'no-push' | 'insecure'; text: string };

export function pushSupport(): PushSupport {
  if (STANDALONE) return { ok: false, reason: 'standalone', text: serverOnlyText() };
  if (!window.isSecureContext) {
    return { ok: false, reason: 'insecure', text: tx('Bildirimler yalnız güvenli (https) bağlantıda çalışır.', 'Notifications only work over a secure (HTTPS) connection.') };
  }
  if (isIOS && !isStandalone) {
    return {
      ok: false,
      reason: 'ios-needs-install',
      text: tx(
        'iPhone’da web bildirimleri için önce Safari’de Paylaş → “Ana Ekrana Ekle” ile uygulamayı ekle, sonra ana ekrandaki simgeden aç (iOS 16.4 ve üzeri).',
        'For web notifications on iPhone, first tap Share → “Add to Home Screen” in Safari, then open the app from the Home Screen icon (iOS 16.4+).',
      ),
    };
  }
  if (!('serviceWorker' in navigator)) {
    return {
      ok: false,
      reason: 'no-sw',
      text: tx(
        'Bu tarayıcı Service Worker desteklemiyor; bildirim alınamaz. Güncel Chrome, Edge, Firefox veya Safari kullan.',
        'This browser does not support Service Workers; notifications cannot be received. Use an up-to-date Chrome, Edge, Firefox, or Safari.',
      ),
    };
  }
  if (!('PushManager' in window) || !('Notification' in window)) {
    return { ok: false, reason: 'no-push', text: tx('Bu tarayıcı Web Push desteklemiyor.', 'This browser does not support Web Push.') };
  }
  return { ok: true };
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return 'Notification' in window ? Notification.permission : 'unsupported';
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function swRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

/** Bildirim iznini ister, aboneliği oluşturur ve cihazı sunucuya kaydeder/günceller. Kullanıcı hareketiyle çağrılmalı. */
export async function enablePush(): Promise<{ ok: boolean; message: string }> {
  const sup = pushSupport();
  if (!sup.ok) return { ok: false, message: sup.text };
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') {
    return {
      ok: false,
      message: perm === 'denied'
        ? tx(
            'Bildirim izni reddedildi. Tarayıcı/telefon ayarlarından bu site için bildirimlere izin ver, sonra tekrar dene.',
            'Notification permission denied. Allow notifications for this site in browser/device settings, then try again.',
          )
        : tx('Bildirim izni verilmedi.', 'Notification permission was not granted.'),
    };
  }
  const reg = (await swRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'));
  await navigator.serviceWorker.ready;
  const cfg = await getConfig();
  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    const cur = sub.options.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null;
    const want = b64ToBytes(cfg.vapidPublicKey);
    if (!cur || cur.length !== want.length || cur.some((b, i) => b !== want[i])) { await sub.unsubscribe(); sub = null; }
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(cfg.vapidPublicKey) });
  await registerDevice(sub.toJSON());
  return { ok: true, message: tx('Bildirimler bu cihazda açık.', 'Notifications are enabled on this device.') };
}

export async function registerDevice(push: PushSubscriptionJSON | null): Promise<void> {
  const s = getState();
  const body = { label: s.label, platform: platformId(), transport: 'webpush', push, prefs: s.prefs };
  if (s.device) {
    try {
      await api('/api/devices/me', { method: 'PUT', json: body });
      return;
    } catch { /* cihaz sunucuda yoksa yeniden kaydol */ }
  }
  const r = await api<{ deviceId: string; deviceKey: string }>('/api/devices', { method: 'POST', json: body });
  setState(() => ({ device: { id: r.deviceId, key: r.deviceKey } }));
}

export async function disablePush(): Promise<void> {
  const reg = await swRegistration();
  const sub = await reg?.pushManager.getSubscription();
  await sub?.unsubscribe();
  if (getState().device) await api('/api/devices/me', { method: 'PUT', json: { push: null } }).catch(() => {});
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await swRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}
