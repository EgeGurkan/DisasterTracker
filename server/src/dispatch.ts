// Olay → abonelik eşleştirme ve kalıcı gönderim kuyruğuna alma.

import type { DevicePrefs, EventSummary, MatchReason, NotificationKind, PushPayload } from '../../shared/src/types.ts';
import { sanitizePrefs } from '../../shared/src/defaults.ts';
import { MAX_NOTIFY_AGE_MS, buildCatalogText, buildRetractionText, inQuietHours, matchCatalogEvent } from '../../shared/src/match.ts';
import { iso, newId, receiptToken, type Ctx } from './ctx.ts';

export interface DeviceRow {
  id: string; key_hash: string; label: string; platform: string; env: string; transport: string;
  push_json: string | null; push_valid: number; push_invalid_reason: string | null; prefs_json: string;
  created_at: string; updated_at: string; last_seen_at: string | null; last_test_ok_at: string | null;
}

export const PRIORITY: Record<NotificationKind, number> = {
  eew: 0, 'eew-cancel': 0, retraction: 1, catalog: 1, test: 3,
};

export interface EnqueueInput {
  device: DeviceRow;
  kind: NotificationKind;
  dedupKey: string;
  title: string;
  body: string;
  isTest: boolean;
  eventId?: string | null;
  eventVersion?: number | null;
  alertKey?: string | null;
  alertId?: string | null;
  reasons?: MatchReason[] | null;
  source?: string | null;
  sourcePublishedAt?: string | null;
  platformReceivedAt: string;
  deadlineMs: number;
  expiresAtMs?: number | null;
  critical?: boolean;
  silent?: boolean;
  url: string;
  tag: string;
  priority?: number;
}

/** Kuyruğa al. Aynı dedupKey ikinci kez eklenmez (cihaz ve olay sürümü bazında tekilleştirme). */
export function enqueue(ctx: Ctx, i: EnqueueInput): string | null {
  const id = newId('dl');
  const nowMs = ctx.now();
  const payload: PushPayload = {
    v: 1, kind: i.kind, deliveryId: id, title: i.title, body: i.body, tag: i.tag, url: i.url,
    eventId: i.eventId ?? null, alertId: i.alertId ?? null, isTest: i.isTest, expiresAtMs: i.expiresAtMs ?? null,
    critical: !!i.critical, silent: !!i.silent, sentAtMs: 0,
    receiptUrl: `${ctx.publicUrl}/api/receipts/${id}?t=${receiptToken(ctx.secret, id)}`,
  };
  const r = ctx.db.prepare(`INSERT OR IGNORE INTO deliveries (id, device_id, dedup_key, kind, priority, env, platform, transport,
      event_id, event_version, alert_key, reasons_json, title, body, is_test, source, source_published_at, platform_received_at,
      queued_at, status, attempts, next_attempt_ms, deadline_ms, expires_at_ms, payload_json)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?)`)
    .run(id, i.device.id, i.dedupKey, i.kind, i.priority ?? PRIORITY[i.kind], i.device.env, i.device.platform, i.device.transport,
      i.eventId ?? null, i.eventVersion ?? null, i.alertKey ?? null, i.reasons ? JSON.stringify(i.reasons) : null,
      i.title, i.body, i.isTest ? 1 : 0, i.source ?? null, i.sourcePublishedAt ?? null, i.platformReceivedAt,
      iso(nowMs), 'queued', nowMs, i.deadlineMs, i.expiresAtMs ?? null, JSON.stringify(payload));
  if (r.changes === 0) return null;
  ctx.wake();
  return id;
}

/** Olayı alabilecek cihazlar: TEST olaylar yalnız tatbikat cihazlarına gider. */
export function eligibleDevices(ctx: Ctx, isTest: boolean): DeviceRow[] {
  const sql = isTest
    ? "SELECT * FROM devices WHERE push_valid = 1 AND env = 'drill'"
    : 'SELECT * FROM devices WHERE push_valid = 1';
  return ctx.db.prepare(sql).all() as unknown as DeviceRow[];
}

/** Kanal tercihleri eşleştirmeden önce uygulanır: kapalı kanalın kuralı çalışmaz. */
export function effectivePrefs(p: DevicePrefs): DevicePrefs {
  return {
    ...p,
    saved: p.channels.depremYakin ? p.saved : [],
    active: { ...p.active, enabled: p.active.enabled && p.channels.depremYakin },
    world: { ...p.world, enabled: p.world.enabled && p.channels.depremDunya },
    eew: { ...p.eew, enabled: p.eew.enabled && p.channels.uyarilar },
  };
}

export function parsePrefs(d: DeviceRow): DevicePrefs {
  try { return sanitizePrefs(JSON.parse(d.prefs_json)); } catch { return sanitizePrefs({}); }
}

interface StateRow { notified_version: number | null; retracted: number }

export function dispatchCatalog(
  ctx: Ctx, ev: EventSummary,
  meta: { platformReceivedAt: string; sourcePublishedAt: string | null; source: string },
): string[] {
  const nowMs = ctx.now();
  const ageMs = nowMs - Date.parse(ev.originTime);
  const created: string[] = [];
  const getState = ctx.db.prepare('SELECT notified_version, retracted FROM device_event_state WHERE device_id = ? AND event_id = ?');
  const setState = ctx.db.prepare(`INSERT INTO device_event_state (device_id, event_id, notified_version, notified_at, retracted)
      VALUES (?, ?, ?, ?, 0) ON CONFLICT(device_id, event_id) DO UPDATE SET notified_version = excluded.notified_version, notified_at = excluded.notified_at`);
  const setRetracted = ctx.db.prepare('UPDATE device_event_state SET retracted = 1 WHERE device_id = ? AND event_id = ?');

  for (const dev of eligibleDevices(ctx, ev.isTest)) {
    const st = getState.get(dev.id, ev.id) as StateRow | undefined;
    const url = `/#/olay/${encodeURIComponent(ev.id)}`;

    const prefs = parsePrefs(dev);
    const devLang = prefs.lang ?? 'tr';

    if (ev.status === 'deleted') {
      // Önceki bildirimi geri çeken mesaj yalnız bildirim almış cihazlara gider.
      if (st?.notified_version && !st.retracted && ageMs < 24 * 3600_000) {
        const t = buildRetractionText(ev, devLang);
        const id = enqueue(ctx, {
          device: dev, kind: 'retraction', dedupKey: `${dev.id}:retract:${ev.id}`, ...t, isTest: ev.isTest,
          eventId: ev.id, eventVersion: ev.version, source: meta.source, sourcePublishedAt: meta.sourcePublishedAt,
          platformReceivedAt: meta.platformReceivedAt, deadlineMs: nowMs + 30 * 60_000, url, tag: `ev-${ev.id}`,
        });
        setRetracted.run(dev.id, ev.id);
        if (id) created.push(id);
      }
      continue;
    }
    // Daha önce bildirildiyse yalnız uygulama içinde güncellenir (tek bildirim kuralı).
    if (st?.notified_version) continue;
    if (ageMs > MAX_NOTIFY_AGE_MS) continue;

    const m = matchCatalogEvent(ev, effectivePrefs(prefs), nowMs);
    if (!m) continue;
    const t = buildCatalogText(ev, m, devLang);
    const id = enqueue(ctx, {
      device: dev, kind: 'catalog', dedupKey: `${dev.id}:cat:${ev.id}`, ...t, isTest: ev.isTest,
      eventId: ev.id, eventVersion: ev.version, reasons: m.reasons, source: meta.source,
      sourcePublishedAt: meta.sourcePublishedAt, platformReceivedAt: meta.platformReceivedAt,
      deadlineMs: nowMs + 15 * 60_000, url: `${url}?neden=1`, tag: `ev-${ev.id}`,
      silent: inQuietHours(prefs, nowMs) || !prefs.sound,
    });
    setState.run(dev.id, ev.id, ev.version, iso(nowMs));
    if (id) created.push(id);
  }
  return created;
}
