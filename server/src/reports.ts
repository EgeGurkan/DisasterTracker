import { inTurkeyRegion } from '../../shared/src/geo.ts';
import type { Ctx } from './ctx.ts';
import { iso } from './ctx.ts';

interface Ev { id: string; origin_ms: number; magnitude: number | null; depth_km: number | null; place: string; lat: number; lon: number; mag_type: string | null }

const RANGES = { '24h': 86400_000, '7d': 7 * 86400_000, '30d': 30 * 86400_000 } as const;
export type RangeKey = keyof typeof RANGES;

function provinceOf(place: string): string {
  const m = /\(([^)]+)\)\s*$/.exec(place);
  if (m) return m[1]!;
  if (/Akdeniz/i.test(place)) return 'Akdeniz';
  if (/Ege/i.test(place)) return 'Ege Denizi';
  if (/Marmara/i.test(place)) return 'Marmara Denizi';
  if (/Karadeniz/i.test(place)) return 'Karadeniz';
  return place.split(/[,-]/)[0]!.trim() || 'Diğer';
}

export function buildReport(ctx: Ctx, range: RangeKey, region: 'tr' | 'world', minMag: number) {
  const nowMs = ctx.now();
  const from = nowMs - RANGES[range];
  const rows = (ctx.db.prepare('SELECT id, origin_ms, magnitude, depth_km, place, lat, lon, mag_type FROM events WHERE is_test = 0 AND status = ? AND origin_ms >= ? AND origin_ms <= ?')
    .all('active', from, nowMs) as unknown as Ev[])
    .filter((e) => (region === 'tr' ? inTurkeyRegion(e.lat, e.lon) : true))
    .filter((e) => minMag <= 0 || (e.magnitude != null && e.magnitude >= minMag));

  const magBuckets = [
    { label: 'M < 2,0', test: (m: number) => m < 2 },
    { label: 'M 2,0–2,9', test: (m: number) => m >= 2 && m < 3 },
    { label: 'M 3,0–3,9', test: (m: number) => m >= 3 && m < 4 },
    { label: 'M 4,0–4,9', test: (m: number) => m >= 4 && m < 5 },
    { label: 'M 5,0+', test: (m: number) => m >= 5 },
  ].map((b) => ({ label: b.label, count: rows.filter((e) => e.magnitude != null && b.test(e.magnitude)).length }));
  const magUnknown = rows.filter((e) => e.magnitude == null).length;
  if (magUnknown) magBuckets.push({ label: 'Büyüklük bilinmiyor', count: magUnknown });

  const depthBuckets = [
    { label: '0–10 km', test: (d: number) => d < 10 },
    { label: '10–30 km', test: (d: number) => d >= 10 && d < 30 },
    { label: '30–70 km', test: (d: number) => d >= 30 && d < 70 },
    { label: '70 km+', test: (d: number) => d >= 70 },
  ].map((b) => ({ label: b.label, count: rows.filter((e) => e.depth_km != null && b.test(e.depth_km)).length }));
  const depthUnknown = rows.filter((e) => e.depth_km == null).length;
  if (depthUnknown) depthBuckets.push({ label: 'Derinlik bilinmiyor', count: depthUnknown });

  const largest = rows.reduce<Ev | null>((m, e) => (e.magnitude != null && (!m || e.magnitude > (m.magnitude ?? -9)) ? e : m), null);

  const byRegion = new Map<string, { count: number; max: number | null }>();
  for (const e of rows) {
    const k = region === 'tr' ? provinceOf(e.place) : (e.place.split(', ').pop() || 'Diğer');
    const cur = byRegion.get(k) ?? { count: 0, max: null };
    cur.count++;
    if (e.magnitude != null && (cur.max == null || e.magnitude > cur.max)) cur.max = e.magnitude;
    byRegion.set(k, cur);
  }
  const regions = [...byRegion.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.count - a.count).slice(0, 12);

  const bucketMs = range === '24h' ? 3600_000 : range === '7d' ? 6 * 3600_000 : 86400_000;
  const nb = Math.ceil(RANGES[range] / bucketMs);
  const start = nowMs - nb * bucketMs;
  const series = Array.from({ length: nb }, (_, i) => ({ start: iso(start + i * bucketMs), count: 0 }));
  for (const e of rows) {
    const i = Math.floor((e.origin_ms - start) / bucketMs);
    if (i >= 0 && i < nb) series[i]!.count++;
  }
  const primary = region === 'tr' ? 'AFAD' : 'USGS';
  const gaps = (ctx.db.prepare('SELECT source, start_at, end_at FROM source_gaps WHERE source = ? AND (end_at IS NULL OR end_at >= ?) AND start_at <= ?')
    .all(primary, iso(from), iso(nowMs)) as { source: string; start_at: string; end_at: string | null }[]);
  const firstData = ctx.db.prepare('SELECT MIN(first_ingested_at) AS t FROM source_records WHERE source = ?').get(primary) as { t: string | null };
  // Kaynağın bu aralığın başı için veri döndürmediği dönem de veri boşluğu olarak işaretlenir.
  const earliest = ctx.db.prepare('SELECT MIN(origin_ms) AS t FROM source_records WHERE source = ? AND is_test = 0').get(primary) as { t: number | null };
  const allGaps: { source: string; start_at: string; end_at: string | null; reason?: string }[] = [...gaps];
  if (earliest.t == null) allGaps.push({ source: primary, start_at: iso(from), end_at: iso(nowMs), reason: 'kaynaktan veri alınamadı' });
  else if (earliest.t - from > 6 * 3600_000) allGaps.unshift({ source: primary, start_at: iso(from), end_at: iso(earliest.t), reason: 'kaynak bu dönem için veri döndürmedi' });

  return {
    generatedAt: iso(nowMs), range, region, minMag, timezone: 'Europe/Istanbul',
    coverage: {
      primarySource: primary,
      note: region === 'tr'
        ? 'Türkiye ve yakın çevresi (35–43°K, 25–45,5°D). AFAD, Kandilli (KOERI), NOA, EMSC, GEOFON, INGV ve USGS kayıtları tek olaya birleştirilerek sayıldı.'
        : 'Dünya geneli. USGS, GEOFON, EMSC, JMA, GeoNet, INGV ve NOA akışları tek olaya birleştirildi.',
      platformDataSince: firstData.t,
    },
    total: rows.length,
    largest: largest ? { id: largest.id, magnitude: largest.magnitude, magType: largest.mag_type, place: largest.place, time: iso(largest.origin_ms) } : null,
    magBuckets, depthBuckets, regions,
    series: { bucketMs, points: series },
    gaps: allGaps,
  };
}
