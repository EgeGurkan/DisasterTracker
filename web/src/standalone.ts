// Sunucusuz (GitHub Pages / tek dosya) ve çevrimdışı sunucu yedeği için veri katmanı.
// Tarayıcıdan doğrudan AFAD, Kandilli (KOERI), EMSC, USGS, NOA, GEOFON, INGV, GeoNet ve JMA
// servislerini çeker; hızlı yanıt veren kaynakları anında birleştirip gösterir, geciken kaynak
// tamamlandığında listeyi arka planda günceller.

import type { EventSummary, SourceId, SourceRecord } from '../../shared/src/types.ts';
import { pickMergeTarget, summarize, MERGE_TOLERANCE } from '../../shared/src/merge.ts';
import { haversineKm, inTurkeyRegion } from '../../shared/src/geo.ts';
import { PROVINCES } from './provinces.ts';
import {
  extractRegionFaults, GEM_FAULTS_URL, normalizeEmsc, normalizeGeonet, normalizeJma, normalizeUsgs,
  parseFdsnEventText, parseStationText, STATION_ENDPOINTS, type FaultFeature, type GeonetFeature, type JmaItem,
} from '../../server/src/sources/adapters.ts';
import { INVENTORY } from '../../server/src/sources/inventory.ts';
import { fetchAllMultiHazards } from '../../server/src/sources/hazards.ts';
import { eewNotAvailableText } from '../../shared/src/match.ts';
import { ApiError } from './api.ts';
import { isEn, lang, tx } from './i18n.ts';

export const STANDALONE: boolean = import.meta.env.VITE_STANDALONE === '1';
export function serverOnlyText(): string {
  return tx(
    'Bu özellik GitHub (sunucusuz) sürümünde yok; bildirimler ve topluluk için uygulamanın sunucu sürümü gerekir.',
    'This feature is not available in the GitHub (serverless) edition; notifications and community require the server edition.',
  );
}
export const SERVER_ONLY_TEXT =
  'Bu özellik GitHub (sunucusuz) sürümünde yok; bildirimler ve topluluk için uygulamanın sunucu sürümü gerekir.';

interface Health { source: string; last_poll_at: string | null; last_success_at: string | null; last_error: string | null; last_event_time: string | null; status: string; consecutive_failures: number }
const health = new Map<string, Health>();
function mark(source: string, ok: boolean, err?: string, latest?: string | null) {
  const h = health.get(source) ?? { source, last_poll_at: null, last_success_at: null, last_error: null, last_event_time: null, status: 'unknown', consecutive_failures: 0 };
  const now = new Date().toISOString();
  h.last_poll_at = now;
  if (ok) { h.last_success_at = now; h.status = 'ok'; h.consecutive_failures = 0; if (latest && (!h.last_event_time || latest > h.last_event_time)) h.last_event_time = latest; }
  else { h.consecutive_failures++; h.last_error = err ?? 'error'; h.status = h.consecutive_failures >= 2 ? 'down' : 'degraded'; }
  health.set(source, h);
}

const TIMEOUT_MS = 6_000;

async function getJson<T>(url: string, source: string): Promise<T | null> {
  try {
    // Özel başlık eklemiyoruz ki tarayıcı gereksiz CORS OPTIONS ön-sorgusu (preflight) göndermesin.
    const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (r.status === 204 || r.status === 404) { mark(source, true); return null; }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as T;
  } catch (e) {
    mark(source, false, (e as Error).message);
    throw e;
  }
}

async function getText(url: string, source: string): Promise<string | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (r.status === 204 || r.status === 404) { mark(source, true); return null; }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } catch (e) {
    mark(source, false, (e as Error).message);
    throw e;
  }
}

const isoNoMs = (ms: number) => new Date(ms).toISOString().slice(0, 19);
const latestOf = (recs: SourceRecord[]) => recs.reduce<string | null>((m, r) => (!m || r.originTime > m ? r.originTime : m), null);
const titleCaseTr = (s: string) => s.toLocaleLowerCase('tr').replace(/(^|[\s\-/(])\p{L}/gu, (m) => m.toLocaleUpperCase('tr'));

// ---------- AFAD & Kandilli (CORS JSON mirror: api.orhanaydogdu.com.tr) ----------
interface OrhanItem {
  earthquake_id: string;
  title: string;
  mag: number;
  depth: number;
  geojson?: { coordinates?: [number, number] };
  rev?: string | null;
  date_time?: string;
  created_at?: number;
}

function parseOrhanItem(item: OrhanItem, source: 'AFAD' | 'KOERI'): SourceRecord | null {
  const coords = item.geojson?.coordinates;
  if (!coords || coords.length < 2) return null;
  const [lon, lat] = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  let originMs = NaN;
  if (item.date_time) {
    originMs = Date.parse(`${item.date_time.trim().replace(/\./g, '-').replace(' ', 'T')}+03:00`);
  }
  if (!Number.isFinite(originMs) && typeof item.created_at === 'number') {
    originMs = item.created_at * 1000;
  }
  if (!Number.isFinite(originMs)) return null;
  const place = source === 'KOERI' ? titleCaseTr(item.title || 'Türkiye') : (item.title || 'Türkiye');
  return {
    source,
    sourceEventId: String(item.earthquake_id || `${originMs}_${lat.toFixed(2)}`),
    originTime: new Date(originMs).toISOString(),
    sourcePublishedAt: null,
    lat,
    lon,
    depthKm: Number.isFinite(item.depth) ? Math.round(item.depth * 10) / 10 : null,
    magnitude: Number.isFinite(item.mag) ? Math.round(item.mag * 10) / 10 : null,
    magType: 'ML',
    place,
    region: 'Türkiye',
    status: item.rev ? 'reviewed' : source === 'KOERI' ? 'automatic' : 'unknown',
    url: source === 'AFAD' ? 'https://deprem.afad.gov.tr/last-earthquakes.html' : 'http://www.koeri.boun.edu.tr/scripts/lst0.asp',
    isTest: false,
  };
}

async function afadCors(fromMs: number): Promise<SourceRecord[]> {
  const j = await getJson<{ result?: OrhanItem[] }>('https://api.orhanaydogdu.com.tr/deprem/afad/live?limit=250', 'AFAD');
  const recs = (j?.result ?? []).map((x) => parseOrhanItem(x, 'AFAD')).filter((x): x is SourceRecord => !!x && Date.parse(x.originTime) >= fromMs);
  mark('AFAD', true, undefined, latestOf(recs));
  return recs;
}

async function koeriCors(fromMs: number): Promise<SourceRecord[]> {
  const j = await getJson<{ result?: OrhanItem[] }>('https://api.orhanaydogdu.com.tr/deprem/kandilli/live?limit=250', 'KOERI');
  const recs = (j?.result ?? []).map((x) => parseOrhanItem(x, 'KOERI')).filter((x): x is SourceRecord => !!x && Date.parse(x.originTime) >= fromMs);
  mark('KOERI', true, undefined, latestOf(recs));
  return recs;
}

const REGION_TR: Record<string, string> = {
  'Western Turkey': 'Batı Türkiye', 'Central Turkey': 'Orta Türkiye', 'Eastern Turkey': 'Doğu Türkiye', 'Turkey': 'Türkiye',
  'Aegean Sea': 'Ege Denizi', 'Sea Of Marmara': 'Marmara Denizi', 'Black Sea': 'Karadeniz', 'Eastern Mediterranean Sea': 'Doğu Akdeniz',
  'Dodecanese Is.-Turkey Border Reg': 'On İki Adalar – Türkiye sınır bölgesi', 'Greece': 'Yunanistan', 'Southern Greece': 'Güney Yunanistan',
  'Crete, Greece': 'Girit', 'Cyprus Region': 'Kıbrıs bölgesi', 'Turkey-Iran Border Reg': 'Türkiye–İran sınır bölgesi',
  'Turkey-Syria Border Region': 'Türkiye–Suriye sınır bölgesi', 'Northwestern Iran': 'Kuzeybatı İran', 'Bulgaria': 'Bulgaristan',
  'Georgia': 'Gürcistan', 'Armenia': 'Ermenistan', 'Syria': 'Suriye', 'Northern Iraq': 'Kuzey Irak', 'Iran-Iraq Border Region': 'İran–Irak sınır bölgesi',
};

/** EMSC'nin İngilizce bölge adını en yakın il merkeziyle zenginleştirir. */
function localizeEmscPlace(r: SourceRecord): SourceRecord {
  if (r.source !== 'EMSC' || !inTurkeyRegion(r.lat, r.lon)) return r;
  let best: [string, number] | null = null;
  for (const [name, lat, lon] of PROVINCES) {
    const d = haversineKm(r.lat, r.lon, lat, lon);
    if (!best || d < best[1]) best = [name, d];
  }
  if (isEn()) {
    const sea = /Sea|Dodecanese|Crete|Cyprus/i.test(r.place);
    const place = best && best[1] <= 100
      ? (sea ? `${r.place} (near ${best[0]})` : `Near ${best[0]}, Türkiye`)
      : r.place;
    return { ...r, place };
  }
  const regionTr = REGION_TR[r.place] ?? r.place;
  const sea = /Deniz|Akdeniz|Karadeniz|Adalar/.test(regionTr);
  const place = best && best[1] <= 100
    ? (sea ? `${regionTr} (${best[0]} yakını)` : `${best[0]} yakını`)
    : regionTr;
  return { ...r, place, region: regionTr };
}

async function emsc(fromMs: number, opts: { turkey: boolean; minMag?: number }): Promise<SourceRecord[]> {
  const q = new URLSearchParams({ format: 'json', starttime: isoNoMs(fromMs), limit: '2000', orderby: 'time' });
  if (opts.turkey) { q.set('minlat', '34'); q.set('maxlat', '43.5'); q.set('minlon', '24'); q.set('maxlon', '46'); }
  if (opts.minMag) q.set('minmag', String(opts.minMag));
  const j = await getJson<{ features: Parameters<typeof normalizeEmsc>[0][] }>(`https://www.seismicportal.eu/fdsnws/event/1/query?${q}`, 'EMSC');
  const recs = (j?.features ?? []).map(normalizeEmsc).filter((x): x is SourceRecord => !!x).map(localizeEmscPlace);
  mark('EMSC', true, undefined, recs[0]?.originTime ?? null);
  return recs;
}

async function usgs(hours: number): Promise<SourceRecord[]> {
  const feed = hours <= 1 ? '2.5_hour' : hours <= 24 ? '2.5_day' : hours <= 168 ? '2.5_week' : '4.5_month';
  const j = await getJson<{ features: Parameters<typeof normalizeUsgs>[0][] }>(`https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${feed}.geojson`, 'USGS');
  const recs = (j?.features ?? []).map(normalizeUsgs).filter((x): x is SourceRecord => !!x);
  mark('USGS', true, undefined, latestOf(recs));
  return recs;
}

async function geofon(fromMs: number): Promise<SourceRecord[]> {
  const txt = await getText(`https://geofon.gfz.de/fdsnws/event/1/query?starttime=${isoNoMs(fromMs)}&limit=500&format=text&nodata=404`, 'GEOFON');
  const recs = parseFdsnEventText(txt, 'GEOFON', { urlOf: (id) => `https://geofon.gfz.de/eqinfo/event.php?id=${encodeURIComponent(id)}` });
  mark('GEOFON', true, undefined, latestOf(recs));
  return recs;
}

async function noa(fromMs: number): Promise<SourceRecord[]> {
  const capped = Math.max(fromMs, Date.now() - 7 * 86400_000);
  const txt = await getText(`https://eida.gein.noa.gr/fdsnws/event/1/query?starttime=${isoNoMs(capped)}&minmag=2.0&format=text&nodata=404`, 'NOA');
  const recs = parseFdsnEventText(txt, 'NOA', {
    urlOf: () => 'https://bbnet.gein.noa.gr/hl/seismicity/real-time-seismicity',
    defaultRegion: isEn() ? 'Aegean / Greece' : 'Ege / Yunanistan',
    reviewedIf: (author) => !!author && !/auto/i.test(author),
  }).slice(0, 500);
  mark('NOA', true, undefined, latestOf(recs));
  return recs;
}

async function ingv(fromMs: number): Promise<SourceRecord[]> {
  const capped = Math.max(fromMs, Date.now() - 14 * 86400_000);
  const txt = await getText(`https://webservices.ingv.it/fdsnws/event/1/query?starttime=${isoNoMs(capped)}&minmag=1.2&limit=400&format=text&nodata=404`, 'INGV');
  const recs = parseFdsnEventText(txt, 'INGV', {
    urlOf: (id) => `https://terremoti.ingv.it/event/${encodeURIComponent(id)}`,
    defaultRegion: isEn() ? 'Mediterranean / Italy' : 'Akdeniz / İtalya',
    reviewedIf: (author) => /SURVEY|BULLETIN/i.test(author),
  });
  mark('INGV', true, undefined, latestOf(recs));
  return recs;
}

async function geonet(fromMs: number): Promise<SourceRecord[]> {
  const j = await getJson<{ features?: GeonetFeature[] }>('https://api.geonet.org.nz/quake?MMI=-1', 'GEONET');
  const recs = (j?.features ?? []).map(normalizeGeonet).filter((x): x is SourceRecord => !!x && Date.parse(x.originTime) >= fromMs);
  mark('GEONET', true, undefined, latestOf(recs));
  return recs;
}

async function jma(fromMs: number): Promise<SourceRecord[]> {
  const j = await getJson<JmaItem[]>('https://www.jma.go.jp/bosai/quake/data/list.json', 'JMA');
  const seen = new Set<string>();
  const recs: SourceRecord[] = [];
  for (const item of j ?? []) {
    if (!item.eid || seen.has(item.eid)) continue;
    const rec = normalizeJma(item);
    if (!rec) continue;
    seen.add(item.eid);
    if (Date.parse(rec.originTime) >= fromMs) recs.push(rec);
  }
  mark('JMA', true, undefined, latestOf(recs));
  return recs;
}

interface Built { event: EventSummary & { sources: string[]; updatedAt: string }; records: SourceRecord[]; firstSeen: string }
const known = new Map<string, Built>();
const sourceCache = new Map<string, { at: number; hours: number; recs: SourceRecord[] }>();

/** Sunucudaki events.ts ile aynı kural: zaman/konum toleransı, her kurumdan tek kayıt. */
function mergeRecords(recs: SourceRecord[]): Built[] {
  const sorted = [...recs].sort((a, b) => a.originTime.localeCompare(b.originTime));
  const groups: { id: string; records: SourceRecord[]; anchor: SourceRecord }[] = [];
  const win = MERGE_TOLERANCE.seconds * 1000;
  for (const r of sorted) {
    const t = Date.parse(r.originTime);
    const cands = groups.filter((g) => Math.abs(Date.parse(g.anchor.originTime) - t) <= win);
    const target = pickMergeTarget(r,
      cands.map((g) => ({ id: g.id, originTime: g.anchor.originTime, lat: g.anchor.lat, lon: g.anchor.lon, depthKm: g.anchor.depthKm, magnitude: g.anchor.magnitude, isTest: false })),
      (id) => groups.find((g) => g.id === id)!.records.map((x) => x.source as SourceId));
    if (target) groups.find((g) => g.id === target.id)!.records.push(r);
    else groups.push({ id: `${r.source.toLowerCase()}-${r.sourceEventId}`.replace(/[^a-zA-Z0-9_-]/g, '_'), records: [r], anchor: r });
  }
  const now = new Date().toISOString();
  return groups.map((g) => {
    const s = summarize(g.id, 1, g.records);
    const built: Built = {
      event: { ...s, version: 1, sources: g.records.map((x) => x.source), updatedAt: g.records.map((x) => x.sourcePublishedAt ?? x.originTime).sort().pop() ?? now },
      records: g.records,
      firstSeen: known.get(g.id)?.firstSeen ?? now,
    };
    known.set(g.id, built);
    return built;
  });
}

async function cachedJob(key: string, hours: number, fn: () => Promise<SourceRecord[]>): Promise<SourceRecord[]> {
  const hit = sourceCache.get(key);
  if (hit && hit.hours >= hours && Date.now() - hit.at < 20_000) return hit.recs;
  const recs = await fn();
  sourceCache.set(key, { at: Date.now(), hours, recs });
  return recs;
}

async function loadRegion(region: string, hours: number): Promise<Built[]> {
  const from = Date.now() - hours * 3600_000;
  const namedJobs: [string, Promise<SourceRecord[]>][] = [];
  if (region === 'tr' || region === 'all') {
    namedJobs.push(['AFAD', cachedJob('AFAD', hours, () => afadCors(from))]);
    namedJobs.push(['KOERI', cachedJob('KOERI', hours, () => koeriCors(from))]);
    namedJobs.push(['EMSC_TR', cachedJob(`EMSC_TR_${hours}`, hours, () => emsc(from, { turkey: true }))]);
    namedJobs.push(['NOA', cachedJob(`NOA_${hours}`, hours, () => noa(from))]);
    namedJobs.push(['INGV', cachedJob(`INGV_${hours}`, hours, () => ingv(from))]);
  }
  if (region === 'world' || region === 'all') {
    namedJobs.push(['EMSC_W', cachedJob(`EMSC_W_${hours}`, hours, () => emsc(from, { turkey: false, minMag: 4 }))]);
    namedJobs.push(['GEONET', cachedJob('GEONET', hours, () => geonet(from))]);
    namedJobs.push(['JMA', cachedJob('JMA', hours, () => jma(from))]);
    if (region === 'world') namedJobs.push(['INGV', cachedJob(`INGV_${hours}`, hours, () => ingv(from))]);
  }
  namedJobs.push(['USGS', cachedJob(`USGS_${hours}`, hours, () => usgs(hours))]);
  namedJobs.push(['GEOFON', cachedJob(`GEOFON_${hours}`, hours, () => geofon(from))]);

  // Hızlı kaynaklar (1.8 sn içinde gelenler) listeyi bekletmeden hemen çizdirir;
  // kalan kaynaklar tamamlandığında arayüze arka plan yenileme sinyali gönderilir.
  const collected: SourceRecord[][] = [];
  let doneCount = 0;
  let errors = 0;
  let returnedEarly = false;

  await new Promise<void>((resolve) => {
    const earlyTimer = setTimeout(() => {
      if (collected.some((arr) => arr.length > 0)) {
        returnedEarly = true;
        resolve();
      }
    }, 1_800);

    for (const [, p] of namedJobs) {
      p.then((recs) => {
        collected.push(recs);
        if (returnedEarly && recs.length > 0 && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('afet-standalone-more'));
        }
      }).catch(() => {
        errors++;
      }).finally(() => {
        doneCount++;
        if (doneCount >= namedJobs.length) {
          clearTimeout(earlyTimer);
          if (!returnedEarly) resolve();
        }
      });
    }
  });

  const recs = collected.flat();
  if (!recs.length && errors === namedJobs.length) {
    throw new ApiError(0, tx('Kaynağa erişilemiyor. İnternet bağlantını kontrol et.', 'Cannot reach data sources. Check your internet connection.'));
  }
  const seen = new Set<string>();
  const unique = recs.filter((r) => {
    const k = `${r.source}:${r.sourceEventId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return Date.parse(r.originTime) >= from;
  });
  return mergeRecords(unique);
}

async function events(q: URLSearchParams) {
  const region = q.get('region') ?? 'tr';
  const hours = Math.min(720, Math.max(1, Number(q.get('hours') ?? 24)));
  const minMag = Number(q.get('minMag') ?? 0);
  const source = q.get('source');
  const all = await loadRegion(region, hours);
  const out = all.map((b) => b.event)
    .filter((e) => (region === 'tr' ? inTurkeyRegion(e.lat, e.lon) : region === 'world' ? !inTurkeyRegion(e.lat, e.lon) : true))
    .filter((e) => (minMag > 0 ? e.magnitude != null && e.magnitude >= minMag : true))
    .filter((e) => (source ? e.sources.includes(source) : true))
    .sort((a, b) => b.originTime.localeCompare(a.originTime))
    .slice(0, Number(q.get('limit') ?? 400));
  return { events: out, sources: [...health.values()], generatedAt: new Date().toISOString() };
}

function eventDetail(id: string) {
  const b = known.get(id);
  if (!b) throw new ApiError(404, tx('Olay bulunamadı. Listeyi yenileyip tekrar dene.', 'Event not found. Refresh the list and try again.'));
  return {
    event: b.event,
    records: b.records.map((r) => ({ ...r, ingestedAt: b.firstSeen, firstIngestedAt: b.firstSeen, revision: 1 })),
    revisions: [],
    felt: { total: 0, byIntensity: [] },
  };
}

async function report(q: URLSearchParams) {
  const range = (q.get('range') ?? '24h') as '24h' | '7d' | '30d';
  const region = q.get('region') === 'world' ? 'world' : 'tr';
  const minMag = Number(q.get('minMag') ?? 0) || 0;
  const hours = range === '24h' ? 24 : range === '7d' ? 168 : 720;
  const nowMs = Date.now();
  const from = nowMs - hours * 3600_000;
  const rows = (await loadRegion(region, hours)).map((b) => b.event)
    .filter((e) => (region === 'tr' ? inTurkeyRegion(e.lat, e.lon) : true))
    .filter((e) => minMag <= 0 || (e.magnitude != null && e.magnitude >= minMag));
  const count = (f: (e: EventSummary) => boolean) => rows.filter(f).length;
  const en = isEn();
  const magBuckets: { label: string; count: number }[] = [
    { label: en ? 'M < 2.0' : 'M < 2,0', count: count((e) => e.magnitude != null && e.magnitude < 2) },
    { label: en ? 'M 2.0–2.9' : 'M 2,0–2,9', count: count((e) => e.magnitude != null && e.magnitude >= 2 && e.magnitude < 3) },
    { label: en ? 'M 3.0–3.9' : 'M 3,0–3,9', count: count((e) => e.magnitude != null && e.magnitude >= 3 && e.magnitude < 4) },
    { label: en ? 'M 4.0–4.9' : 'M 4,0–4,9', count: count((e) => e.magnitude != null && e.magnitude >= 4 && e.magnitude < 5) },
    { label: en ? 'M 5.0+' : 'M 5,0+', count: count((e) => e.magnitude != null && e.magnitude >= 5) },
  ];
  const mu = count((e) => e.magnitude == null);
  if (mu) magBuckets.push({ label: tx('Büyüklük bilinmiyor', 'Magnitude unknown'), count: mu });
  const depthBuckets: { label: string; count: number }[] = [
    { label: '0–10 km', count: count((e) => e.depthKm != null && e.depthKm < 10) },
    { label: '10–30 km', count: count((e) => e.depthKm != null && e.depthKm >= 10 && e.depthKm < 30) },
    { label: '30–70 km', count: count((e) => e.depthKm != null && e.depthKm >= 30 && e.depthKm < 70) },
    { label: '70 km+', count: count((e) => e.depthKm != null && e.depthKm >= 70) },
  ];
  const du = count((e) => e.depthKm == null);
  if (du) depthBuckets.push({ label: tx('Derinlik bilinmiyor', 'Depth unknown'), count: du });
  const largest = rows.reduce<EventSummary | null>((m, e) => (e.magnitude != null && (!m || e.magnitude > (m.magnitude ?? -9)) ? e : m), null);
  const byRegion = new Map<string, { count: number; max: number | null }>();
  for (const e of rows) {
    const k = e.region || e.place;
    const c = byRegion.get(k) ?? { count: 0, max: null };
    c.count++;
    if (e.magnitude != null && (c.max == null || e.magnitude > c.max)) c.max = e.magnitude;
    byRegion.set(k, c);
  }
  const bucketMs = range === '24h' ? 3600_000 : range === '7d' ? 6 * 3600_000 : 86400_000;
  const nb = Math.ceil((hours * 3600_000) / bucketMs);
  const start = nowMs - nb * bucketMs;
  const points = Array.from({ length: nb }, (_, i) => ({ start: new Date(start + i * bucketMs).toISOString(), count: 0 }));
  for (const e of rows) { const i = Math.floor((Date.parse(e.originTime) - start) / bucketMs); if (i >= 0 && i < nb) points[i]!.count++; }
  return {
    generatedAt: new Date().toISOString(), range, region, minMag, timezone: 'Europe/Istanbul',
    coverage: {
      primarySource: region === 'tr' ? 'AFAD' : 'USGS',
      note: region === 'tr'
        ? tx(
            'AFAD, Kandilli (KOERI), NOA, EMSC, GEOFON, INGV ve USGS verileri tarayıcıda tek olaya birleştirildi.',
            'AFAD, KOERI (Kandilli), NOA, EMSC, GEOFON, INGV, and USGS feeds are merged in the browser.',
          )
        : tx(
            'USGS, GEOFON, EMSC, JMA, GeoNet, INGV ve NOA küresel akışları birleştirildi.',
            'USGS, GEOFON, EMSC, JMA, GeoNet, INGV, and NOA global feeds are merged.',
          ),
      platformDataSince: new Date(from).toISOString(),
    },
    total: rows.length,
    largest: largest ? { id: largest.id, magnitude: largest.magnitude, magType: largest.magType, place: largest.place, time: largest.originTime } : null,
    magBuckets, depthBuckets,
    regions: [...byRegion.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.count - a.count).slice(0, 12),
    series: { bucketMs, points },
    gaps: [...health.values()].filter((h) => h.status === 'down').map((h) => ({ source: h.source, start_at: h.last_success_at ?? new Date(from).toISOString(), end_at: null, reason: tx('kaynağa erişilemiyor', 'source unreachable') })),
  };
}

let cachedStations: { at: number; stations: ReturnType<typeof parseStationText> } | null = null;
async function stations() {
  const srcLabel = 'GFZ GEOFON · KOERI EIDA · NOA · INGV (FDSN station)';
  if (cachedStations && Date.now() - cachedStations.at < 6 * 3600_000) {
    return { source: srcLabel, fetchedAt: new Date(cachedStations.at).toISOString(), stations: cachedStations.stations };
  }
  const settled = await Promise.allSettled(
    STATION_ENDPOINTS.map(async (u) => {
      const r = await fetch(u, { signal: AbortSignal.timeout(10_000) });
      if (r.status === 204 || r.status === 404) return '';
      if (!r.ok) throw new Error(String(r.status));
      return r.text();
    }),
  );
  const merged = new Map<string, ReturnType<typeof parseStationText>[number]>();
  let anyOk = false;
  for (const res of settled) {
    if (res.status !== 'fulfilled') continue;
    anyOk = true;
    for (const s of parseStationText(res.value)) {
      const k = `${s.network}.${s.station}`;
      const prev = merged.get(k);
      if (!prev || (!prev.siteName && s.siteName)) merged.set(k, s);
    }
  }
  if (!anyOk) return { source: srcLabel, fetchedAt: null, stations: [], error: tx('Kaynağa erişilemiyor', 'Cannot reach station services') };
  const list = [...merged.values()];
  cachedStations = { at: Date.now(), stations: list };
  return { source: srcLabel, fetchedAt: new Date().toISOString(), stations: list };
}

let cachedFaults: { at: number; faults: FaultFeature[] } | null = null;
async function faults() {
  const srcLabel = 'GEM Global Active Faults / EMME & MTA (CC BY-SA 4.0)';
  if (cachedFaults && Date.now() - cachedFaults.at < 24 * 3600_000) {
    return { source: srcLabel, fetchedAt: new Date(cachedFaults.at).toISOString(), faults: cachedFaults.faults };
  }
  try {
    const r = await fetch(GEM_FAULTS_URL, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const gj = (await r.json()) as { features?: Parameters<typeof extractRegionFaults>[0]['features'] };
    const list = extractRegionFaults(gj);
    cachedFaults = { at: Date.now(), faults: list };
    return { source: srcLabel, fetchedAt: new Date().toISOString(), faults: list };
  } catch {
    return { source: srcLabel, fetchedAt: null, faults: [], error: tx('Diri fay verisine erişilemiyor', 'Cannot reach active faults feed') };
  }
}

let cachedDisasters: { at: number; items: Awaited<ReturnType<typeof fetchAllMultiHazards>> } | null = null;
async function disasters(q: URLSearchParams) {
  const hazard = q.get('hazard') ?? 'all';
  if (!cachedDisasters || Date.now() - cachedDisasters.at > 3 * 60_000) {
    const items = await fetchAllMultiHazards({ includeGdacs: false });
    cachedDisasters = { at: Date.now(), items };
  }
  const filtered = hazard === 'all' ? cachedDisasters.items : cachedDisasters.items.filter((x) => x.hazard === hazard);
  return { disasters: filtered.slice(0, 400), generatedAt: new Date(cachedDisasters.at).toISOString() };
}

/** /api/... isteğini tarayıcıda karşılar. */
export async function standaloneApi<T>(path: string, method: string): Promise<T> {
  const url = new URL(path, 'https://x');
  const p = url.pathname;
  if (method === 'GET') {
    if (p === '/api/config') return { vapidPublicKey: '', env: 'standalone', transports: {}, eew: { available: false, text: eewNotAvailableText(lang()), drillProvider: false }, serverTime: new Date().toISOString() } as T;
    if (p === '/api/events') return (await events(url.searchParams)) as T;
    if (p === '/api/disasters') return (await disasters(url.searchParams)) as T;
    const m = /^\/api\/events\/([^/]+)$/.exec(p);
    if (m) return eventDetail(decodeURIComponent(m[1]!)) as T;
    if (p === '/api/reports') return (await report(url.searchParams)) as T;
    if (p === '/api/alerts') return { eew: { available: false, text: eewNotAvailableText(lang()) }, alerts: [], log: [] } as T;
    if (p === '/api/sources') {
      if (health.size === 0) { try { await loadRegion('all', 24); } catch { /* sağlık tablosu dolsun */ } }
      return { health: [...health.values()], gaps: [], inventory: INVENTORY } as T;
    }
    if (p === '/api/stations') return (await stations()) as T;
    if (p === '/api/faults') return (await faults()) as T;
  }
  throw new ApiError(501, serverOnlyText());
}
