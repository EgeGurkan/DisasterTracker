// Kalıcı, öncelikli gönderim kuyruğu. Kritik uyarılar (öncelik 0) ayrı bir şeritte,
// katalog/test işlerini beklemeden gönderilir. Yeniden başlatmada yarım kalan işler kaldığı yerden devam eder.

import type { PushPayload } from '../../shared/src/types.ts';
import type { DeviceRow } from './dispatch.ts';
import { iso, type Ctx } from './ctx.ts';
import type { Transport } from './push/types.ts';

interface Job {
  id: string; device_id: string; kind: string; priority: number; attempts: number; deadline_ms: number;
  expires_at_ms: number | null; payload_json: string; first_send_at: string | null; event_id: string | null; alert_key: string | null;
}

const BACKOFF_MS = [500, 1000, 2000, 4000, 8000, 15000, 30000, 60000];

export class DeliveryWorker {
  private ctx: Ctx;
  private timer: NodeJS.Timeout | null = null;
  private busy = { critical: false, normal: false };
  private wakePending = false;

  constructor(ctx: Ctx) {
    this.ctx = ctx;
  }

  /** Çökme/yeniden başlatma sonrası 'sending' durumunda kalan işleri yeniden kuyruğa alır. */
  recover(): number {
    const r = this.ctx.db.prepare("UPDATE deliveries SET status = 'queued', locked_until_ms = NULL WHERE status = 'sending'").run();
    return Number(r.changes);
  }

  start(intervalMs = 250): void {
    this.recover();
    this.timer = setInterval(() => void this.tick(), intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  wake(): void {
    if (this.wakePending) return;
    this.wakePending = true;
    queueMicrotask(() => { this.wakePending = false; void this.tick(); });
  }

  /** Tek bir tur: önce kritik şerit, sonra normal şerit. Testlerde doğrudan beklenebilir. */
  async tick(): Promise<void> {
    await Promise.all([this.lane('critical'), this.lane('normal')]);
  }

  async drain(maxRounds = 50): Promise<void> {
    for (let i = 0; i < maxRounds; i++) {
      await this.tick();
      const left = this.ctx.db.prepare("SELECT COUNT(*) AS n FROM deliveries WHERE status IN ('queued','sending') AND next_attempt_ms <= ?").get(this.ctx.now()) as { n: number };
      if (left.n === 0) return;
    }
  }

  private async lane(kind: 'critical' | 'normal'): Promise<void> {
    if (this.busy[kind]) return;
    this.busy[kind] = true;
    try {
      const nowMs = this.ctx.now();
      const cond = kind === 'critical' ? 'priority = 0' : 'priority > 0';
      const jobs = this.ctx.db.prepare(`SELECT id, device_id, kind, priority, attempts, deadline_ms, expires_at_ms, payload_json, first_send_at, event_id, alert_key
        FROM deliveries WHERE status = 'queued' AND ${cond} AND next_attempt_ms <= ? ORDER BY priority, queued_at LIMIT 100`)
        .all(nowMs) as unknown as Job[];
      const claim = this.ctx.db.prepare("UPDATE deliveries SET status = 'sending', locked_until_ms = ? WHERE id = ? AND status = 'queued'");
      const claimed = jobs.filter((j) => Number(claim.run(nowMs + 30_000, j.id).changes) === 1);
      // sınırlı eşzamanlılık
      const limit = kind === 'critical' ? 50 : 20;
      for (let i = 0; i < claimed.length; i += limit) {
        await Promise.all(claimed.slice(i, i + limit).map((j) => this.sendOne(j)));
      }
    } finally {
      this.busy[kind] = false;
    }
  }

  private async sendOne(j: Job): Promise<void> {
    const { db } = this.ctx;
    const nowMs = this.ctx.now();
    const dev = db.prepare('SELECT * FROM devices WHERE id = ?').get(j.device_id) as DeviceRow | undefined;
    const fin = (status: string, extra: Record<string, unknown> = {}) => {
      const keys = Object.keys(extra);
      db.prepare(`UPDATE deliveries SET status = ?, locked_until_ms = NULL${keys.map((k) => `, ${k} = ?`).join('')} WHERE id = ?`)
        .run(status, ...(Object.values(extra) as (string | number | null)[]), j.id);
    };
    if (!dev || !dev.push_valid || !dev.push_json) return fin('failed', { error: 'cihazın geçerli push kaydı yok' });
    // Süresi geçmiş mesaj gönderilmez (bağlantı dönünce eski siren çalmasın).
    if (nowMs > j.deadline_ms || (j.expires_at_ms != null && nowMs >= j.expires_at_ms)) {
      return fin('expired', { error: 'son geçerlilik zamanı geçti; gönderilmedi' });
    }
    const payload = JSON.parse(j.payload_json) as PushPayload;
    payload.sentAtMs = nowMs;
    const ttlSec = j.expires_at_ms != null
      ? Math.max(1, Math.floor((j.expires_at_ms - nowMs) / 1000))
      : Math.max(1, Math.floor((j.deadline_ms - nowMs) / 1000) + (j.kind === 'catalog' ? 15 * 60 : 0));
    const topicSeed = j.alert_key ?? j.event_id ?? j.id;
    const topic = Buffer.from(topicSeed).toString('base64url').replace(/[^A-Za-z0-9_-]/g, '').slice(-32);
    const sendAt = iso(nowMs);
    db.prepare('UPDATE deliveries SET attempts = attempts + 1, first_send_at = COALESCE(first_send_at, ?) WHERE id = ?').run(sendAt, j.id);
    const res = await this.ctx.push.send(
      { id: dev.id, transport: dev.transport as Transport, platform: dev.platform, push: JSON.parse(dev.push_json) },
      payload,
      { ttlSec, urgency: j.priority <= 1 ? 'high' : 'normal', topic, critical: payload.critical },
    );
    const doneMs = this.ctx.now();
    if (res.ok) {
      return fin('accepted', { provider_accepted_at: iso(doneMs), provider_status: res.status, provider_detail: res.detail });
    }
    if (res.invalidToken) {
      db.prepare("UPDATE devices SET push_valid = 0, push_invalid_reason = ?, updated_at = ? WHERE id = ?").run(res.detail, iso(doneMs), dev.id);
      return fin('failed', { provider_status: res.status, provider_detail: res.detail, error: 'geçersiz belirteç: cihazın yeniden kaydolması gerekiyor' });
    }
    if (res.retryable) {
      const delay = BACKOFF_MS[Math.min(j.attempts, BACKOFF_MS.length - 1)]!;
      if (doneMs + delay < j.deadline_ms && (j.expires_at_ms == null || doneMs + delay < j.expires_at_ms)) {
        return fin('queued', { next_attempt_ms: doneMs + delay, provider_status: res.status, provider_detail: res.detail });
      }
    }
    this.ctx.opsAlert(`Gönderim başarısız ${j.id} (${dev.platform}): ${res.detail}`);
    return fin('failed', { provider_status: res.status, provider_detail: res.detail, error: res.detail });
  }
}
