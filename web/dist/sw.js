/* Afet Takip Service Worker
 * - Acil ekranı, düdük sesi ve rehber dahil uygulama kabuğunu ilk başarılı yüklemede önbelleğe alır.
 * - Web Push mesajını gösterir ve alım/gösterim/açılış makbuzlarını sunucuya yollar.
 * - Son geçerlilik zamanı geçmiş uyarıyı sessizce geçmişe işler (siren/ses yok).
 */
self.__PRECACHE__ = ["/","/assets/index-DweJapYq.js","/assets/index-uv4f8rTS.css","/assets/plus-jakarta-sans-latin-ext-wght-normal-DmpS2jIq.woff2","/assets/plus-jakarta-sans-latin-wght-normal-eXO_dkmS.woff2","/assets/siren-Bcaeah5E.wav","/assets/whistle-tuq6opzd.wav","/icons/apple-touch-icon.png","/icons/badge-96.png","/icons/icon-192.png","/icons/icon-512.png","/icons/icon-maskable-512.png","/manifest.webmanifest","/siren.wav","/whistle.wav","/index.html"];
self.__VERSION__ = '27795eed90b5';
const CACHE = `afet-${self.__VERSION__}`;
const API_CACHE = 'afet-api';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // Tek tek ekle: bir dosya başarısız olursa hangisi olduğu bilinsin
    const results = await Promise.allSettled(self.__PRECACHE__.map((u) => c.add(new Request(u, { cache: 'reload' }))));
    const failed = results.filter((r) => r.status === 'rejected').length;
    await c.put('/__offline_status', new Response(JSON.stringify({
      version: self.__VERSION__, total: self.__PRECACHE__.length, failed, at: Date.now(),
    }), { headers: { 'content-type': 'application/json' } }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE && k !== API_CACHE) await caches.delete(k);
    await self.clients.claim();
    broadcast({ type: 'offline-status' });
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/__offline_status') {
    event.respondWith(caches.open(CACHE).then((c) => c.match('/__offline_status')).then((r) => r || new Response('{}', { headers: { 'content-type': 'application/json' } })));
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    // Liste ve rapor verileri: ağ öncelikli, çevrimdışında son kopya
    if (/^\/api\/(events|disasters|alerts|reports|sources|stations|faults|config)/.test(url.pathname)) {
      event.respondWith((async () => {
        try {
          const res = await fetch(req);
          if (res.ok) (await caches.open(API_CACHE)).put(req, res.clone());
          return res;
        } catch {
          const hit = await (await caches.open(API_CACHE)).match(req);
          if (hit) {
            const h = new Headers(hit.headers);
            h.set('x-afet-offline', '1');
            return new Response(await hit.blob(), { status: 200, headers: h });
          }
          return new Response(JSON.stringify({ error: 'Kaynağa erişilemiyor (çevrimdışı)' }), { status: 503, headers: { 'content-type': 'application/json' } });
        }
      })());
    }
    return;
  }
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(async () => (await caches.match('/index.html')) || (await caches.match('/'))));
    return;
  }
  event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok && url.pathname.startsWith('/assets/')) caches.open(CACHE).then((c) => c.put(req, res.clone()));
    return res;
  })));
});

async function receipt(p, stage) {
  if (!p || !p.receiptUrl) return;
  try {
    await fetch(new URL(p.receiptUrl, self.location.origin).href, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stage, at: Date.now(), clientNow: Date.now() }), keepalive: true,
    });
  } catch { /* çevrimdışı: makbuz kaybolur, panoda "bilinmiyor" görünür */ }
}

function broadcast(msg) {
  self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => cs.forEach((c) => c.postMessage(msg)));
}

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    const recvAt = Date.now();
    let p = null;
    try { p = event.data ? event.data.json() : null; } catch { p = null; }
    if (!p || p.v !== 1) {
      await self.registration.showNotification('Afet Takip', { body: 'Yeni bildirim', tag: 'genel' });
      return;
    }
    const recv = receipt(p, 'received');
    const expired = p.expiresAtMs && recvAt >= p.expiresAtMs;
    const url = p.url + (p.url.includes('?') ? '&' : '?') + 'd=' + encodeURIComponent(p.deliveryId);
    if (expired) {
      // Süresi geçmiş uyarı: siren ve titreşim yok, yalnız geçmişe kayıt.
      await self.registration.showNotification('Süresi geçmiş uyarı geçmişe işlendi', {
        body: `${p.title} — bu mesajın geçerlilik süresi dolmuştu.`, tag: p.tag, silent: true,
        icon: '/icons/icon-192.png', badge: '/icons/badge-96.png', data: { url, p },
      });
      await Promise.all([recv, receipt(p, 'expired-on-device')]);
      broadcast({ type: 'push', payload: p, expired: true });
      return;
    }
    await self.registration.showNotification(p.title, {
      body: p.body,
      tag: p.tag,
      renotify: !p.silent,
      silent: !!p.silent,
      requireInteraction: !!p.critical,
      vibrate: p.critical ? [600, 200, 600, 200, 600] : p.silent ? undefined : [200, 100, 200],
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      timestamp: p.sentAtMs || recvAt,
      data: { url, p },
    });
    await Promise.all([recv, receipt(p, 'displayed')]);
    broadcast({ type: 'push', payload: p });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil((async () => {
    await receipt(data.p, 'opened');
    const target = new URL(data.url || '/', self.location.origin).href;
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) {
        await c.focus();
        c.postMessage({ type: 'navigate', url: data.url });
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'skip-waiting') self.skipWaiting();
});
