import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import type { EewMessage, SourceRecord } from '../../shared/src/types.ts';
import { sanitizePrefs } from '../../shared/src/defaults.ts';
import { EEW_NOT_AVAILABLE_TEXT } from '../../shared/src/match.ts';
import { audit, type DB } from './db.ts';
import { checkReceiptToken, iso, newId, type Ctx } from './ctx.ts';
import { enqueue, type DeviceRow } from './dispatch.ts';
import { ingestRecords, rowToRecord, rowToSummary, type EventRow, type RecordRow } from './events.ts';
import { ingestEew, signEew, type EewProvider } from './eew.ts';
import { buildReport, type RangeKey } from './reports.ts';
import { deliveryState, deliveryTimings, listDeliveries, opsSnapshot, type DeliveryRowFull } from './ops.ts';
import { INVENTORY } from './sources/inventory.ts';
import { fetchActiveFaults, fetchStations } from './sources/adapters.ts';
import { fetchAllMultiHazards } from './sources/hazards.ts';
import type { DeliveryWorker } from './queue.ts';

export interface AppDeps {
  ctx: Ctx;
  worker: DeliveryWorker;
  vapidPublicKey: string;
  adminToken: string;
  eewProviders: Map<string, EewProvider>;
  webRoot: string | null;
  env: 'pilot' | 'development' | 'production';
}

class HttpError extends Error {
  status: number;
  constructor(status: number, msg: string) { super(msg); this.status = status; }
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const CHAT_ROOMS = [
  { id: 'marmara', name: 'Marmara' }, { id: 'ege', name: 'Ege' }, { id: 'akdeniz', name: 'Akdeniz' },
  { id: 'ic-anadolu', name: 'İç Anadolu' }, { id: 'karadeniz', name: 'Karadeniz' }, { id: 'dogu-anadolu', name: 'Doğu Anadolu' },
  { id: 'guneydogu', name: 'Güneydoğu Anadolu' },
];

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

export function createHandler(deps: AppDeps) {
  const { ctx } = deps;
  const db: DB = ctx.db;
  const buckets = new Map<string, { n: number; reset: number }>();
  let stationCache: { at: number; data: unknown } | null = null;
  let faultCache: { at: number; data: unknown } | null = null;
  let hazardCache: { at: number; items: Awaited<ReturnType<typeof fetchAllMultiHazards>> } | null = null;

  const rate = (key: string, max: number, windowMs: number) => {
    const now = Date.now();
    const b = buckets.get(key);
    if (!b || b.reset < now) { buckets.set(key, { n: 1, reset: now + windowMs }); return; }
    if (++b.n > max) throw new HttpError(429, 'Çok fazla istek; biraz sonra tekrar dene.');
  };

  const readBody = (req: IncomingMessage): Promise<unknown> => new Promise((res, rej) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > 64 * 1024) { rej(new HttpError(413, 'İstek çok büyük')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return res({});
      try { res(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { rej(new HttpError(400, 'Geçersiz JSON')); }
    });
    req.on('error', rej);
  });

  const deviceAuth = (req: IncomingMessage): DeviceRow => {
    const h = req.headers.authorization ?? '';
    const m = /^Device ([\w-]+)\.([\w-]+)$/.exec(h);
    if (!m) throw new HttpError(401, 'Cihaz kimliği gerekli');
    const dev = db.prepare('SELECT * FROM devices WHERE id = ?').get(m[1]!) as DeviceRow | undefined;
    if (!dev) throw new HttpError(401, 'Cihaz bulunamadı; yeniden kaydol');
    const a = Buffer.from(dev.key_hash), b = Buffer.from(sha(m[2]!));
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(401, 'Cihaz anahtarı geçersiz');
    db.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').run(iso(ctx.now()), dev.id);
    return dev;
  };

  const adminAuth = (req: IncomingMessage) => {
    const h = req.headers.authorization ?? '';
    const tok = h.startsWith('Bearer ') ? h.slice(7) : '';
    const a = Buffer.from(sha(tok)), b = Buffer.from(sha(deps.adminToken));
    if (!tok || !timingSafeEqual(a, b)) throw new HttpError(401, 'Yönetici yetkisi gerekli');
  };

  const validPush = (transport: string, push: unknown): boolean => {
    if (transport === 'webpush') {
      const p = push as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      return !!p && typeof p.endpoint === 'string' && p.endpoint.startsWith('https://') && !!p.keys?.p256dh && !!p.keys?.auth;
    }
    if (transport === 'fcm' || transport === 'apns') return typeof (push as { token?: string })?.token === 'string';
    return false;
  };

  const publicDevice = (d: DeviceRow) => ({
    id: d.id, label: d.label, platform: d.platform, env: d.env, transport: d.transport, pushValid: !!d.push_valid,
    pushInvalidReason: d.push_invalid_reason, prefs: sanitizePrefs(JSON.parse(d.prefs_json)), lastTestOkAt: d.last_test_ok_at, createdAt: d.created_at,
  });

  const withTimings = (d: DeliveryRowFull) => ({
    id: d.id, kind: d.kind, title: d.title, body: d.body, isTest: !!d.is_test, eventId: d.event_id, alertKey: d.alert_key,
    reasons: d.reasons_json ? JSON.parse(d.reasons_json) : null, source: d.source, platform: d.platform, deviceLabel: d.device_label,
    stages: {
      sourcePublishedAt: d.source_published_at, platformReceivedAt: d.platform_received_at, queuedAt: d.queued_at,
      firstSendAt: d.first_send_at, providerAcceptedAt: d.provider_accepted_at, deviceReceivedAt: d.device_received_at,
      displayedAt: d.displayed_at, displayedServerAt: d.displayed_server_at, openedAt: d.opened_at,
    },
    providerStatus: d.provider_status, providerDetail: d.provider_detail, status: d.status, state: deliveryState(d),
    attempts: d.attempts, error: d.error, timings: deliveryTimings(d),
  });

  type Route = (req: IncomingMessage, url: URL, params: string[]) => Promise<unknown> | unknown;
  const routes: [string, RegExp, Route][] = [];
  const on = (method: string, path: string, fn: Route) => routes.push([method, new RegExp(`^${path}$`), fn]);

  on('GET', '/api/health', () => ({ ok: true, time: iso(ctx.now()) }));

  on('GET', '/api/config', () => ({
    vapidPublicKey: deps.vapidPublicKey,
    env: deps.env,
    transports: ctx.push.available,
    eew: { available: false, text: EEW_NOT_AVAILABLE_TEXT, drillProvider: [...deps.eewProviders.values()].some((p) => p.drillOnly) },
    serverTime: iso(ctx.now()),
  }));

  // ---- Cihazlar ----
  on('POST', '/api/devices', async (req) => {
    rate(`reg:${req.socket.remoteAddress}`, 20, 3600_000);
    const b = (await readBody(req)) as { label?: string; platform?: string; env?: string; transport?: string; push?: unknown; prefs?: unknown };
    const id = newId('dev');
    const key = randomBytes(24).toString('base64url');
    const transport = ['webpush', 'fcm', 'apns'].includes(String(b.transport)) ? String(b.transport) : 'webpush';
    const pushOk = b.push != null && validPush(transport, b.push);
    const now = iso(ctx.now());
    const platform = String(b.platform ?? 'web').slice(0, 30);
    db.prepare(`INSERT INTO devices (id, key_hash, label, platform, env, transport, push_json, push_valid, prefs_json, created_at, updated_at, last_seen_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, sha(key), String(b.label ?? 'Cihazım').slice(0, 40), platform,
      // Tatbikat (TEST) cihazı yalnız yönetici panosundan atanır; kullanıcı kaydı her zaman üretim ortamıdır.
      'production', transport, pushOk ? JSON.stringify(b.push) : null, pushOk ? 1 : 0,
      JSON.stringify(sanitizePrefs(b.prefs)), now, now, now);
    return { deviceId: id, deviceKey: key };
  });

  on('GET', '/api/devices/me', (req) => publicDevice(deviceAuth(req)));

  on('PUT', '/api/devices/me', async (req) => {
    const dev = deviceAuth(req);
    const b = (await readBody(req)) as { label?: string; env?: string; transport?: string; push?: unknown | null; prefs?: unknown; platform?: string };
    const sets: string[] = [];
    const args: (string | number | null)[] = [];
    if (b.label !== undefined) { sets.push('label = ?'); args.push(String(b.label).slice(0, 40)); }
    if (b.platform !== undefined) { sets.push('platform = ?'); args.push(String(b.platform).slice(0, 30)); }
    if (b.prefs !== undefined) { sets.push('prefs_json = ?'); args.push(JSON.stringify(sanitizePrefs(b.prefs))); }
    if (b.push !== undefined) {
      const transport = ['webpush', 'fcm', 'apns'].includes(String(b.transport)) ? String(b.transport) : dev.transport;
      const ok = b.push != null && validPush(transport, b.push);
      sets.push('transport = ?', 'push_json = ?', 'push_valid = ?', 'push_invalid_reason = ?');
      args.push(transport, ok ? JSON.stringify(b.push) : null, ok ? 1 : 0, ok ? null : b.push == null ? 'kullanıcı bildirimleri kapattı' : 'geçersiz abonelik');
    }
    if (sets.length) {
      sets.push('updated_at = ?');
      args.push(iso(ctx.now()));
      db.prepare(`UPDATE devices SET ${sets.join(', ')} WHERE id = ?`).run(...args, dev.id);
    }
    return publicDevice(db.prepare('SELECT * FROM devices WHERE id = ?').get(dev.id) as unknown as DeviceRow);
  });

  on('DELETE', '/api/devices/me', (req) => {
    const dev = deviceAuth(req);
    for (const sql of [
      'DELETE FROM deliveries WHERE device_id = ?', 'DELETE FROM device_event_state WHERE device_id = ?',
      'DELETE FROM felt_reports WHERE device_id = ?', 'DELETE FROM chat_messages WHERE device_id = ?',
      'DELETE FROM chat_reports WHERE device_id = ?', 'DELETE FROM devices WHERE id = ?',
    ]) db.prepare(sql).run(dev.id);
    return { deleted: true };
  });

  on('POST', '/api/devices/me/test', (req) => {
    const dev = deviceAuth(req);
    rate(`test:${dev.id}`, 10, 600_000);
    if (!dev.push_valid) throw new HttpError(409, 'Bu cihazın geçerli bildirim aboneliği yok. Önce bildirim iznini aç.');
    const nowMs = ctx.now();
    let isEn = false;
    try { isEn = (JSON.parse(dev.prefs_json) as { lang?: string })?.lang === 'en'; } catch { /* varsayılan tr */ }
    const id = enqueue(ctx, {
      device: dev, kind: 'test', dedupKey: `${dev.id}:test:${nowMs}`,
      title: isEn ? 'TEST · Notification check' : 'TEST · Bildirim denemesi',
      body: isEn
        ? `This test was sent from the server to "${dev.label}". Not a real earthquake.`
        : `Bu deneme sunucudan "${dev.label}" cihazına gönderildi. Gerçek bir deprem değildir.`,
      isTest: true,
      source: 'TEST', sourcePublishedAt: iso(nowMs), platformReceivedAt: iso(nowMs), deadlineMs: nowMs + 10 * 60_000,
      url: '/#/ayarlar/bildirimler?test=1', tag: 'test',
    });
    return { deliveryId: id };
  });

  on('GET', '/api/devices/me/deliveries', (req) => {
    const dev = deviceAuth(req);
    return listDeliveries(ctx, { deviceId: dev.id, limit: 100 }).map(withTimings);
  });

  on('GET', '/api/deliveries/([\\w-]+)', (req, _u, [id]) => {
    const dev = deviceAuth(req);
    const d = db.prepare('SELECT d.*, v.label AS device_label FROM deliveries d LEFT JOIN devices v ON v.id = d.device_id WHERE d.id = ?').get(id!) as DeliveryRowFull | undefined;
    if (!d || d.device_id !== dev.id) throw new HttpError(404, 'Bildirim bulunamadı');
    return withTimings(d);
  });

  // Cihazdan alım/gösterim/açılış makbuzu. Cihaz saati, makbuzun gönderildiği andaki saat farkıyla düzeltilir.
  on('POST', '/api/receipts/([\\w-]+)', async (req, url, [id]) => {
    if (!checkReceiptToken(ctx.secret, id!, url.searchParams.get('t') ?? '')) throw new HttpError(403, 'Geçersiz makbuz');
    const b = (await readBody(req)) as { stage?: string; at?: number; clientNow?: number };
    const serverNow = ctx.now();
    const skew = typeof b.clientNow === 'number' ? serverNow - b.clientNow : 0;
    const at = typeof b.at === 'number' ? Math.min(serverNow, b.at + skew) : serverNow;
    const cols: Record<string, [string, string]> = {
      received: ['device_received_at', 'device_received_server_at'],
      displayed: ['displayed_at', 'displayed_server_at'],
      opened: ['opened_at', 'opened_server_at'],
    };
    const c = cols[String(b.stage)];
    if (!c) {
      if (b.stage === 'expired-on-device') {
        db.prepare("UPDATE deliveries SET error = COALESCE(error, '') || 'cihazda süresi geçmiş olarak geçmişe işlendi' WHERE id = ?").run(id!);
        return { ok: true };
      }
      throw new HttpError(400, 'Bilinmeyen aşama');
    }
    db.prepare(`UPDATE deliveries SET ${c[0]} = COALESCE(${c[0]}, ?), ${c[1]} = COALESCE(${c[1]}, ?) WHERE id = ?`).run(iso(at), iso(serverNow), id!);
    if (b.stage === 'displayed' || b.stage === 'received') {
      const d = db.prepare('SELECT kind, device_id FROM deliveries WHERE id = ?').get(id!) as { kind: string; device_id: string } | undefined;
      if (d?.kind === 'test') db.prepare('UPDATE devices SET last_test_ok_at = ? WHERE id = ?').run(iso(serverNow), d.device_id);
    }
    return { ok: true, skewMs: skew };
  });

  // ---- Olaylar ----
  on('GET', '/api/events', (_req, url) => {
    const region = url.searchParams.get('region') ?? 'all';
    const hours = Math.min(24 * 30, Math.max(1, Number(url.searchParams.get('hours') ?? 24)));
    const minMag = Number(url.searchParams.get('minMag') ?? 0);
    const source = url.searchParams.get('source');
    const includeTest = url.searchParams.get('test') === '1';
    const limit = Math.min(1000, Number(url.searchParams.get('limit') ?? 300));
    const from = ctx.now() - hours * 3600_000;
    const rows = db.prepare(`SELECT * FROM events WHERE origin_ms >= ? ${includeTest ? '' : 'AND is_test = 0'} ORDER BY origin_ms DESC LIMIT 5000`).all(from) as unknown as EventRow[];
    const srcStmt = db.prepare('SELECT source FROM source_records WHERE event_id = ?');
    const out = [];
    for (const r of rows) {
      const tr = r.lat >= 35 && r.lat <= 43 && r.lon >= 25 && r.lon <= 45.5;
      if (region === 'tr' && !tr) continue;
      if (region === 'world' && tr) continue;
      if (minMag > 0 && (r.magnitude == null || r.magnitude < minMag)) continue;
      const sources = (srcStmt.all(r.id) as { source: string }[]).map((s) => s.source);
      if (source && !sources.includes(source)) continue;
      out.push({ ...rowToSummary(r), sources, updatedAt: r.updated_at });
      if (out.length >= limit) break;
    }
    const health = db.prepare('SELECT source, last_success_at, status FROM source_health').all();
    return { events: out, sources: health, generatedAt: iso(ctx.now()) };
  });

  on('GET', '/api/events/([\\w.-]+)', (_req, _u, [id]) => {
    const r = db.prepare('SELECT * FROM events WHERE id = ?').get(id!) as EventRow | undefined;
    if (!r) throw new HttpError(404, 'Olay bulunamadı');
    const recs = (db.prepare('SELECT * FROM source_records WHERE event_id = ? ORDER BY first_ingested_at').all(id!) as unknown as RecordRow[]);
    const revisions = db.prepare('SELECT version, source, change, at FROM event_revisions WHERE event_id = ? ORDER BY id').all(id!) as { version: number; source: string; change: string; at: string }[];
    const felt = db.prepare('SELECT intensity, COUNT(*) AS n FROM felt_reports WHERE event_id = ? GROUP BY intensity').all(id!) as { intensity: number; n: number }[];
    return {
      event: rowToSummary(r),
      records: recs.map((x) => ({ ...rowToRecord(x), ingestedAt: x.ingested_at, firstIngestedAt: x.first_ingested_at, revision: x.revision })),
      revisions: revisions.map((v) => ({ ...v, change: JSON.parse(v.change) })),
      felt: { total: felt.reduce((s, f) => s + f.n, 0), byIntensity: felt },
    };
  });

  on('POST', '/api/events/([\\w.-]+)/felt', async (req, _u, [id]) => {
    const dev = deviceAuth(req);
    const b = (await readBody(req)) as { intensity?: number };
    const n = Math.round(Number(b.intensity));
    if (!(n >= 1 && n <= 5)) throw new HttpError(400, 'Şiddet 1–5 arası olmalı');
    if (!db.prepare('SELECT 1 FROM events WHERE id = ?').get(id!)) throw new HttpError(404, 'Olay bulunamadı');
    db.prepare('INSERT INTO felt_reports (event_id, device_id, intensity, at) VALUES (?,?,?,?) ON CONFLICT(event_id, device_id) DO UPDATE SET intensity = excluded.intensity, at = excluded.at')
      .run(id!, dev.id, n, iso(ctx.now()));
    return { ok: true };
  });

  // ---- Uyarılar ----
  on('GET', '/api/alerts', (_req, url) => {
    const includeTest = url.searchParams.get('test') === '1';
    const rows = db.prepare(`SELECT * FROM alerts ${includeTest ? '' : "WHERE status = 'actual'"} ORDER BY updated_at DESC LIMIT 100`).all() as {
      provider: string; alert_id: string; version: number; msg_type: string; status: string; state: string; issued_at: string; expires_at: string; message_json: string; updated_at: string;
    }[];
    const nowMs = ctx.now();
    return {
      eew: { available: false, text: EEW_NOT_AVAILABLE_TEXT },
      alerts: rows.map((r) => {
        const msg = JSON.parse(r.message_json) as EewMessage;
        const state = r.state === 'active' && Date.parse(r.expires_at) <= nowMs ? 'expired' : r.state;
        return {
          key: `${r.provider}:${r.alert_id}`, provider: r.provider, alertId: r.alert_id, version: r.version, msgType: r.msg_type,
          status: r.status, state, issuedAt: r.issued_at, expiresAt: r.expires_at, updatedAt: r.updated_at,
          area: msg.area, epicenter: msg.epicenter, magnitude: msg.magnitude, headline: msg.headline,
        };
      }),
      log: db.prepare('SELECT * FROM alert_log ORDER BY id DESC LIMIT 50').all(),
    };
  });

  on('GET', '/api/reports', (_req, url) => {
    const range = (['24h', '7d', '30d'].includes(url.searchParams.get('range') ?? '') ? url.searchParams.get('range') : '24h') as RangeKey;
    const region = url.searchParams.get('region') === 'world' ? 'world' : 'tr';
    return buildReport(ctx, range, region, Number(url.searchParams.get('minMag') ?? 0) || 0);
  });

  on('GET', '/api/sources', () => ({ health: db.prepare('SELECT * FROM source_health ORDER BY source').all(), gaps: db.prepare('SELECT * FROM source_gaps ORDER BY id DESC LIMIT 20').all(), inventory: INVENTORY }));

  on('GET', '/api/stations', async () => {
    if (stationCache && Date.now() - stationCache.at < 24 * 3600_000) return stationCache.data;
    const srcLabel = 'GFZ GEOFON · KOERI EIDA · NOA · INGV (FDSN station)';
    try {
      const stations = await fetchStations();
      stationCache = { at: Date.now(), data: { source: srcLabel, fetchedAt: iso(Date.now()), stations } };
    } catch (e) {
      if (stationCache) return { ...(stationCache.data as object), stale: true, error: String(e) };
      return { source: srcLabel, fetchedAt: null, stations: [], error: 'Kaynağa erişilemiyor' };
    }
    return stationCache.data;
  });

  on('GET', '/api/faults', async () => {
    if (faultCache && Date.now() - faultCache.at < 24 * 3600_000) return faultCache.data;
    const srcLabel = 'GEM Global Active Faults / EMME & MTA (CC BY-SA 4.0)';
    try {
      const faults = await fetchActiveFaults();
      faultCache = { at: Date.now(), data: { source: srcLabel, fetchedAt: iso(Date.now()), faults } };
    } catch (e) {
      if (faultCache) return { ...(faultCache.data as object), stale: true, error: String(e) };
      return { source: srcLabel, fetchedAt: null, faults: [], error: 'Diri fay verisine erişilemiyor' };
    }
    return faultCache.data;
  });

  on('GET', '/api/disasters', async (_req, url) => {
    const hazard = url.searchParams.get('hazard') ?? 'all';
    if (!hazardCache || Date.now() - hazardCache.at > 3 * 60_000) {
      try {
        const items = await fetchAllMultiHazards({ includeGdacs: true });
        hazardCache = { at: Date.now(), items };
      } catch (e) {
        if (!hazardCache) return { disasters: [], generatedAt: iso(ctx.now()), error: String(e) };
      }
    }
    const items = hazard === 'all'
      ? hazardCache.items
      : hazardCache.items.filter((x) => x.hazard === hazard);
    return { disasters: items.slice(0, 400), generatedAt: iso(hazardCache.at) };
  });

  // ---- Sohbet (Topluluk) ----
  on('GET', '/api/chat/rooms', () => CHAT_ROOMS);
  on('GET', '/api/chat/([\\w-]+)', (_req, url, [room]) => {
    if (!CHAT_ROOMS.some((r) => r.id === room)) throw new HttpError(404, 'Oda yok');
    const since = url.searchParams.get('since') ?? '1970-01-01';
    return db.prepare('SELECT id, nick, text, at, device_id FROM chat_messages WHERE room = ? AND hidden = 0 AND at > ? ORDER BY at DESC LIMIT 100').all(room!, since)
      .map((m) => { const x = m as { id: string; nick: string; text: string; at: string; device_id: string }; return { id: x.id, nick: x.nick, text: x.text, at: x.at, author: sha(x.device_id).slice(0, 10), label: 'Topluluk' }; })
      .reverse();
  });
  on('POST', '/api/chat/([\\w-]+)', async (req, _u, [room]) => {
    const dev = deviceAuth(req);
    if (!CHAT_ROOMS.some((r) => r.id === room)) throw new HttpError(404, 'Oda yok');
    rate(`chat:${dev.id}`, 10, 60_000);
    const b = (await readBody(req)) as { nick?: string; text?: string };
    const text = String(b.text ?? '').trim().slice(0, 500);
    if (!text) throw new HttpError(400, 'Boş ileti');
    // Topluluk iletisi resmî uyarı gibi görünemez.
    if (/^(resm[iî]|afad|uyar[iı]|erken uyar[iı])\s*[:!]/i.test(text)) throw new HttpError(400, 'Topluluk iletileri resmî uyarı biçiminde yazılamaz.');
    const id = newId('msg');
    db.prepare('INSERT INTO chat_messages (id, room, device_id, nick, text, at) VALUES (?,?,?,?,?,?)')
      .run(id, room!, dev.id, String(b.nick ?? 'Anonim').trim().slice(0, 24) || 'Anonim', text, iso(ctx.now()));
    return { id };
  });
  on('POST', '/api/chat-report', async (req) => {
    const dev = deviceAuth(req);
    const b = (await readBody(req)) as { messageId?: string; reason?: string };
    db.prepare('INSERT INTO chat_reports (message_id, device_id, reason, at) VALUES (?,?,?,?)').run(String(b.messageId), dev.id, String(b.reason ?? '').slice(0, 200), iso(ctx.now()));
    const n = (db.prepare('SELECT COUNT(DISTINCT device_id) AS n FROM chat_reports WHERE message_id = ?').get(String(b.messageId)) as { n: number }).n;
    if (n >= 3) db.prepare('UPDATE chat_messages SET hidden = 1 WHERE id = ?').run(String(b.messageId)); // otomatik gizle, moderatör inceler
    return { ok: true };
  });

  // ---- Yönetim (tatbikat ve işletim) ----
  on('POST', '/api/admin/test-event', async (req) => {
    adminAuth(req);
    const b = (await readBody(req)) as Partial<SourceRecord> & { mag?: number; ageSec?: number };
    const nowMs = ctx.now();
    const rec: SourceRecord = {
      source: 'TEST', sourceEventId: String(b.sourceEventId ?? `t${nowMs}`),
      originTime: b.originTime ?? iso(nowMs - (b.ageSec ?? 3) * 1000), sourcePublishedAt: iso(nowMs),
      lat: Number(b.lat), lon: Number(b.lon), depthKm: b.depthKm == null ? null : Number(b.depthKm),
      magnitude: b.magnitude === null ? null : Number(b.magnitude ?? b.mag), magType: b.magType ?? 'ML',
      place: String(b.place ?? 'TEST olayı'), region: b.region ?? null, status: b.status ?? 'automatic', url: null, isTest: true,
    };
    if (!Number.isFinite(rec.lat) || !Number.isFinite(rec.lon)) throw new HttpError(400, 'lat/lon gerekli');
    audit(db, 'admin', 'test-event', rec);
    const outcome = ingestRecords(ctx, [rec], { notify: true });
    const ev = outcome[0]!;
    const created = db.prepare('SELECT id, device_id, title FROM deliveries WHERE event_id = ? AND queued_at >= ?').all(ev.eventId, iso(nowMs));
    return { outcome: ev, deliveries: created };
  });

  on('POST', '/api/admin/eew', async (req) => {
    adminAuth(req);
    const b = (await readBody(req)) as Partial<EewMessage> & { ttlSec?: number; signed?: boolean };
    let msg: EewMessage;
    if (b.signed) {
      msg = b as EewMessage;
    } else {
      const p = [...deps.eewProviders.values()].find((x) => x.drillOnly);
      if (!p) throw new HttpError(400, 'Tatbikat sağlayıcısı yok');
      const nowMs = ctx.now();
      msg = signEew({
        provider: p.id, alertId: String(b.alertId ?? `a${nowMs}`), version: Number(b.version ?? 1), msgType: b.msgType ?? 'alert', status: 'test',
        issuedAt: b.issuedAt ?? iso(nowMs), expiresAt: b.expiresAt ?? iso(nowMs + (b.ttlSec ?? 60) * 1000),
        epicenter: b.epicenter ?? null, magnitude: b.magnitude ?? null, area: b.area ?? { circles: [] }, headline: b.headline ?? null,
      }, p.hmacKey);
    }
    audit(db, 'admin', 'eew', { provider: msg.provider, alertId: msg.alertId, version: msg.version, msgType: msg.msgType });
    return ingestEew(ctx, deps.eewProviders, msg);
  });

  on('GET', '/api/admin/ops', (req) => { adminAuth(req); return opsSnapshot(ctx); });
  on('POST', '/api/admin/device-env', async (req) => {
    adminAuth(req);
    const b = (await readBody(req)) as { id?: string; env?: string };
    const env = b.env === 'drill' ? 'drill' : 'production';
    const r = db.prepare('UPDATE devices SET env = ?, updated_at = ? WHERE id = ?').run(env, iso(ctx.now()), String(b.id));
    if (!r.changes) throw new HttpError(404, 'Cihaz bulunamadı');
    audit(db, 'admin', 'device-env', { id: b.id, env });
    return { ok: true, env };
  });
  on('POST', '/api/admin/chat-hide', async (req) => {
    adminAuth(req);
    const b = (await readBody(req)) as { id?: string; hidden?: boolean };
    db.prepare('UPDATE chat_messages SET hidden = ? WHERE id = ?').run(b.hidden === false ? 0 : 1, String(b.id));
    audit(db, 'admin', 'chat-hide', b);
    return { ok: true };
  });
  on('GET', '/api/admin/chat-reports', (req) => {
    adminAuth(req);
    return db.prepare('SELECT r.*, m.text, m.room, m.hidden FROM chat_reports r LEFT JOIN chat_messages m ON m.id = r.message_id ORDER BY r.id DESC LIMIT 100').all();
  });

  // ---- Statik dosyalar ----
  const serveStatic = (req: IncomingMessage, res: ServerResponse, url: URL): boolean => {
    if (!deps.webRoot || (req.method !== 'GET' && req.method !== 'HEAD')) return false;
    const root = resolve(deps.webRoot);
    let p = normalize(join(root, decodeURIComponent(url.pathname)));
    if (!p.startsWith(root)) return false;
    if (!existsSync(p) || statSync(p).isDirectory()) p = join(root, 'index.html');
    if (!existsSync(p)) return false;
    const ext = extname(p);
    const immutable = url.pathname.startsWith('/assets/');
    res.writeHead(200, {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      ...(url.pathname === '/sw.js' ? { 'service-worker-allowed': '/' } : {}),
    });
    if (req.method === 'HEAD') { res.end(); return true; }
    createReadStream(p).pipe(res);
    return true;
  };

  return async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://x');
    res.setHeader('x-content-type-options', 'nosniff');
    // OSM karo ve Nominatim politikası Referer ister; dışarıya yalnız site kökeni gider (yol/sorgu değil).
    res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
    res.setHeader('permissions-policy', 'geolocation=(self), camera=(), microphone=()');
    res.setHeader('content-security-policy',
      "default-src 'self'; " +
      "img-src 'self' data: https://server.arcgisonline.com https://services.arcgisonline.com https://*.basemaps.cartocdn.com https://tile.openstreetmap.org https://*.tile.openstreetmap.org; " +
      "style-src 'self' 'unsafe-inline'; script-src 'self'; " +
      "connect-src 'self' https://nominatim.openstreetmap.org https://api.orhanaydogdu.com.tr https://www.seismicportal.eu https://earthquake.usgs.gov https://geofon.gfz.de https://eida.gein.noa.gr https://webservices.ingv.it https://api.geonet.org.nz https://www.jma.go.jp https://eida.koeri.boun.edu.tr https://raw.githubusercontent.com https://eonet.gsfc.nasa.gov https://volcanoes.usgs.gov https://api.weather.gov https://mesonet.agron.iastate.edu; " +
      "media-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'");
    try {
      if (url.pathname.startsWith('/api/')) {
        for (const [method, re, fn] of routes) {
          if (method !== req.method) continue;
          const m = re.exec(url.pathname);
          if (!m) continue;
          const out = await fn(req, url, m.slice(1));
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
          res.end(JSON.stringify(out));
          return;
        }
        throw new HttpError(404, 'Bulunamadı');
      }
      if (!serveStatic(req, res, url)) { res.writeHead(404); res.end('Bulunamadı'); }
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) ctx.log('HTTP hata', e);
      if (!res.headersSent) res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: e instanceof HttpError ? e.message : 'Sunucu hatası' }));
    }
  };
}
