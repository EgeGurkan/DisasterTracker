// Çoklu doğal afet adaptörleri: Sel (flood), Fırtına (storm), Hortum (tornado),
// Yangın (wildfire), Volkan (volcano) ve Tsunami (tsunami).
// Hem sunucu hem de tarayıcı (standalone) ortamında çalışacak şekilde standart fetch kullanır.

import type { DisasterEvent } from '../../../shared/src/types.ts';

type NonEqHazard = DisasterEvent['hazard'];

function centroidOfCoords(coords: unknown): [number, number] | null {
  if (!Array.isArray(coords) || coords.length === 0) return null;
  if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    return [coords[0], coords[1]]; // [lon, lat]
  }
  const flat: [number, number][] = [];
  const walk = (node: unknown) => {
    if (!Array.isArray(node)) return;
    if (typeof node[0] === 'number' && typeof node[1] === 'number') {
      flat.push([node[0], node[1]]);
      return;
    }
    for (const child of node) walk(child);
  };
  walk(coords);
  if (!flat.length) return null;
  let sumLon = 0, sumLat = 0;
  for (const [lon, lat] of flat) { sumLon += lon; sumLat += lat; }
  return [sumLon / flat.length, sumLat / flat.length];
}

function safeIso(raw: string | number | null | undefined): string | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? new Date(raw).toISOString() : null;
  const s = String(raw).trim();
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? `${s.replace(' ', 'T')}Z` : s;
  const ms = Date.parse(normalized);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

// ---------- 1. NASA EONET v3 (Yangın, Sel, Fırtına, Volkan) ----------
interface EonetEvent {
  id: string;
  title: string;
  description: string | null;
  link: string;
  categories?: { id: string; title: string }[];
  sources?: { id: string; url: string }[];
  geometry?: { magnitudeValue: number | null; magnitudeUnit: string | null; date: string; type: string; coordinates: unknown }[];
}

export function parseEonetEvents(events: EonetEvent[]): DisasterEvent[] {
  const out: DisasterEvent[] = [];
  for (const e of events) {
    const cat = e.categories?.[0]?.id ?? '';
    let hazard: NonEqHazard | null = null;
    if (cat === 'wildfires') hazard = 'wildfire';
    else if (cat === 'floods') hazard = 'flood';
    else if (cat === 'volcanoes') hazard = 'volcano';
    else if (cat === 'severeStorms') {
      hazard = /tornado|waterspout/i.test(e.title) ? 'tornado' : 'storm';
    }
    if (!hazard || !e.geometry?.length) continue;
    const g = e.geometry[e.geometry.length - 1]!;
    const pt = centroidOfCoords(g.coordinates);
    const originTime = safeIso(g.date);
    if (!pt || !originTime) continue;
    const [lon, lat] = pt;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const magVal = g.magnitudeValue;
    const magUnit = g.magnitudeUnit ?? '';
    const metricLabel = magVal != null && Number.isFinite(magVal)
      ? `${Math.round(magVal * 10) / 10}${magUnit ? ' ' + magUnit : ''}`
      : null;
    const severity: DisasterEvent['severity'] =
      hazard === 'volcano' ? 'warning'
      : hazard === 'storm' && magVal != null && magVal >= 64 ? 'severe'
      : hazard === 'wildfire' && magVal != null && magVal >= 5000 ? 'severe'
      : 'warning';
    const tail = e.title.includes(',') ? e.title.split(',').pop()!.trim() : null;
    out.push({
      id: `eonet-${e.id}`,
      hazard,
      title: e.title,
      place: e.title,
      region: tail,
      originTime,
      updatedAt: originTime,
      lat: Math.round(lat * 1e4) / 1e4,
      lon: Math.round(lon * 1e4) / 1e4,
      severity,
      metricLabel,
      description: e.description || null,
      source: 'NASA EONET',
      url: e.sources?.[0]?.url ?? e.link ?? 'https://eonet.gsfc.nasa.gov/',
    });
  }
  return out;
}

export async function fetchEonetHazards(timeoutMs = 8_000): Promise<DisasterEvent[]> {
  const urls = [
    'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=180',
    'https://eonet.gsfc.nasa.gov/api/v3/events?category=floods&status=all&limit=35',
    'https://eonet.gsfc.nasa.gov/api/v3/events?category=severeStorms&status=all&limit=35',
    'https://eonet.gsfc.nasa.gov/api/v3/events?category=volcanoes&status=all&limit=35',
  ];
  const settled = await Promise.allSettled(urls.map(async (u) => {
    const r = await fetch(u, { signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return (await r.json()) as { events?: EonetEvent[] };
  }));
  const seen = new Set<string>();
  const merged: EonetEvent[] = [];
  for (const s of settled) {
    if (s.status !== 'fulfilled') continue;
    for (const ev of s.value.events ?? []) {
      if (!seen.has(ev.id)) { seen.add(ev.id); merged.push(ev); }
    }
  }
  return parseEonetEvents(merged);
}

// ---------- 2. USGS Volcano Hazards Program (Aktif Volkan Uyarıları) ----------
interface VhpItem {
  vName?: string;
  lat?: number;
  long?: number;
  vnum?: string;
  vUrl?: string;
  region?: string;
  noticeSynopsis?: string;
  alertLevel?: string;
  colorCode?: string;
  alertDate?: string;
}

export async function fetchUsgsVolcanoes(timeoutMs = 8_000): Promise<DisasterEvent[]> {
  const r = await fetch('https://volcanoes.usgs.gov/vsc/api/volcanoApi/vhpstatus', { signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const arr = (await r.json()) as VhpItem[];
  const out: DisasterEvent[] = [];
  for (const v of Array.isArray(arr) ? arr : []) {
    const lvl = (v.alertLevel ?? '').toUpperCase();
    if (!['ADVISORY', 'WATCH', 'WARNING'].includes(lvl)) continue;
    if (typeof v.lat !== 'number' || typeof v.long !== 'number') continue;
    const t = safeIso(v.alertDate) ?? new Date().toISOString();
    out.push({
      id: `vhp-${v.vnum || v.vName}`,
      hazard: 'volcano',
      title: `${v.vName ?? 'Volcano'}${v.region ? ` (${v.region})` : ''}`,
      place: `${v.vName ?? 'Volcano'}${v.region ? `, ${v.region}` : ''}`,
      region: v.region ?? null,
      originTime: t,
      updatedAt: t,
      lat: v.lat,
      lon: v.long,
      severity: lvl === 'WARNING' ? 'severe' : lvl === 'WATCH' ? 'warning' : 'advisory',
      metricLabel: `${lvl}${v.colorCode ? ` · ${v.colorCode}` : ''}`,
      description: v.noticeSynopsis ?? null,
      source: 'USGS VHP',
      url: v.vUrl ?? 'https://www.usgs.gov/programs/VHP',
    });
  }
  return out;
}

// ---------- 3. Tsunami (JMA Tsunami Bültenleri + USGS Tsunami İşaretli Olaylar) ----------
interface JmaTsunamiItem {
  eid?: string;
  ctt?: string;
  at?: string;
  rdt?: string;
  cod?: string;
  mag?: string;
  anm?: string;
  en_anm?: string;
  ttl?: string;
  en_ttl?: string;
}

export async function fetchTsunamiHazards(timeoutMs = 8_000): Promise<DisasterEvent[]> {
  const out: DisasterEvent[] = [];
  const [jmaRes, usgsRes] = await Promise.allSettled([
    fetch('https://www.jma.go.jp/bosai/tsunami/data/list.json', { signal: AbortSignal.timeout(timeoutMs) }).then((r) => (r.ok ? (r.json() as Promise<JmaTsunamiItem[]>) : [])),
    fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_month.geojson', { signal: AbortSignal.timeout(timeoutMs) }).then((r) => (r.ok ? (r.json() as Promise<{ features?: { id: string; properties: { mag: number | null; place: string | null; time: number; updated: number; url: string; tsunami: number; title: string }; geometry: { coordinates: [number, number, number | null] } }[] }>) : { features: [] })),
  ]);

  if (jmaRes.status === 'fulfilled') {
    const seen = new Set<string>();
    for (const x of jmaRes.value ?? []) {
      const key = x.eid || x.ctt;
      if (!key || seen.has(key) || !x.cod) continue;
      const m = /^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/.exec(x.cod);
      const t = safeIso(x.at || x.rdt);
      if (!m || !t) continue;
      seen.add(key);
      const place = x.en_anm?.trim() || x.anm?.trim() || 'Japan';
      const label = x.en_ttl?.trim() || 'Tsunami Bulletin';
      out.push({
        id: `jma-ts-${key}`,
        hazard: 'tsunami',
        title: `${label} — ${place}`,
        place,
        region: 'Japonya',
        originTime: t,
        updatedAt: safeIso(x.rdt) ?? t,
        lat: Number(m[1]),
        lon: Number(m[2]),
        severity: /warning/i.test(label) ? 'severe' : /advisory/i.test(label) ? 'warning' : 'advisory',
        metricLabel: x.mag ? `M ${x.mag} · Tsunami` : 'Tsunami',
        description: label,
        source: 'JMA Tsunami',
        url: 'https://www.data.jma.go.jp/multi/tsunami/index.html?lang=en',
      });
    }
  }

  if (usgsRes.status === 'fulfilled') {
    for (const f of usgsRes.value.features ?? []) {
      if (f.properties?.tsunami !== 1) continue;
      const [lon, lat] = f.geometry?.coordinates ?? [NaN, NaN];
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const t = safeIso(f.properties.time);
      if (!t) continue;
      const mag = f.properties.mag;
      const place = f.properties.place ?? f.properties.title ?? 'Oceanic region';
      out.push({
        id: `usgs-ts-${f.id}`,
        hazard: 'tsunami',
        title: `Tsunami Statement — ${place}`,
        place,
        region: place.split(', ').pop() ?? null,
        originTime: t,
        updatedAt: safeIso(f.properties.updated) ?? t,
        lat,
        lon,
        severity: mag != null && mag >= 7 ? 'severe' : 'warning',
        metricLabel: mag != null ? `M ${mag.toFixed(1)} · Tsunami` : 'Tsunami',
        description: 'Tsunami information/bulletin issued following offshore seismic event (NOAA / PTWC / USGS).',
        source: 'NOAA/USGS',
        url: f.properties.url || 'https://www.tsunami.gov/',
      });
    }
  }
  return out;
}

// ---------- 4. NOAA NWS & IEM (Hortum, Ani Sel, Fırtına) ----------
interface IemFeature {
  id?: string;
  properties?: {
    typetext?: string;
    city?: string;
    county?: string;
    st?: string;
    remark?: string | null;
    valid?: string;
    lat?: number;
    lon?: number;
    magnitude?: string | number | null;
    unit?: string | null;
    source?: string;
    product_id?: string;
  };
  geometry?: { coordinates?: [number, number] };
}

export async function fetchIemAndNwsHazards(timeoutMs = 9_000): Promise<DisasterEvent[]> {
  const out: DisasterEvent[] = [];
  const [iemRes, nwsRes] = await Promise.allSettled([
    fetch('https://mesonet.agron.iastate.edu/geojson/lsr.php?hours=720', { signal: AbortSignal.timeout(timeoutMs) }).then((r) => (r.ok ? (r.json() as Promise<{ features?: IemFeature[] }>) : { features: [] })),
    fetch('https://api.weather.gov/alerts/active?event=Tornado%20Warning,Tornado%20Watch,Flash%20Flood%20Warning,Flood%20Warning,Severe%20Thunderstorm%20Warning,Tropical%20Storm%20Warning,Hurricane%20Warning,Tsunami%20Warning,Tsunami%20Advisory,Red%20Flag%20Warning', {
      signal: AbortSignal.timeout(timeoutMs),
    }).then((r) => (r.ok ? (r.json() as Promise<{ features?: { id: string; properties?: { event?: string; areaDesc?: string; sent?: string; effective?: string; severity?: string; headline?: string; description?: string }; geometry?: { coordinates?: unknown } | null }[] }>) : { features: [] })),
  ]);

  if (nwsRes.status === 'fulfilled') {
    for (const f of nwsRes.value.features ?? []) {
      const p = f.properties ?? {};
      const pt = f.geometry ? centroidOfCoords(f.geometry.coordinates) : null;
      if (!pt) continue;
      const ev = (p.event ?? '').toLowerCase();
      let hazard: NonEqHazard | null = null;
      if (ev.includes('tornado')) hazard = 'tornado';
      else if (ev.includes('tsunami')) hazard = 'tsunami';
      else if (ev.includes('flood')) hazard = 'flood';
      else if (ev.includes('fire') || ev.includes('red flag')) hazard = 'wildfire';
      else if (ev.includes('storm') || ev.includes('hurricane')) hazard = 'storm';
      if (!hazard) continue;
      const t = safeIso(p.sent || p.effective) ?? new Date().toISOString();
      const sev = (p.severity ?? '').toLowerCase();
      out.push({
        id: `nws-${String(f.id).slice(-28).replace(/[^a-zA-Z0-9_-]/g, '_')}`,
        hazard,
        title: `${p.event} — ${p.areaDesc ?? ''}`.slice(0, 140),
        place: (p.areaDesc ?? p.event ?? 'Active alert').split(';')[0]!.trim(),
        region: 'USA',
        originTime: t,
        updatedAt: t,
        lat: Math.round(pt[1] * 1e4) / 1e4,
        lon: Math.round(pt[0] * 1e4) / 1e4,
        severity: sev === 'extreme' ? 'severe' : sev === 'severe' ? 'warning' : 'watch',
        metricLabel: p.event ?? null,
        description: p.headline ?? (p.description ? p.description.slice(0, 280) : null),
        source: 'NOAA NWS',
        url: 'https://www.weather.gov/',
      });
    }
  }

  if (iemRes.status === 'fulfilled') {
    const feats = [...(iemRes.value.features ?? [])].sort((a, b) => String(b.properties?.valid ?? '').localeCompare(String(a.properties?.valid ?? '')));
    let floodCount = 0, stormCount = 0, tornadoCount = 0;
    const seenLoc = new Set<string>();
    for (const f of feats) {
      const p = f.properties ?? {};
      const tt = (p.typetext ?? '').toUpperCase();
      let hazard: NonEqHazard | null = null;
      if (tt === 'TORNADO' || tt === 'WATERSPOUT' || tt === 'FUNNEL CLOUD') {
        if (tornadoCount >= 60) continue;
        hazard = 'tornado';
      } else if (tt === 'FLASH FLOOD' || tt === 'FLOOD' || tt === 'COASTAL FLOOD') {
        if (floodCount >= 40) continue;
        hazard = 'flood';
      } else if (tt === 'TSTM WND DMG' || tt === 'TSTM WND GST' || tt === 'MARINE TSTM WIND' || tt === 'NON-TSTM WND DMG') {
        if (stormCount >= 40) continue;
        hazard = 'storm';
      }
      if (!hazard) continue;
      const lat = p.lat ?? f.geometry?.coordinates?.[1];
      const lon = p.lon ?? f.geometry?.coordinates?.[0];
      const t = safeIso(p.valid);
      if (typeof lat !== 'number' || typeof lon !== 'number' || !t) continue;
      const dedup = `${hazard}:${t.slice(0, 13)}:${lat.toFixed(1)}:${lon.toFixed(1)}`;
      if (seenLoc.has(dedup)) continue;
      seenLoc.add(dedup);
      if (hazard === 'tornado') tornadoCount++;
      else if (hazard === 'flood') floodCount++;
      else stormCount++;

      const efMatch = p.remark ? /\b(EF[0-5])\b/i.exec(p.remark) : null;
      const magStr = p.magnitude !== null && p.magnitude !== undefined && String(p.magnitude).trim() !== ''
        ? `${p.magnitude}${p.unit ? ' ' + p.unit : ' mph'}`
        : null;
      const metricLabel = efMatch ? efMatch[1]!.toUpperCase() : magStr ?? (tt === 'WATERSPOUT' ? 'Waterspout' : tt === 'FUNNEL CLOUD' ? 'Funnel' : null);
      const where = [p.city, p.county ? `${p.county} Co.` : '', p.st].filter(Boolean).join(', ');
      out.push({
        id: `iem-${hazard}-${p.product_id ?? ''}-${lat.toFixed(2)}-${lon.toFixed(2)}`.replace(/[^a-zA-Z0-9_-]/g, '_'),
        hazard,
        title: `${tt} — ${where}`,
        place: where || tt,
        region: p.st ? `${p.st} (USA)` : 'USA',
        originTime: t,
        updatedAt: t,
        lat,
        lon,
        severity: efMatch || tt === 'TORNADO' || tt === 'FLASH FLOOD' ? 'severe' : 'warning',
        metricLabel,
        description: p.remark ?? (p.source ? `Reported by ${p.source}` : null),
        source: 'NOAA/IEM',
        url: 'https://www.spc.noaa.gov/climo/reports/',
      });
    }
  }
  return out;
}

// ---------- 5. GDACS RSS (BM / AB Küresel Afet Uyarı Sistemi — Sunucu tarafı) ----------
function xmlTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = re.exec(block);
  return m ? m[1]!.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim() : '';
}

export function parseGdacsRss(xml: string): DisasterEvent[] {
  const out: DisasterEvent[] = [];
  const items = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];
  for (const item of items) {
    const evType = xmlTag(item, 'gdacs:eventtype').toUpperCase();
    let hazard: NonEqHazard | null = null;
    if (evType === 'FL') hazard = 'flood';
    else if (evType === 'TC') hazard = 'storm';
    else if (evType === 'WF') hazard = 'wildfire';
    else if (evType === 'VO') hazard = 'volcano';
    else if (evType === 'TS') hazard = 'tsunami';
    if (!hazard) continue;
    const lat = Number(xmlTag(item, 'geo:lat'));
    const lon = Number(xmlTag(item, 'geo:long'));
    const t = safeIso(xmlTag(item, 'gdacs:fromdate') || xmlTag(item, 'pubDate'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !t) continue;
    const guid = xmlTag(item, 'guid') || `${evType}-${lat.toFixed(2)}-${lon.toFixed(2)}`;
    const alertLvl = xmlTag(item, 'gdacs:alertlevel').toLowerCase();
    const country = xmlTag(item, 'gdacs:country') || null;
    const title = xmlTag(item, 'title') || `${evType} — ${country ?? ''}`;
    const sevText = xmlTag(item, 'gdacs:severity');
    const link = xmlTag(item, 'link') || 'https://www.gdacs.org/';
    out.push({
      id: `gdacs-${guid.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
      hazard,
      title,
      place: country ? `${country} · ${title.replace(/^(Green|Orange|Red)\s+/i, '').slice(0, 70)}` : title,
      region: country,
      originTime: t,
      updatedAt: safeIso(xmlTag(item, 'gdacs:datemodified')) ?? t,
      lat: Math.round(lat * 1e4) / 1e4,
      lon: Math.round(lon * 1e4) / 1e4,
      severity: alertLvl === 'red' ? 'severe' : alertLvl === 'orange' ? 'warning' : 'advisory',
      metricLabel: alertLvl ? `GDACS ${alertLvl.toUpperCase()}` : (sevText ? sevText.slice(0, 24) : null),
      description: xmlTag(item, 'description') || sevText || null,
      source: 'GDACS',
      url: link.replace(/^http:\/\//i, 'https://'),
    });
  }
  return out;
}

export async function fetchGdacsHazards(timeoutMs = 9_000): Promise<DisasterEvent[]> {
  const r = await fetch('https://www.gdacs.org/xml/rss.xml', { signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return parseGdacsRss(await r.text());
}

/** Tüm deprem dışı afet kaynaklarını paralel çeker, yakın koordinat/zaman kopyalarını tekilleştirir. */
export async function fetchAllMultiHazards(opts: { includeGdacs?: boolean } = {}): Promise<DisasterEvent[]> {
  const tasks: Promise<DisasterEvent[]>[] = [
    fetchEonetHazards(),
    fetchUsgsVolcanoes(),
    fetchTsunamiHazards(),
    fetchIemAndNwsHazards(),
  ];
  if (opts.includeGdacs) tasks.push(fetchGdacsHazards());
  const settled = await Promise.allSettled(tasks);
  const all = settled.flatMap((x) => (x.status === 'fulfilled' ? x.value : []));
  all.sort((a, b) => b.originTime.localeCompare(a.originTime));

  // Aynı afet türü ve aynı ~25 km kutuda aynı gün içinde hem EONET hem GDACS kaydı varsa tekilleştir
  const deduped: DisasterEvent[] = [];
  const seenGrid = new Set<string>();
  for (const ev of all) {
    const day = ev.originTime.slice(0, 10);
    const gridKey = `${ev.hazard}:${day}:${Math.round(ev.lat * 4)}:${Math.round(ev.lon * 4)}`;
    if (seenGrid.has(gridKey)) continue;
    seenGrid.add(gridKey);
    deduped.push(ev);
  }
  return deduped;
}
