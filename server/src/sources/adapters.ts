// Gerçek kaynak adaptörleri. Tümü UTC'ye normalize eder.

import type { RecordStatus, SourceId, SourceRecord } from '../../../shared/src/types.ts';

const UA = 'afet-takip-pilot/0.2 (+deprem bilgilendirme platformu)';

async function getJson(url: string, timeoutMs = 15_000, accept = 'application/json'): Promise<unknown> {
  const r = await fetch(url, { headers: { 'user-agent': UA, accept }, signal: AbortSignal.timeout(timeoutMs) });
  if (r.status === 204 || r.status === 404) return null;
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.json();
}

async function getText(url: string, timeoutMs = 15_000): Promise<string | null> {
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/plain, */*' }, signal: AbortSignal.timeout(timeoutMs) });
  if (r.status === 204 || r.status === 404) return null;
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.text();
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const round1 = (v: number | null): number | null => (v == null ? null : Math.round(v * 10) / 10);
const fmtAfad = (ms: number) => new Date(ms).toISOString().slice(0, 19);

/** Büyüklük türünü yazım kuralına getirir: ml/mlh→ML, mw/mww→Mw/Mww, mb→mb, md→Md, mj→Mj. */
export function normMagType(t: string | null | undefined): string | null {
  if (!t) return null;
  const s = t.trim().toLowerCase();
  if (!s || s === '--' || s === 'unknown') return null;
  if (s === 'ml' || s === 'mlv' || s === 'mlh') return 'ML';
  if (s === 'mb' || s === 'mb_lg' || s === 'mblg') return s === 'mb' ? 'mb' : 'mbLg';
  if (s.startsWith('mw')) return 'Mw' + s.slice(2);
  if (s === 'md' || s === 'ms' || s === 'mj' || s === 'm') return s === 'm' ? 'M' : 'M' + s.slice(1);
  return t.trim();
}

// ---------- AFAD ----------
interface AfadEvent {
  eventID: string; location: string; latitude: string; longitude: string; depth: string; type: string; magnitude: string;
  country: string | null; province: string | null; district: string | null; date: string; isEventUpdate: boolean; lastUpdateDate: string | null;
}

export function normalizeAfad(e: AfadEvent): SourceRecord | null {
  const lat = num(e.latitude), lon = num(e.longitude);
  if (lat == null || lon == null || !e.date) return null;
  // AFAD apiv2 tarihleri UTC'dir (saat dilimi eki olmadan).
  const toIso = (s: string) => new Date(s.endsWith('Z') ? s : `${s}Z`).toISOString();
  return {
    source: 'AFAD', sourceEventId: String(e.eventID), originTime: toIso(e.date),
    sourcePublishedAt: e.lastUpdateDate ? toIso(e.lastUpdateDate) : null,
    lat, lon, depthKm: num(e.depth), magnitude: num(e.magnitude), magType: normMagType(e.type) ?? (e.type || null),
    place: e.location || [e.district, e.province].filter(Boolean).join(', ') || 'Bilinmeyen yer',
    region: e.country || null, status: e.isEventUpdate ? 'reviewed' : 'unknown',
    url: `https://deprem.afad.gov.tr/event-detail/${encodeURIComponent(e.eventID)}`, isTest: false,
  };
}

export async function fetchAfad(fromMs: number, toMs: number): Promise<SourceRecord[]> {
  const u = `https://deprem.afad.gov.tr/apiv2/event/filter?start=${fmtAfad(fromMs)}&end=${fmtAfad(toMs)}&format=json&orderby=timedesc&limit=5000`;
  const j = (await getJson(u, 30_000)) as AfadEvent[] | null;
  return (j ?? []).map(normalizeAfad).filter((x): x is SourceRecord => !!x);
}

// ---------- KOERI (Boğaziçi Üniv. Kandilli Rasathanesi - KRDAE) ----------
const titleCaseTr = (s: string) =>
  s.toLocaleLowerCase('tr').replace(/(^|[\s\-/(])\p{L}/gu, (m) => m.toLocaleUpperCase('tr'));

const koeriMag = (v: string): number | null => (!v || v === '-.-' ? null : num(v));

const koeriIsoFromTr = (dateDots: string, time: string): string | null => {
  // Kandilli listesi Türkiye yerel saatidir (UTC+03:00).
  const d = Date.parse(`${dateDots.replace(/\./g, '-')}T${time}+03:00`);
  return Number.isFinite(d) ? new Date(d).toISOString() : null;
};

export function parseKoeriHtml(html: string, fromMs = 0): SourceRecord[] {
  const preMatch = /<pre[^>]*>([\s\S]*?)<\/pre>/i.exec(html);
  const body = preMatch ? preMatch[1]! : html;
  const out: SourceRecord[] = [];
  const seen = new Set<string>();
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!/^\d{4}\.\d{2}\.\d{2}\s+\d{2}:\d{2}:\d{2}\s+/.test(line)) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 9) continue;
    const [dateDots, time, latS, lonS, depthS, mdS, mlS, mwS] = parts as [string, string, string, string, string, string, string, string];
    const lat = num(latS), lon = num(lonS);
    const originTime = koeriIsoFromTr(dateDots, time);
    if (lat == null || lon == null || !originTime) continue;
    if (fromMs > 0 && Date.parse(originTime) < fromMs) continue;

    // İlk 8 sütundan sonrası: "<YER ADI>   İlksel" veya "<YER ADI>   REVIZE01 (YYYY.MM.DD HH:MM:SS)"
    const afterCols = line.replace(/^\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+\S+\s+/, '');
    const qualMatch = /\s+(REVIZE\d*(?:\s*\((\d{4}\.\d{2}\.\d{2})\s+(\d{2}:\d{2}:\d{2})\))?|[İIÝiı]lksel)\s*$/i.exec(afterCols);
    const rawPlace = (qualMatch ? afterCols.slice(0, qualMatch.index) : afterCols).replace(/\s+/g, ' ').trim();
    const isRev = !!(qualMatch && /^REVIZE/i.test(qualMatch[1]!));
    const publishedAt = isRev && qualMatch?.[2] && qualMatch?.[3] ? koeriIsoFromTr(qualMatch[2], qualMatch[3]) : null;

    const mw = koeriMag(mwS), ml = koeriMag(mlS), md = koeriMag(mdS);
    const magnitude = mw ?? ml ?? md;
    const magType = mw != null ? 'Mw' : ml != null ? 'ML' : md != null ? 'Md' : null;
    const place = rawPlace ? titleCaseTr(rawPlace) : 'Bilinmeyen yer';
    const baseId = `${dateDots.replace(/\./g, '')}${time.replace(/:/g, '')}`;
    const sourceEventId = seen.has(baseId) ? `${baseId}_${lat.toFixed(2)}_${lon.toFixed(2)}` : baseId;
    seen.add(sourceEventId);

    out.push({
      source: 'KOERI',
      sourceEventId,
      originTime,
      sourcePublishedAt: publishedAt,
      lat,
      lon,
      depthKm: num(depthS),
      magnitude,
      magType,
      place,
      region: 'Türkiye',
      status: isRev ? 'reviewed' : 'automatic',
      url: 'http://www.koeri.boun.edu.tr/scripts/lst0.asp',
      isTest: false,
    });
  }
  return out;
}

export async function fetchKoeri(fromMs = 0): Promise<SourceRecord[]> {
  const r = await fetch('http://www.koeri.boun.edu.tr/scripts/lst0.asp', {
    headers: { 'user-agent': UA, accept: 'text/html, text/plain, */*' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} koeri`);
  const buf = await r.arrayBuffer();
  let html: string;
  try {
    html = new TextDecoder('windows-1254').decode(buf);
  } catch {
    html = new TextDecoder('utf-8').decode(buf);
  }
  return parseKoeriHtml(html, fromMs);
}

// ---------- USGS ----------
interface UsgsFeature {
  id: string;
  properties: { mag: number | null; place: string | null; time: number; updated: number; url: string; status: string; magType: string | null; type: string; title: string };
  geometry: { coordinates: [number, number, number | null] };
}

const USGS_REGION_TR: Record<string, string> = {
  Japan: 'Japonya', Indonesia: 'Endonezya', Chile: 'Şili', Peru: 'Peru', Mexico: 'Meksika', Greece: 'Yunanistan', Türkiye: 'Türkiye', Turkey: 'Türkiye',
  Iran: 'İran', Italy: 'İtalya', Philippines: 'Filipinler', 'New Zealand': 'Yeni Zelanda', China: 'Çin', Taiwan: 'Tayvan', Alaska: 'Alaska (ABD)',
  California: 'Kaliforniya (ABD)', CA: 'Kaliforniya (ABD)', 'Papua New Guinea': 'Papua Yeni Gine', Tonga: 'Tonga', Fiji: 'Fiji', Vanuatu: 'Vanuatu',
  Russia: 'Rusya', Afghanistan: 'Afganistan', Pakistan: 'Pakistan', India: 'Hindistan', Nepal: 'Nepal', Argentina: 'Arjantin', Ecuador: 'Ekvador',
  Colombia: 'Kolombiya', Guatemala: 'Guatemala', 'El Salvador': 'El Salvador', Nicaragua: 'Nikaragua', 'Costa Rica': 'Kosta Rika', Cyprus: 'Kıbrıs',
  Egypt: 'Mısır', Syria: 'Suriye', Iraq: 'Irak', Georgia: 'Gürcistan', Armenia: 'Ermenistan', Azerbaijan: 'Azerbaycan', Romania: 'Romanya',
};

export function normalizeUsgs(f: UsgsFeature): SourceRecord | null {
  const p = f.properties;
  if (p.type !== 'earthquake') return null;
  const [lon, lat, depth] = f.geometry.coordinates;
  const tail = (p.place ?? '').split(', ').pop() ?? '';
  return {
    source: 'USGS', sourceEventId: f.id, originTime: new Date(p.time).toISOString(), sourcePublishedAt: new Date(p.updated).toISOString(),
    lat, lon, depthKm: depth ?? null, magnitude: p.mag, magType: normMagType(p.magType),
    place: p.place ?? 'Bilinmeyen yer', region: USGS_REGION_TR[tail] ?? (tail || null),
    status: p.status === 'reviewed' ? 'reviewed' : p.status === 'deleted' ? 'deleted' : 'automatic',
    url: p.url, isTest: false,
  };
}

export async function fetchUsgs(feed: 'all_hour' | '2.5_hour' | '2.5_day' | '4.5_week' | '4.5_month' | 'significant_month' = '2.5_hour'): Promise<SourceRecord[]> {
  const j = (await getJson(`https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${feed}.geojson`)) as { features: UsgsFeature[] } | null;
  return (j?.features ?? []).map(normalizeUsgs).filter((x): x is SourceRecord => !!x);
}

// ---------- EMSC ----------
interface EmscFeature {
  id: string;
  properties: { unid: string; time: string; lastupdate: string; lat: number; lon: number; depth: number | null; mag: number | null; magtype: string | null; flynn_region: string; evtype: string; auth: string };
}

const titleCase = (s: string) => s.toLocaleLowerCase('en').replace(/\b\p{L}/gu, (c) => c.toLocaleUpperCase('en'));

export function normalizeEmsc(f: EmscFeature): SourceRecord | null {
  const p = f.properties;
  if (p.evtype && !['ke', 'se', 'ue'].includes(p.evtype)) return null;
  const region = titleCase(p.flynn_region || '');
  return {
    source: 'EMSC', sourceEventId: p.unid, originTime: new Date(p.time).toISOString(), sourcePublishedAt: p.lastupdate ? new Date(p.lastupdate).toISOString() : null,
    lat: p.lat, lon: p.lon, depthKm: p.depth ?? null, magnitude: p.mag ?? null, magType: normMagType(p.magtype),
    place: region || 'Bilinmeyen yer', region: region || null, status: 'automatic',
    url: `https://www.seismicportal.eu/eventdetails.html?unid=${encodeURIComponent(p.unid)}`, isTest: false,
  };
}

export async function fetchEmsc(fromMs: number): Promise<SourceRecord[]> {
  const st = new Date(fromMs).toISOString().slice(0, 19);
  const j = (await getJson(`https://www.seismicportal.eu/fdsnws/event/1/query?format=json&starttime=${st}&limit=1000&orderby=time`)) as { features: EmscFeature[] } | null;
  return (j?.features ?? []).map(normalizeEmsc).filter((x): x is SourceRecord => !!x);
}

// ---------- FDSN Event (text format: GEOFON, NOA, INGV) ----------
function toUtcIso(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const hasTz = /([zZ]|[+-]\d{2}:?\d{2})$/.test(s);
  const d = Date.parse(hasTz ? s : `${s}Z`);
  return Number.isFinite(d) ? new Date(d).toISOString() : null;
}

export function parseFdsnEventText(
  text: string | null,
  source: SourceId,
  opts: { urlOf: (id: string) => string | null; defaultRegion?: string | null; reviewedIf?: (author: string) => boolean },
): SourceRecord[] {
  if (!text) return [];
  const out: SourceRecord[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim();
    if (!l || l.startsWith('#')) continue;
    const cols = l.split('|');
    if (cols.length < 13) continue;
    const [eventId, timeS, latS, lonS, depthS, author = '', , , , magTypeS = '', magS = '', , locName = '', evType = ''] = cols;
    const et = evType.trim().toLowerCase();
    if (et && !['earthquake', 'ke', 'se', 'ue', 'suspected earthquake', 'induced or triggered event'].includes(et)) continue;
    const lat = num(latS), lon = num(lonS), originTime = toUtcIso(timeS ?? '');
    if (!eventId || lat == null || lon == null || !originTime) continue;
    const mag = round1(num(magS));
    const depth = round1(num(depthS));
    const place = locName.trim() || opts.defaultRegion || 'Unknown location';
    const status: RecordStatus = opts.reviewedIf ? (opts.reviewedIf(author) ? 'reviewed' : 'automatic') : 'unknown';
    out.push({
      source,
      sourceEventId: eventId.trim(),
      originTime,
      sourcePublishedAt: null,
      lat,
      lon,
      depthKm: depth,
      magnitude: mag,
      magType: normMagType(magTypeS),
      place,
      region: opts.defaultRegion ?? (place || null),
      status,
      url: opts.urlOf(eventId.trim()),
      isTest: false,
    });
  }
  return out;
}

export async function fetchGeofon(fromMs: number, limit = 500): Promise<SourceRecord[]> {
  const st = new Date(fromMs).toISOString().slice(0, 19);
  const txt = await getText(`https://geofon.gfz.de/fdsnws/event/1/query?starttime=${st}&limit=${limit}&format=text&nodata=404`, 20_000);
  return parseFdsnEventText(txt, 'GEOFON', {
    urlOf: (id) => `https://geofon.gfz.de/eqinfo/event.php?id=${encodeURIComponent(id)}`,
  });
}

export async function fetchNoa(fromMs: number, limit = 500): Promise<SourceRecord[]> {
  const st = new Date(fromMs).toISOString().slice(0, 19);
  const txt = await getText(`https://eida.gein.noa.gr/fdsnws/event/1/query?starttime=${st}&minmag=1.8&format=text&nodata=404`, 12_000);
  return parseFdsnEventText(txt, 'NOA', {
    urlOf: () => 'https://bbnet.gein.noa.gr/hl/seismicity/real-time-seismicity',
    defaultRegion: 'Ege / Yunanistan',
    reviewedIf: (author) => !!author && !/auto/i.test(author),
  }).slice(0, limit);
}

export async function fetchIngv(fromMs: number, minMag = 2.0, limit = 500): Promise<SourceRecord[]> {
  const st = new Date(fromMs).toISOString().slice(0, 19);
  const txt = await getText(`https://webservices.ingv.it/fdsnws/event/1/query?starttime=${st}&minmag=${minMag}&limit=${limit}&format=text&nodata=404`, 20_000);
  return parseFdsnEventText(txt, 'INGV', {
    urlOf: (id) => `https://terremoti.ingv.it/event/${encodeURIComponent(id)}`,
    defaultRegion: 'Akdeniz / İtalya',
    reviewedIf: (author) => /SURVEY|BULLETIN/i.test(author),
  });
}

// ---------- GeoNet (Yeni Zelanda) ----------
export interface GeonetFeature {
  geometry: { coordinates: [number, number] };
  properties: { publicID: string; time: string; depth: number | null; magnitude: number | null; locality: string | null; quality: string };
}

export function normalizeGeonet(f: GeonetFeature): SourceRecord | null {
  const p = f.properties;
  const [lon, lat] = f.geometry?.coordinates ?? [NaN, NaN];
  if (!p?.publicID || !Number.isFinite(lat) || !Number.isFinite(lon) || !p.time) return null;
  const t = Date.parse(p.time);
  if (!Number.isFinite(t)) return null;
  return {
    source: 'GEONET',
    sourceEventId: p.publicID,
    originTime: new Date(t).toISOString(),
    sourcePublishedAt: null,
    lat,
    lon,
    depthKm: round1(num(p.depth)),
    magnitude: round1(num(p.magnitude)),
    magType: 'ML',
    place: p.locality || 'New Zealand',
    region: 'Yeni Zelanda',
    status: p.quality === 'deleted' ? 'deleted' : p.quality === 'best' ? 'reviewed' : 'automatic',
    url: `https://www.geonet.org.nz/earthquake/${encodeURIComponent(p.publicID)}`,
    isTest: false,
  };
}

export async function fetchGeonet(fromMs = 0): Promise<SourceRecord[]> {
  const j = (await getJson('https://api.geonet.org.nz/quake?MMI=-1', 15_000, 'application/vnd.geo+json;version=2, application/json')) as { features?: GeonetFeature[] } | null;
  return (j?.features ?? [])
    .map(normalizeGeonet)
    .filter((x): x is SourceRecord => !!x && (fromMs <= 0 || Date.parse(x.originTime) >= fromMs));
}

// ---------- JMA (Japonya Meteoroloji Ajansı) ----------
export interface JmaItem {
  eid: string;
  ctt?: string;
  rdt?: string;
  at?: string;
  anm?: string;
  en_anm?: string;
  cod?: string;
  mag?: string;
}

export function normalizeJma(e: JmaItem): SourceRecord | null {
  if (!e.eid || !e.at || !e.cod) return null;
  // ISO 6709: "+43.3+145.3-80000/" veya "+35.6+140.1+0/"
  const m = /^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)?\//.exec(e.cod);
  if (!m) return null;
  const lat = Number(m[1]), lon = Number(m[2]);
  const depthM = m[3] !== undefined ? Number(m[3]) : null;
  const originMs = Date.parse(e.at);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(originMs)) return null;
  const pubMs = e.rdt ? Date.parse(e.rdt) : NaN;
  const mag = num(e.mag);
  return {
    source: 'JMA',
    sourceEventId: e.eid,
    originTime: new Date(originMs).toISOString(),
    sourcePublishedAt: Number.isFinite(pubMs) ? new Date(pubMs).toISOString() : null,
    lat,
    lon,
    depthKm: depthM != null && Number.isFinite(depthM) ? Math.round((Math.abs(depthM) / 1000) * 10) / 10 : null,
    magnitude: mag,
    magType: mag != null ? 'Mj' : null,
    place: e.en_anm?.trim() || e.anm?.trim() || 'Japan',
    region: 'Japonya',
    status: 'reviewed',
    url: `https://www.data.jma.go.jp/multi/quake/quake_detail.html?eventID=${encodeURIComponent(e.ctt || e.eid)}&lang=en`,
    isTest: false,
  };
}

export async function fetchJma(fromMs = 0): Promise<SourceRecord[]> {
  const j = (await getJson('https://www.jma.go.jp/bosai/quake/data/list.json', 15_000)) as JmaItem[] | null;
  const seen = new Set<string>();
  const out: SourceRecord[] = [];
  for (const item of j ?? []) {
    if (!item.eid || seen.has(item.eid)) continue;
    const rec = normalizeJma(item);
    if (!rec) continue;
    seen.add(item.eid);
    if (fromMs > 0 && Date.parse(rec.originTime) < fromMs) continue;
    out.push(rec);
  }
  return out;
}

// ---------- Sismik istasyonlar (GFZ GEOFON + KOERI EIDA + NOA + INGV FDSN station) ----------
export interface Station { network: string; station: string; lat: number; lon: number; elevation: number | null; siteName: string; start: string; end: string | null }

export const STATION_ENDPOINTS = [
  'https://geofon.gfz.de/fdsnws/station/1/query?minlat=34&maxlat=43.5&minlon=24&maxlon=46&level=station&format=text&nodata=404',
  'https://eida.koeri.boun.edu.tr/fdsnws/station/1/query?minlat=34&maxlat=43.5&minlon=24&maxlon=46&level=station&format=text&nodata=404',
  'https://eida.gein.noa.gr/fdsnws/station/1/query?minlat=34&maxlat=43.5&minlon=24&maxlon=46&level=station&format=text&nodata=404',
  'https://webservices.ingv.it/fdsnws/station/1/query?minlat=34&maxlat=43.5&minlon=24&maxlon=46&level=station&format=text&nodata=404',
];

export function parseStationText(txt: string): Station[] {
  const now = Date.now();
  return txt
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const [network, station, lat, lon, elev, site, start, end] = l.split('|').map((s) => s.trim());
      return {
        network: network ?? '',
        station: station ?? '',
        lat: Number(lat),
        lon: Number(lon),
        elevation: num(elev),
        siteName: site && site !== 'X' ? site : '',
        start: start ?? '',
        end: end || null,
      };
    })
    .filter((s) => s.network && s.station && Number.isFinite(s.lat) && Number.isFinite(s.lon) && (!s.end || Date.parse(s.end) > now));
}

export async function fetchStations(): Promise<Station[]> {
  const settled = await Promise.allSettled(STATION_ENDPOINTS.map((u) => getText(u, 20_000)));
  const merged = new Map<string, Station>();
  let anyOk = false;
  for (const res of settled) {
    if (res.status !== 'fulfilled' || res.value == null) continue;
    anyOk = true;
    for (const s of parseStationText(res.value)) {
      const key = `${s.network}.${s.station}`;
      const prev = merged.get(key);
      if (!prev || (!prev.siteName && s.siteName)) merged.set(key, s);
    }
  }
  if (!anyOk) throw new Error('İstasyon servislerine erişilemiyor');
  return [...merged.values()];
}

// ---------- Diri faylar (GEM / EMME / MTA derlemesi, CC BY-SA 4.0) ----------
export interface FaultFeature {
  id: string;
  name: string | null;
  slipType: string | null;
  catalog: string | null;
  lines: [number, number][][]; // [lat, lon][][]
}

export const GEM_FAULTS_URL =
  'https://raw.githubusercontent.com/GEMScienceTools/gem-global-active-faults/master/geojson/gem_active_faults_harmonized.geojson';

interface RawGeoJsonFeature {
  properties?: Record<string, unknown>;
  geometry?: { type?: string; coordinates?: unknown };
}

export function extractRegionFaults(geojson: { features?: RawGeoJsonFeature[] }, bounds = { minLat: 33.5, maxLat: 43.5, minLon: 23.5, maxLon: 46.5 }): FaultFeature[] {
  const out: FaultFeature[] = [];
  let idx = 0;
  for (const f of geojson.features ?? []) {
    const g = f.geometry;
    if (!g) continue;
    const rawLines: number[][][] =
      g.type === 'LineString' ? [g.coordinates as number[][]]
      : g.type === 'MultiLineString' ? (g.coordinates as number[][][])
      : [];
    if (!rawLines.length) continue;
    const inBox = rawLines.some((ln) => ln.some(([lon, lat]) =>
      typeof lat === 'number' && typeof lon === 'number' &&
      lat >= bounds.minLat && lat <= bounds.maxLat && lon >= bounds.minLon && lon <= bounds.maxLon));
    if (!inBox) continue;
    const p = f.properties ?? {};
    const lines: [number, number][][] = rawLines
      .map((ln) => ln.map(([lon, lat]) => [Math.round(lat! * 1e4) / 1e4, Math.round(lon! * 1e4) / 1e4] as [number, number]))
      .filter((ln) => ln.length >= 2);
    if (!lines.length) continue;
    out.push({
      id: String(p.catalog_id ?? `f${++idx}`),
      name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : null,
      slipType: typeof p.slip_type === 'string' && p.slip_type.trim() ? p.slip_type.trim() : null,
      catalog: typeof p.catalog_name === 'string' ? p.catalog_name : null,
      lines,
    });
  }
  return out;
}

export async function fetchActiveFaults(): Promise<FaultFeature[]> {
  const j = (await getJson(GEM_FAULTS_URL, 25_000)) as { features?: RawGeoJsonFeature[] } | null;
  if (!j?.features) throw new Error('Diri fay verisi alınamadı');
  return extractRegionFaults(j);
}
