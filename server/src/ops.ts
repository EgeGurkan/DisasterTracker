// İşletim panosu ve teslim raporu verisi. Her aşama ayrı kayıttır; ölçülemeyen aşama null ("bilinmiyor").
// Sağlayıcı kabulü "teslim edildi" sayılmaz: teslim yalnız cihazın gösterim makbuzu ile kanıtlanır.

import type { Ctx } from './ctx.ts';
import { iso } from './ctx.ts';

export interface DeliveryRowFull {
  id: string; device_id: string; kind: string; priority: number; env: string; platform: string; transport: string;
  event_id: string | null; event_version: number | null; alert_key: string | null; reasons_json: string | null;
  title: string; body: string; is_test: number; source: string | null; source_published_at: string | null;
  platform_received_at: string; queued_at: string; first_send_at: string | null; provider_accepted_at: string | null;
  provider_status: number | null; provider_detail: string | null; device_received_at: string | null; device_received_server_at: string | null;
  displayed_at: string | null; displayed_server_at: string | null; opened_at: string | null; opened_server_at: string | null;
  status: string; attempts: number; error: string | null; device_label?: string;
}

const ms = (a: string | null, b: string | null): number | null => (a && b ? Date.parse(b) - Date.parse(a) : null);

export function deliveryTimings(d: DeliveryRowFull) {
  return {
    sourceToPlatformMs: ms(d.source_published_at, d.platform_received_at),
    platformToQueueMs: ms(d.platform_received_at, d.queued_at),
    queueToFirstSendMs: ms(d.queued_at, d.first_send_at),
    platformToFirstSendMs: ms(d.platform_received_at, d.first_send_at),
    platformToProviderAcceptMs: ms(d.platform_received_at, d.provider_accepted_at),
    platformToDeviceReceivedMs: ms(d.platform_received_at, d.device_received_at),
    platformToDisplayedMs: ms(d.platform_received_at, d.displayed_at),
    /** Üst sınır: makbuzun sunucuya ulaştığı an (cihaz saatinden bağımsız) */
    platformToDisplayedUpperMs: ms(d.platform_received_at, d.displayed_server_at),
    platformToOpenedMs: ms(d.platform_received_at, d.opened_at),
  };
}

export function deliveryState(d: DeliveryRowFull): string {
  if (d.opened_at) return 'açıldı';
  if (d.displayed_at) return 'cihazda gösterildi';
  if (d.device_received_at) return 'cihaza ulaştı';
  if (d.status === 'accepted') return 'sağlayıcı kabul etti (cihaz teyidi yok)';
  if (d.status === 'queued' || d.status === 'sending') return 'kuyrukta';
  if (d.status === 'expired') return 'süresi doldu, gönderilmedi';
  return 'başarısız';
}

function pct(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]!;
}

export function listDeliveries(ctx: Ctx, opts: { limit?: number; deviceId?: string; sinceIso?: string; testOnly?: boolean } = {}): DeliveryRowFull[] {
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (opts.deviceId) { where.push('d.device_id = ?'); args.push(opts.deviceId); }
  if (opts.sinceIso) { where.push('d.queued_at >= ?'); args.push(opts.sinceIso); }
  if (opts.testOnly) where.push('d.is_test = 1');
  const sql = `SELECT d.*, v.label AS device_label FROM deliveries d LEFT JOIN devices v ON v.id = d.device_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY d.queued_at DESC LIMIT ?`;
  return ctx.db.prepare(sql).all(...args, opts.limit ?? 200) as unknown as DeliveryRowFull[];
}

export function opsSnapshot(ctx: Ctx) {
  const nowMs = ctx.now();
  const since = iso(nowMs - 7 * 86400_000);
  const rows = listDeliveries(ctx, { limit: 5000, sinceIso: since });
  const byPlatform = new Map<string, DeliveryRowFull[]>();
  for (const r of rows) {
    const k = r.platform;
    byPlatform.set(k, [...(byPlatform.get(k) ?? []), r]);
  }
  const latency = [...byPlatform.entries()].map(([platform, list]) => {
    const t = list.map(deliveryTimings);
    const pick = (k: keyof ReturnType<typeof deliveryTimings>) => t.map((x) => x[k]).filter((v): v is number => v != null);
    const firstSend = pick('platformToFirstSendMs');
    const displayed = pick('platformToDisplayedMs');
    return {
      platform,
      total: list.length,
      accepted: list.filter((d) => d.provider_accepted_at).length,
      displayed: list.filter((d) => d.displayed_at).length,
      failed: list.filter((d) => d.status === 'failed').length,
      expired: list.filter((d) => d.status === 'expired').length,
      unmeasured: list.filter((d) => d.provider_accepted_at && !d.displayed_at).length,
      firstSend: { p50: pct(firstSend, 50), p95: pct(firstSend, 95), p99: pct(firstSend, 99), n: firstSend.length },
      displayed15s: displayed.filter((v) => v <= 15_000).length,
      displayedLatency: { p50: pct(displayed, 50), p95: pct(displayed, 95), p99: pct(displayed, 99), n: displayed.length },
    };
  });
  const queue = ctx.db.prepare("SELECT priority, COUNT(*) AS n, MIN(queued_at) AS oldest FROM deliveries WHERE status IN ('queued','sending') GROUP BY priority").all() as { priority: number; n: number; oldest: string }[];
  const sources = ctx.db.prepare('SELECT * FROM source_health ORDER BY source').all();
  const gaps = ctx.db.prepare('SELECT * FROM source_gaps ORDER BY id DESC LIMIT 20').all();
  const errors = ctx.db.prepare("SELECT id, platform, provider_status, provider_detail, error, queued_at FROM deliveries WHERE status = 'failed' ORDER BY queued_at DESC LIMIT 20").all();
  const devices = ctx.db.prepare('SELECT id, label, platform, env, transport, push_valid, push_invalid_reason, last_seen_at, last_test_ok_at, created_at FROM devices ORDER BY created_at DESC').all();
  return {
    generatedAt: iso(nowMs),
    latency,
    queue: queue.map((q) => ({ ...q, oldestAgeMs: nowMs - Date.parse(q.oldest) })),
    sources, gaps, errors, devices,
    deliveries: rows.slice(0, 300).map((d) => ({ ...d, timings: deliveryTimings(d), state: deliveryState(d) })),
  };
}
