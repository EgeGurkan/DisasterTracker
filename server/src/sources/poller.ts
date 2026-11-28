// Kaynak yoklayıcı ve sağlık takibi. Kaynakla son başarılı bağlantı zamanı, en son deprem
// zamanından ayrı izlenir; art arda hata kesinti sayılır, veri boşluğu kaydedilir ve ekibe haber verilir.

import type { SourceRecord } from '../../../shared/src/types.ts';
import { iso, type Ctx } from '../ctx.ts';
import { ingestRecords } from '../events.ts';
import { fetchAfad, fetchEmsc, fetchGeofon, fetchGeonet, fetchIngv, fetchJma, fetchKoeri, fetchNoa, fetchUsgs } from './adapters.ts';

export interface SourceJob {
  source: string;
  intervalMs: number;
  fetch: (nowMs: number) => Promise<SourceRecord[]>;
}

export const DEFAULT_JOBS: SourceJob[] = [
  { source: 'AFAD', intervalMs: 20_000, fetch: (now) => fetchAfad(now - 2 * 3600_000, now + 60_000) },
  { source: 'KOERI', intervalMs: 30_000, fetch: (now) => fetchKoeri(now - 6 * 3600_000) },
  { source: 'EMSC', intervalMs: 60_000, fetch: (now) => fetchEmsc(now - 2 * 3600_000) },
  { source: 'USGS', intervalMs: 60_000, fetch: () => fetchUsgs('2.5_hour') },
  { source: 'NOA', intervalMs: 60_000, fetch: (now) => fetchNoa(now - 12 * 3600_000) },
  { source: 'GEOFON', intervalMs: 60_000, fetch: (now) => fetchGeofon(now - 24 * 3600_000) },
  { source: 'INGV', intervalMs: 90_000, fetch: (now) => fetchIngv(now - 24 * 3600_000, 1.0) },
  { source: 'JMA', intervalMs: 90_000, fetch: (now) => fetchJma(now - 48 * 3600_000) },
  { source: 'GEONET', intervalMs: 120_000, fetch: (now) => fetchGeonet(now - 24 * 3600_000) },
];

const OUTAGE_AFTER_FAILURES = 3;

export async function pollOnce(ctx: Ctx, job: SourceJob, notify = true): Promise<{ ok: boolean; count: number; error?: string }> {
  const { db } = ctx;
  const startMs = ctx.now();
  db.prepare('INSERT OR IGNORE INTO source_health (source) VALUES (?)').run(job.source);
  db.prepare('UPDATE source_health SET last_poll_at = ? WHERE source = ?').run(iso(startMs), job.source);
  try {
    const recs = await job.fetch(startMs);
    const outcomes = ingestRecords(ctx, recs, { notify });
    const latest = recs.reduce<string | null>((m, r) => (!m || r.originTime > m ? r.originTime : m), null);
    const h = db.prepare('SELECT status, outage_started_at FROM source_health WHERE source = ?').get(job.source) as { status: string; outage_started_at: string | null };
    if (h.status === 'down') {
      db.prepare('UPDATE source_gaps SET end_at = ? WHERE source = ? AND end_at IS NULL').run(iso(ctx.now()), job.source);
      ctx.opsAlert(`${job.source} kaynağına erişim geri geldi (kesinti başlangıcı ${h.outage_started_at}).`);
    }
    db.prepare(`UPDATE source_health SET last_success_at = ?, consecutive_failures = 0, last_count = ?, status = 'ok', outage_started_at = NULL,
      last_event_time = CASE WHEN ? IS NOT NULL AND (last_event_time IS NULL OR ? > last_event_time) THEN ? ELSE last_event_time END WHERE source = ?`)
      .run(iso(ctx.now()), recs.length, latest, latest, latest, job.source);
    return { ok: true, count: outcomes.filter((o) => o.change !== 'unchanged').length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    db.prepare('UPDATE source_health SET last_error = ?, last_error_at = ?, consecutive_failures = consecutive_failures + 1 WHERE source = ?')
      .run(msg.slice(0, 300), iso(ctx.now()), job.source);
    const h = db.prepare('SELECT consecutive_failures, status, last_success_at FROM source_health WHERE source = ?').get(job.source) as { consecutive_failures: number; status: string; last_success_at: string | null };
    if (h.consecutive_failures >= OUTAGE_AFTER_FAILURES && h.status !== 'down') {
      const start = h.last_success_at ?? iso(startMs);
      db.prepare("UPDATE source_health SET status = 'down', outage_started_at = ? WHERE source = ?").run(start, job.source);
      db.prepare('INSERT INTO source_gaps (source, start_at) VALUES (?, ?)').run(job.source, start);
      ctx.opsAlert(`KESİNTİ: ${job.source} kaynağına ${h.consecutive_failures} denemedir erişilemiyor: ${msg}`);
    } else if (h.status !== 'down') {
      db.prepare("UPDATE source_health SET status = 'degraded' WHERE source = ?").run(job.source);
    }
    return { ok: false, count: 0, error: msg };
  }
}

export function startPollers(ctx: Ctx, jobs: SourceJob[] = DEFAULT_JOBS): () => void {
  const timers: NodeJS.Timeout[] = [];
  for (const job of jobs) {
    let running = false;
    const run = async () => {
      if (running) return;
      running = true;
      try { await pollOnce(ctx, job); } finally { running = false; }
    };
    void run();
    timers.push(setInterval(run, job.intervalMs));
  }
  return () => timers.forEach(clearInterval);
}

/** İlk açılışta raporlar için geçmişi doldurur; bildirim üretmez. */
export async function backfill(ctx: Ctx): Promise<void> {
  const n = (ctx.db.prepare("SELECT COUNT(*) AS n FROM source_records WHERE source = 'AFAD'").get() as { n: number }).n;
  const now = ctx.now();
  if (n === 0) {
    for (let d = 30; d > 0; d -= 5) {
      try {
        const recs = await fetchAfad(now - d * 86400_000, now - (d - 5) * 86400_000);
        ingestRecords(ctx, recs, { notify: false });
        ctx.log(`Geri doldurma AFAD: ${recs.length} kayıt (${d}-${d - 5} gün önce)`);
      } catch (e) { ctx.log(`Geri doldurma AFAD hatası: ${String(e)}`); }
    }
  }
  const k = (ctx.db.prepare("SELECT COUNT(*) AS n FROM source_records WHERE source = 'KOERI'").get() as { n: number }).n;
  if (k === 0) {
    try {
      const recs = await fetchKoeri(0);
      ingestRecords(ctx, recs, { notify: false });
      ctx.log(`Geri doldurma KOERI: ${recs.length} kayıt`);
    } catch (e) { ctx.log(`Geri doldurma KOERI hatası: ${String(e)}`); }
  }
  const u = (ctx.db.prepare("SELECT COUNT(*) AS n FROM source_records WHERE source = 'USGS'").get() as { n: number }).n;
  if (u === 0) {
    try {
      const recs = await fetchUsgs('4.5_month');
      ingestRecords(ctx, recs, { notify: false });
      ctx.log(`Geri doldurma USGS: ${recs.length} kayıt`);
    } catch (e) { ctx.log(`Geri doldurma USGS hatası: ${String(e)}`); }
  }
  const g = (ctx.db.prepare("SELECT COUNT(*) AS n FROM source_records WHERE source = 'GEOFON'").get() as { n: number }).n;
  if (g === 0) {
    try {
      const recs = await fetchGeofon(now - 7 * 86400_000, 1000);
      ingestRecords(ctx, recs, { notify: false });
      ctx.log(`Geri doldurma GEOFON: ${recs.length} kayıt`);
    } catch (e) { ctx.log(`Geri doldurma GEOFON hatası: ${String(e)}`); }
  }
}
