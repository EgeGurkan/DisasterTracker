// Uçtan uca Web Push kanıtı (telefonsuz): gerçek HTTP API + gerçek kuyruk + gerçek VAPID imzası ve
// RFC 8291 aes128gcm şifrelemesi. Push servisi yerel bir emülatördür: VAPID JWT'sini doğrular, yükü
// abonenin özel anahtarıyla çözer ve bir Service Worker gibi alım/gösterim makbuzlarını yollar.
// Gerçek telefon kanıtının yerine geçmez; sunucu hattının doğru çalıştığını gösterir.
//
// Çalıştır: node server/scripts/e2e-webpush.ts

import http from 'node:http';
import https from 'node:https';
import { createDecipheriv, createECDH, createHmac, createPublicKey, randomBytes, verify } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import { createPlatform } from '../src/platform.ts';
import { createHandler } from '../src/app.ts';
import { PushRouter } from '../src/push/router.ts';
import { generateVapid } from '../src/push/webpush.ts';
import { defaultPrefs } from '../../shared/src/defaults.ts';
import type { PushPayload } from '../../shared/src/types.ts';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '../../docs/kanit');
const tmp = join(here, '../../data/e2e');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
mkdirSync(outDir, { recursive: true });

const b64u = (b: Buffer) => b.toString('base64url');
const hmac = (k: Buffer, d: Buffer) => createHmac('sha256', k).update(d).digest();

interface Sub { name: string; ecdh: ReturnType<typeof createECDH>; pub: Buffer; auth: Buffer; endpoint: string; shown: { title: string; body: string; at: number }[] }

function decrypt(sub: Sub, body: Buffer): string {
  const salt = body.subarray(0, 16);
  const idlen = body[20]!;
  const keyid = body.subarray(21, 21 + idlen);
  const ct = body.subarray(21 + idlen);
  const ecdhSecret = sub.ecdh.computeSecret(keyid);
  const prkKey = hmac(sub.auth, ecdhSecret);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), sub.pub, keyid, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), Buffer.from([1])])).subarray(0, 16);
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), Buffer.from([1])])).subarray(0, 12);
  const d = createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  let end = plain.length - 1;
  while (end >= 0 && plain[end] === 0) end--;
  if (plain[end] !== 2) throw new Error('aes128gcm sınırlayıcı yok');
  return plain.subarray(0, end).toString('utf8');
}

function verifyVapid(auth: string, endpoint: string): string {
  const m = /^vapid t=([^,]+),\s*k=(.+)$/.exec(auth);
  if (!m) throw new Error('VAPID başlığı yok');
  const [h, c, s] = m[1]!.split('.');
  const claims = JSON.parse(Buffer.from(c!, 'base64url').toString()) as { aud: string; exp: number; sub: string };
  const raw = Buffer.from(m[2]!, 'base64url');
  const key = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(raw.subarray(1, 33)), y: b64u(raw.subarray(33, 65)) }, format: 'jwk' });
  const ok = verify('sha256', Buffer.from(`${h}.${c}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(s!, 'base64url'));
  if (!ok) throw new Error('VAPID imzası geçersiz');
  if (claims.aud !== new URL(endpoint).origin) throw new Error(`aud uyuşmuyor ${claims.aud}`);
  if (claims.exp * 1000 < Date.now()) throw new Error('VAPID süresi dolmuş');
  return claims.sub;
}

// ---- Platform (gerçek yönlendirici, gerçek uygulama) ----
const vapid = generateVapid('https://afet-takip.example');
const plat = createPlatform({ dbPath: join(tmp, 'e2e.db'), push: new PushRouter(vapid, null, null), publicUrl: '', log: () => {}, opsAlert: (m) => console.warn('[OPS]', m) });
const ADMIN = 'e2e-admin';
const handler = createHandler({ ctx: plat.ctx, worker: plat.worker, vapidPublicKey: vapid.publicKey, adminToken: ADMIN, eewProviders: plat.eewProviders, webRoot: null, env: 'development' });
const app = http.createServer((q, s) => void handler(q, s));
await new Promise<void>((r) => app.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
plat.worker.start(50);

// ---- Push servisi emülatörü ----
const subs = new Map<string, Sub>();
const log: { endpoint: string; vapidSub: string; ttl: string | undefined; urgency: string | undefined; topic: string | undefined; payload: PushPayload }[] = [];
const fake = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (c: Buffer) => chunks.push(c));
  req.on('end', () => {
    const endpoint = `https://${req.headers['x-orig-host']}${req.url}`;
    const sub = subs.get(endpoint);
    try {
      if (!sub) { res.writeHead(410); res.end('gone'); return; }
      const vs = verifyVapid(String(req.headers.authorization), endpoint);
      if (req.headers['content-encoding'] !== 'aes128gcm') throw new Error('içerik kodlaması aes128gcm değil');
      const payload = JSON.parse(decrypt(sub, Buffer.concat(chunks))) as PushPayload;
      log.push({ endpoint, vapidSub: vs, ttl: req.headers.ttl as string, urgency: req.headers.urgency as string, topic: req.headers.topic as string, payload });
      res.writeHead(201); res.end();
      // Cihaz (Service Worker) davranışı: alım → gösterim → makbuzlar
      setTimeout(async () => {
        const post = (stage: string) => fetch(new URL(payload.receiptUrl, base), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ stage, at: Date.now(), clientNow: Date.now() }) });
        await post('received');
        sub.shown.push({ title: payload.title, body: payload.body, at: Date.now() });
        await post('displayed');
      }, 40 + Math.random() * 60);
    } catch (e) {
      res.writeHead(400); res.end(String(e));
      console.error('emülatör reddetti:', e);
    }
  });
});
await new Promise<void>((r) => fake.listen(0, '127.0.0.1', r));
const fakePort = (fake.address() as AddressInfo).port;
const origRequest = https.request;
(https as unknown as { request: unknown }).request = (opts: https.RequestOptions, cb: (r: http.IncomingMessage) => void) =>
  http.request({ ...opts, protocol: 'http:', hostname: '127.0.0.1', host: undefined, port: fakePort, agent: undefined, headers: { ...opts.headers, 'x-orig-host': String(opts.hostname ?? opts.host ?? '') } }, cb);

function newSub(name: string, host: string): Sub {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const s: Sub = { name, ecdh, pub: ecdh.getPublicKey(), auth: randomBytes(16), endpoint: `https://${host}/push/${randomBytes(8).toString('hex')}`, shown: [] };
  subs.set(s.endpoint, s);
  return s;
}

async function call<T>(method: string, path: string, body?: unknown, auth?: string): Promise<T> {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(`${method} ${path}: ${JSON.stringify(j)}`);
  return j as T;
}

// İki cihaz: Android (FCM uç noktası biçimi) ve iPhone ana ekran uygulaması (Apple uç noktası biçimi)
const IZMIR = { lat: 38.4192, lon: 27.1287 };
const ISTANBUL = { lat: 41.0082, lon: 28.9784 };
const devices = [
  { label: 'Android emülatörü (GPS açık, İstanbul)', platform: 'android-web', host: 'fcm.googleapis.com', gps: true },
  { label: 'iPhone emülatörü (GPS kapalı)', platform: 'ios-pwa', host: 'web.push.apple.com', gps: false },
];
const reg: { label: string; sub: Sub; id: string; key: string }[] = [];
for (const d of devices) {
  const sub = newSub(d.label, d.host);
  const prefs = defaultPrefs();
  prefs.saved = [{ id: 'ailem', label: 'Ailem', place: 'İzmir', ...IZMIR, enabled: true, radiusKm: 100, minMag: 3.5 }];
  prefs.world = { enabled: true, minMag: 6.5 };
  prefs.active = d.gps
    ? { enabled: true, radiusKm: 100, minMag: 3.5, permission: 'granted', ...ISTANBUL, measuredAt: new Date().toISOString(), accuracyM: 25 }
    : { enabled: true, radiusKm: 100, minMag: 3.5, permission: 'denied', lat: null, lon: null, measuredAt: null, accuracyM: null };
  const r = await call<{ deviceId: string; deviceKey: string }>('POST', '/api/devices', {
    label: d.label, platform: d.platform, env: 'drill', transport: 'webpush',
    push: { endpoint: sub.endpoint, keys: { p256dh: b64u(sub.pub), auth: b64u(sub.auth) } }, prefs,
  });
  reg.push({ label: d.label, sub, id: r.deviceId, key: r.deviceKey });
}

const admin = `Bearer ${ADMIN}`;
for (const d of reg) {
  await call('POST', '/api/admin/device-env', { id: d.id, env: 'drill' }, admin);
}
const scenarios = [
  { name: 'İzmir yakını M 4,2 (Ailem kuralı)', body: { lat: 38.25, lon: 27.13, magnitude: 4.2, magType: 'ML', depthKm: 9.8, place: 'Menderes (İzmir)', region: 'Türkiye' } },
  { name: 'Japonya M 6,8 (dünya kuralı, GPS kapalı cihaz dahil)', body: { lat: 38.3, lon: 142.4, magnitude: 6.8, magType: 'Mw', depthKm: 30, place: 'Honshu doğu kıyısı açıkları, Japonya', region: 'Japonya' } },
  { name: 'Ankara M 4,0 (hiçbir kurala uymaz)', body: { lat: 39.93, lon: 32.86, magnitude: 4.0, magType: 'ML', depthKm: 7, place: 'Ankara', region: 'Türkiye' } },
  { name: 'İzmir M 6,6 (Ailem + dünya örtüşür → tek bildirim)', body: { lat: 38.6, lon: 26.9, magnitude: 6.6, magType: 'Mw', depthKm: 12, place: 'Ege Denizi (Karaburun açıkları)', region: 'Türkiye' } },
];
for (const s of scenarios) {
  await call('POST', '/api/admin/test-event', s.body, admin);
  await new Promise((r) => setTimeout(r, 400));
}
// Gerçek "Bildirimlerimi test et" akışı
await call('POST', '/api/devices/me/test', undefined, `Device ${reg[1]!.id}.${reg[1]!.key}`);
await new Promise((r) => setTimeout(r, 1500));

const ops = await call<{ deliveries: { title: string; device_label: string; platform: string; reasons_json: string | null; state: string; provider_status: number | null; timings: Record<string, number | null> }[] }>('GET', '/api/admin/ops', undefined, admin);
plat.worker.stop();
(https as unknown as { request: unknown }).request = origRequest;
app.close(); fake.close();

const rows = ops.deliveries.slice().reverse().map((d) => ({
  bildirim: d.title,
  cihaz: d.device_label,
  kural: d.reasons_json ? (JSON.parse(d.reasons_json) as { kind: string; label?: string; place?: string; distanceKm?: number; radiusKm?: number; minMag: number }[])
    .map((r) => r.kind === 'world' ? `Dünya ≥ M${r.minMag}` : r.kind === 'saved' ? `${r.label} · ${r.place} ${Math.round(r.distanceKm!)}/${r.radiusKm} km ≥ M${r.minMag}` : `Bulunduğun yer ${Math.round(r.distanceKm!)}/${r.radiusKm} km`).join(' + ') : 'bildirim testi',
  durum: d.state,
  saglayici: d.provider_status,
  ilkGonderimMs: d.timings.platformToFirstSendMs,
  kabulMs: d.timings.platformToProviderAcceptMs,
  alimMs: d.timings.platformToDeviceReceivedMs,
  gosterimMs: d.timings.platformToDisplayedMs,
}));

const result = {
  calistirma: new Date().toISOString(),
  not: 'Push servisi yerel emülatördür. VAPID imzası doğrulandı ve her yük aboneye ait anahtarla çözüldü. Gerçek telefon kanıtı ayrı tutulur.',
  push_istekleri: log.map((l) => ({ uc: new URL(l.endpoint).host, ttl: l.ttl, urgency: l.urgency, topic: l.topic, vapid_sub: l.vapidSub, baslik: l.payload.title })),
  kilit_ekrani: reg.map((r) => ({ cihaz: r.label, gorunen: r.sub.shown.map((x) => `${x.title} — ${x.body}`) })),
  teslim: rows,
};
writeFileSync(join(outDir, 'e2e-webpush.json'), JSON.stringify(result, null, 2));
console.table(rows);
for (const k of result.kilit_ekrani) { console.log(`\n${k.cihaz} kilit ekranında:`); k.gorunen.forEach((g) => console.log('  •', g)); }

// Doğrulamalar
const fail: string[] = [];
const androidShown = reg[0]!.sub.shown.map((x) => x.title);
const iosShown = reg[1]!.sub.shown.map((x) => x.title);
if (!androidShown.some((t) => /^TEST · Ailem · İzmir’e \d+ km uzaklıkta deprem kaydedildi$/.test(t))) fail.push('Android: Ailem · İzmir başlığı yok');
if (!iosShown.some((t) => t === 'TEST · Dünya genelinde deprem')) fail.push('iPhone (GPS kapalı): dünya bildirimi yok');
if (androidShown.length !== 3 || iosShown.length !== 4) fail.push(`beklenmeyen sayı: android ${androidShown.length}, ios ${iosShown.length}`);
if (androidShown.some((t) => /Ankara/.test(t))) fail.push('Ankara olayı bildirim üretmemeliydi');
if (rows.some((r) => r.gosterimMs == null)) fail.push('gösterim makbuzu eksik');
if (rows.some((r) => (r.ilkGonderimMs ?? 1e9) > 2000)) fail.push('ilk gönderim > 2 sn');
console.log(fail.length ? `\nBAŞARISIZ: ${fail.join('; ')}` : '\nBAŞARILI: tüm uçtan uca kontroller geçti.');
process.exit(fail.length ? 1 : 0);
