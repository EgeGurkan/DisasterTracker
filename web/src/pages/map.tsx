import { useEffect, useRef, useState } from 'preact/hooks';
import L from 'leaflet';
import type { DisasterEvent, ThemeMode } from '../../../shared/src/types.ts';
import { isActiveLocationUsable, placeName } from '../../../shared/src/match.ts';
import {
  DisasterDetail, disastersUrl, eventsUrl, EventDetail, FilterBar, filterDisastersByRegion,
  filterEventsByCountry, hazardMeta, useWide, type DisastersResp, type ListEvent,
} from './events.tsx';
import { getCountry } from '../countries.ts';
import { Icon } from '../icons.tsx';
import { go, type Route } from '../router.ts';
import { getState, useAppState } from '../state.ts';
import { Ext, Notice, RefreshButton, Sheet, toast, useFetch } from '../ui.tsx';
import { currentLabel, feltRadiusKm, measureActiveLocation } from '../geo.ts';
import { fmtDateTime, fmtDec, fmtKm, fmtMag, fmtTime, getMagClass, lang, tx } from '../i18n.ts';
import type { FaultFeature } from '../../../server/src/sources/adapters.ts';

const MAG_COLOR: Record<string, string> = { minor: '#2E8B57', light: '#8DA300', moderate: '#E59400', strong: '#E5532B', major: '#C62828', unknown: '#7A869A' };
const HAZARD_COLOR: Record<DisasterEvent['hazard'], string> = {
  flood: '#0288D1',
  storm: '#3949AB',
  tornado: '#8E24AA',
  wildfire: '#EF6C00',
  volcano: '#C62828',
  tsunami: '#00ACC1',
};

const ESRI_LIGHT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
const ESRI_DARK_BASE = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
const ESRI_DARK_LABELS = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}';

export function isDarkTheme(theme: ThemeMode = getState().theme): boolean {
  if (theme === 'dark' || theme === 'amoled') return true;
  if (theme === 'light') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

/**
 * Esri World Street / Dark Gray Canvas karoları: API anahtarı istemez, filigran içermez ve
 * file://, localhost ve https:// (GitHub Pages) ortamlarının tümünde 403 vermeden çalışır.
 */
export function tileLayer(theme: ThemeMode = getState().theme): L.LayerGroup {
  const dark = isDarkTheme(theme);
  const group = L.layerGroup();
  L.tileLayer(dark ? ESRI_DARK_BASE : ESRI_LIGHT, {
    maxZoom: 18,
    attribution: '© Esri, HERE, Garmin, OpenStreetMap',
  }).addTo(group);
  if (dark) {
    L.tileLayer(ESRI_DARK_LABELS, {
      maxZoom: 18,
      pane: 'tilePane',
    }).addTo(group);
  }
  return group;
}

interface Layers { events: boolean; felt: boolean; faults: boolean; mine: boolean; stations: boolean }
const LAYER_KEY = 'afet:layers';
function loadLayers(): Layers {
  const d: Layers = { events: true, felt: true, faults: true, mine: true, stations: false };
  try { return { ...d, ...(JSON.parse(localStorage.getItem(LAYER_KEY) ?? '{}') as Partial<Layers>) }; } catch { return d; }
}

export function MapPage({ r }: { r: Route }) {
  const s = useAppState();
  const l = lang();
  const hazard = s.filters.hazard ?? 'all';
  const needEq = hazard === 'all' || hazard === 'earthquake';
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const baseTile = useRef<L.LayerGroup | null>(null);
  const groups = useRef<(Record<keyof Layers, L.LayerGroup> & { hazards: L.LayerGroup }) | null>(null);
  const [layers, setLayersState] = useState<Layers>(loadLayers);
  const [layersOpen, setLayersOpen] = useState(false);
  const selectedEq = r.query.get('olay');
  const selectedDis = r.query.get('afet');

  const eqFetch = useFetch<{ events: ListEvent[] }>(needEq ? eventsUrl(s.filters, s.env === 'drill') : null, [s.lang], 30_000);
  const disFetch = useFetch<DisastersResp>(disastersUrl(hazard), [s.lang], 120_000);
  const { data: st } = useFetch<{ stations: { network: string; station: string; lat: number; lon: number; siteName: string }[]; source: string }>(layers.stations ? '/api/stations' : null);
  const { data: fl } = useFetch<{ faults: FaultFeature[]; source: string }>(layers.faults ? '/api/faults' : null);
  const wide = useWide();
  const setLayers = (next: Layers) => { setLayersState(next); try { localStorage.setItem(LAYER_KEY, JSON.stringify(next)); } catch { /* yoksay */ } };

  const reloadAll = () => {
    if (needEq) eqFetch.reload();
    if (hazard !== 'earthquake') disFetch.reload();
  };

  useEffect(() => {
    const onMore = () => eqFetch.reload();
    window.addEventListener('afet-standalone-more', onMore);
    return () => window.removeEventListener('afet-standalone-more', onMore);
  }, [eqFetch.reload]);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: false, worldCopyJump: true, preferCanvas: true }).setView([39.0, 35.0], 5);
    const tl = tileLayer(s.theme).addTo(m);
    baseTile.current = tl;
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(m);
    groups.current = {
      faults: L.layerGroup().addTo(m),
      felt: L.layerGroup().addTo(m),
      mine: L.layerGroup().addTo(m),
      stations: L.layerGroup(),
      events: L.layerGroup().addTo(m),
      hazards: L.layerGroup().addTo(m),
    };
    map.current = m;
    return () => { m.remove(); map.current = null; baseTile.current = null; };
  }, []);

  useEffect(() => {
    if (!map.current) return;
    baseTile.current?.remove();
    baseTile.current = tileLayer(s.theme).addTo(map.current);
  }, [s.theme]);

  // Seçili ülke veya küresel afet türüne göre haritayı uygun görünüme getir
  useEffect(() => {
    if (!map.current || selectedEq || selectedDis) return;
    if (hazard !== 'all' && hazard !== 'earthquake' && s.filters.region === 'world') {
      map.current.setView([24, 15], 2);
    } else if (s.filters.region === 'country') {
      const [lat, lon, z] = getCountry(s.filters.country).center;
      map.current.setView([lat, lon], z);
    } else {
      map.current.setView([22, 18], 2);
    }
  }, [hazard, s.filters.region, s.filters.country]);

  const eqFiltered = needEq && eqFetch.data ? filterEventsByCountry(eqFetch.data.events, s.filters) : [];

  useEffect(() => {
    const g = groups.current;
    if (!g || !map.current) return;
    g.events.clearLayers();
    g.felt.clearLayers();
    if (needEq) {
      const evs = [...eqFiltered].sort((a, b) => (a.magnitude ?? 0) - (b.magnitude ?? 0));
      for (const e of evs) {
        const c = getMagClass(e.magnitude);
        const color = MAG_COLOR[c.key]!;
        const isSel = e.id === selectedEq;
        const fr = feltRadiusKm(e.magnitude);
        if (fr != null) {
          L.circle([e.lat, e.lon], {
            radius: fr * 1000, color, weight: isSel ? 2 : 1, opacity: isSel ? 0.9 : 0.35,
            fillColor: color, fillOpacity: isSel ? 0.2 : 0.08, interactive: false, dashArray: e.isTest ? '6 4' : undefined,
          }).addTo(g.felt);
        }
        const radius = e.magnitude == null ? 4 : Math.max(4, 2 + e.magnitude * 2.6);
        const mk = L.circleMarker([e.lat, e.lon], {
          radius, color: isSel ? '#0A6F78' : '#ffffff', weight: isSel ? 4 : 1.5,
          fillColor: color, fillOpacity: 0.95, dashArray: e.isTest ? '4 3' : undefined,
        });
        mk.bindTooltip(`${fmtMag(e.magnitude, e.magType)} · ${c.label} · ${e.place} · ${fmtTime(e.originTime)}${fr ? ` · ${tx('hissedilme', 'felt')} ~${fmtKm(fr)}` : ''}`);
        mk.on('click', () => go(`/harita?olay=${encodeURIComponent(e.id)}`));
        mk.addTo(g.events);
      }
      if (selectedEq) {
        const e = eqFiltered.find((x) => x.id === selectedEq) ?? eqFetch.data?.events.find((x) => x.id === selectedEq);
        if (e) map.current.setView([e.lat, e.lon], Math.max(map.current.getZoom(), 7));
      }
    }
  }, [needEq, eqFetch.data, s.filters.region, s.filters.country, selectedEq, s.lang]);

  const disFiltered = hazard !== 'earthquake' && disFetch.data
    ? filterDisastersByRegion(disFetch.data.disasters, s.filters.region, s.filters.country, hazard === 'all').list
    : [];

  useEffect(() => {
    const g = groups.current;
    if (!g || !map.current) return;
    g.hazards.clearLayers();
    if (hazard !== 'earthquake') {
      for (const d of disFiltered) {
        const hm = hazardMeta(d.hazard);
        const color = HAZARD_COLOR[d.hazard] ?? hm.color;
        const isSel = d.id === selectedDis;
        const mk = L.circleMarker([d.lat, d.lon], {
          radius: isSel ? 11 : d.severity === 'severe' ? 8.5 : 7,
          color: isSel ? '#0A6F78' : '#ffffff',
          weight: isSel ? 4 : 2,
          fillColor: color,
          fillOpacity: 0.95,
        });
        mk.bindTooltip(`${hm.label} · ${d.title}${d.metricLabel ? ` (${d.metricLabel})` : ''} · ${fmtDateTime(d.originTime)}`);
        mk.on('click', () => go(`/harita?afet=${encodeURIComponent(d.id)}`));
        mk.addTo(g.hazards);
      }
      if (selectedDis) {
        const found = disFetch.data?.disasters.find((x) => x.id === selectedDis);
        if (found) map.current.setView([found.lat, found.lon], Math.max(map.current.getZoom(), 6));
      }
    }
  }, [hazard, disFetch.data, s.filters.region, s.filters.country, selectedDis, s.lang]);

  useEffect(() => {
    const g = groups.current;
    if (!g) return;
    g.faults.clearLayers();
    for (const f of fl?.faults ?? []) {
      const label = [f.name || tx('Diri fay hattı', 'Active fault line'), f.slipType, f.catalog].filter(Boolean).join(' · ');
      for (const line of f.lines) {
        L.polyline(line, { color: '#D84315', weight: 1.7, opacity: 0.72 })
          .bindTooltip(label)
          .addTo(g.faults);
      }
    }
  }, [fl, s.lang]);

  useEffect(() => {
    const g = groups.current;
    if (!g) return;
    g.mine.clearLayers();
    const p = s.prefs;
    for (const loc of p.saved) {
      L.circle([loc.lat, loc.lon], { radius: loc.radiusKm * 1000, color: '#0A6F78', weight: 1.5, fillOpacity: 0, dashArray: loc.enabled ? '2 6' : '6 6', interactive: false }).addTo(g.mine);
      L.circleMarker([loc.lat, loc.lon], { radius: 8, color: '#fff', weight: 3, fillColor: '#0A6F78', fillOpacity: 1 })
        .bindTooltip(`${placeName(loc.label, loc.place, l)} — ${loc.enabled ? `${tx('bildirim açık', 'alerts on')}, ${loc.radiusKm} km, M ${fmtDec(loc.minMag)}+` : tx('bildirim kapalı', 'alerts off')}`).addTo(g.mine);
    }
    if (isActiveLocationUsable(p.active, Date.now())) {
      L.circle([p.active.lat!, p.active.lon!], { radius: p.active.radiusKm * 1000, color: '#1F5BD6', weight: 1.5, fillOpacity: 0, dashArray: '2 6', interactive: false }).addTo(g.mine);
      L.circleMarker([p.active.lat!, p.active.lon!], { radius: 8, color: '#fff', weight: 3, fillColor: '#1F5BD6', fillOpacity: 1 })
        .bindTooltip(`${currentLabel()} (${tx('ölçüm', 'measured')} ${fmtTime(p.active.measuredAt!)})`).addTo(g.mine);
    }
  }, [s.prefs, s.lang]);

  useEffect(() => {
    const g = groups.current;
    if (!g) return;
    g.stations.clearLayers();
    for (const x of st?.stations ?? []) {
      L.circleMarker([x.lat, x.lon], { radius: 4, color: '#5B3FA8', weight: 2, fillColor: '#fff', fillOpacity: 1 })
        .bindTooltip(`${x.network}.${x.station}${x.siteName ? ' · ' + x.siteName : ''}`).addTo(g.stations);
    }
  }, [st]);

  useEffect(() => {
    const g = groups.current, m = map.current;
    if (!g || !m) return;
    for (const k of ['faults', 'felt', 'mine', 'stations', 'events'] as const) {
      if (layers[k] && !m.hasLayer(g[k])) g[k].addTo(m);
      if (!layers[k] && m.hasLayer(g[k])) m.removeLayer(g[k]);
    }
    if (layers.events && !m.hasLayer(g.hazards)) g.hazards.addTo(m);
    if (!layers.events && m.hasLayer(g.hazards)) m.removeLayer(g.hazards);
    g.events.eachLayer((x) => (x as L.CircleMarker).bringToFront?.());
    g.hazards.eachLayer((x) => (x as L.CircleMarker).bringToFront?.());
  }, [layers]);

  const hasSelection = !!(selectedEq || selectedDis);
  useEffect(() => { setTimeout(() => map.current?.invalidateSize(), 50); }, [wide, hasSelection]);

  const goMe = async () => {
    const res = await measureActiveLocation();
    const a = getState().prefs.active;
    if (res.ok && a.lat != null) map.current?.setView([a.lat, a.lon!], 8);
    else toast(res.message);
  };

  const totalShown = eqFiltered.length + disFiltered.length;
  const selItem = selectedDis ? disFetch.data?.disasters.find((x) => x.id === selectedDis) ?? null : null;
  const detailNode = selectedEq
    ? <EventDetail id={selectedEq} r={r} />
    : selectedDis
      ? <DisasterDetail id={selectedDis} item={selItem} />
      : null;

  return (
    <div class={wide && hasSelection ? 'split' : ''}>
      <div>
        <FilterBar right={<a class="btn sm" href="#/afetler" aria-label={tx('Liste görünümü', 'List view')}><Icon name="menu" /><span class="hide-sm">{tx('Liste', 'List')}</span></a>} />
        <div class="map-wrap">
          <div ref={el} class="map map-full" role="region" aria-label={tx('Afet haritası. Aynı bilgiler Afetler listesinde metin olarak da var.', 'Disaster map. The same information is available as text in the Disasters list.')} />
          <div class="map-fabs">
            <RefreshButton loading={eqFetch.loading || disFetch.loading} onClick={reloadAll} />
            <button class="btn sm" onClick={() => void goMe()} aria-label={tx('Mevcut konumuma git', 'Go to my location')}><Icon name="locate" /></button>
            <button class="btn sm" onClick={() => setLayersOpen(true)} aria-label={tx('Katmanlar ve harita bilgileri', 'Layers and map info')} aria-haspopup="dialog"><Icon name="layers" /></button>
          </div>
          <div class="map-legend" aria-hidden="true">
            {needEq && <>
              <span><i style="background:#2E8B57" />&lt;3</span><span><i style="background:#8DA300" />3–4</span><span><i style="background:#E59400" />4–5</span><span><i style="background:#E5532B" />5–6</span><span><i style="background:#C62828" />6+</span>
              {layers.felt && <span class="felt-key"><i class="ring" />{tx('hissedilme', 'felt area')}</span>}
            </>}
            {hazard !== 'earthquake' && <>
              <span><i style="background:#0288D1" />{tx('sel', 'flood')}</span>
              <span><i style="background:#3949AB" />{tx('fırtına', 'storm')}</span>
              <span><i style="background:#8E24AA" />{tx('hortum', 'tornado')}</span>
              <span><i style="background:#EF6C00" />{tx('yangın', 'wildfire')}</span>
              <span><i style="background:#C62828" />{tx('volkan', 'volcano')}</span>
              <span><i style="background:#00ACC1" />tsunami</span>
            </>}
            {layers.faults && <span><i style="background:#D84315;width:14px;height:3px;border-radius:2px" />{tx('diri fay', 'fault')}</span>}
          </div>
        </div>
        <p class="small muted" style="margin:6px 4px 0">
          {`${totalShown} ${tx('afet kaydı. ', 'disaster events. ')}`}
          {tx('Deprem, sel, fırtına, hortum, yangın, volkan ve tsunami olaylarını Filtre menüsünden seçebilirsin.', 'Choose earthquakes, floods, storms, tornadoes, wildfires, volcanoes, and tsunamis from the Filter menu.')}
        </p>
      </div>
      {layersOpen && (
        <Sheet title={tx('Katmanlar', 'Layers')} onClose={() => setLayersOpen(false)}>
          <div class="layer-list">
            <label><input type="checkbox" checked={layers.events} onChange={(e) => setLayers({ ...layers, events: (e.target as HTMLInputElement).checked })} /> {tx('Afet noktaları ve merkez üsleri', 'Disaster markers & epicenters')}</label>
            <label><input type="checkbox" checked={layers.felt} onChange={(e) => setLayers({ ...layers, felt: (e.target as HTMLInputElement).checked })} /> {tx('Tahmini hissedilme alanı (yarı saydam çember)', 'Estimated felt area (semi-transparent circle)')}</label>
            <label><input type="checkbox" checked={layers.faults} onChange={(e) => setLayers({ ...layers, faults: (e.target as HTMLInputElement).checked })} /> {tx('Diri faylar (MTA / GEM Küresel Diri Faylar)', 'Active faults (MTA / GEM Global Active Faults)')}</label>
            <label><input type="checkbox" checked={layers.mine} onChange={(e) => setLayers({ ...layers, mine: (e.target as HTMLInputElement).checked })} /> {tx('Konumlarım ve bildirim yarıçapları', 'My locations and alert radii')}</label>
            <label><input type="checkbox" checked={layers.stations} onChange={(e) => setLayers({ ...layers, stations: (e.target as HTMLInputElement).checked })} /> {tx('Sismik istasyonlar (GEOFON, KOERI, NOA, INGV)', 'Seismic stations (GEOFON, KOERI, NOA, INGV)')}</label>
          </div>
          <p class="small muted" style="margin:6px 0 14px">
            {tx(
              'Hissedilme alanı büyüklükten hesaplanan yaklaşık bir yarıçaptır (M 3 ≈ 20 km, M 5 ≈ 125 km, M 7 ≈ 800 km). Gerçek sarsıntı derinliğe, zemine ve uzaklığa göre değişir.',
              'Estimated felt area is an approximate radius derived from magnitude (M 3 ≈ 20 km, M 5 ≈ 125 km, M 7 ≈ 800 km). Actual shaking varies by depth, soil, and distance.',
            )}
          </p>
          <div class="stack">
            <Notice kind="teal" icon="check"><strong>{tx('Diri fay katmanı:', 'Active faults layer:')}</strong> {tx('GEM / EMME & MTA derlemesi haritada etkindir.', 'GEM / EMME & MTA compilation is active on the map.')} <Ext href="https://yerbilimleri.mta.gov.tr/Default.aspx">{tx('MTA görüntüleyicisi', 'MTA viewer')}</Ext></Notice>
            <Notice icon="ext"><strong>{tx('Zemin / mikrobölgeleme:', 'Ground / microzonation:')}</strong> <Ext href="https://depremzemin.ibb.istanbul/tr/istanbul-ili-mikrobolgeleme-projeleri">{tx('İBB mikrobölgeleme', 'IMM microzonation')}</Ext></Notice>
            <Notice icon="ext"><strong>{tx('Deprem tehlikesi:', 'Seismic hazard:')}</strong> <Ext href="https://tdth.afad.gov.tr/TDTH/loginControl.xhtml">{tx('AFAD tehlike haritası', 'AFAD hazard map')}</Ext></Notice>
            <Notice icon="users"><strong>{tx('Toplanma alanları:', 'Assembly areas:')}</strong> <Ext href="https://www.turkiye.gov.tr/afet-ve-acil-durum-yonetimi-acil-toplanma-alani-sorgulama">{tx('e-Devlet sorgusu', 'e-Devlet lookup')}</Ext></Notice>
          </div>
        </Sheet>
      )}
      {detailNode && (wide
        ? <aside class="detail-pane" aria-label={tx('Afet ayrıntısı', 'Disaster details')}>{detailNode}</aside>
        : <Sheet title={tx('Afet ayrıntısı', 'Disaster details')} onClose={() => go('/harita')}>{detailNode}</Sheet>)}
    </div>
  );
}
