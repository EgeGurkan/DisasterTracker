import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { DisasterEvent, EventSummary, HazardFilter, MatchReason } from '../../../shared/src/types.ts';
import { reasonExplain, reasonLabel, isActiveLocationUsable } from '../../../shared/src/match.ts';
import { haversineKm } from '../../../shared/src/geo.ts';
import { api, ApiError } from '../api.ts';
import { COUNTRIES, countryLabel, inCountryBounds } from '../countries.ts';
import { distanceTo, feltRadiusKm, getRefId, refPoints, type RefPoint } from '../geo.ts';
import { Icon } from '../icons.tsx';
import { go, type Route } from '../router.ts';
import { setState, useAppState, type Filters } from '../state.ts';
import { Ext, fmtMs, MagBadge, Notice, PullToRefresh, RefreshButton, Sheet, toast, useFetch } from '../ui.tsx';
import { STANDALONE } from '../standalone.ts';
import { fmtDateTime, fmtDepth, fmtKm, fmtMag, fmtNum, fmtRel, fmtTime, lang, tx } from '../i18n.ts';

export interface ListEvent extends EventSummary { sources: string[]; updatedAt: string }
interface EventsResp { events: ListEvent[]; sources: { source: string; last_success_at: string | null; status: string }[]; generatedAt: string; __offline?: boolean }
export interface DisastersResp { disasters: DisasterEvent[]; generatedAt: string; error?: string; __offline?: boolean }

export function hazardDefs(): { key: HazardFilter; label: string; icon: string; color: string }[] {
  return [
    { key: 'all', label: tx('Tüm afetler', 'All hazards'), icon: 'layers', color: '#0A6F78' },
    { key: 'earthquake', label: tx('Deprem', 'Earthquake'), icon: 'quake', color: '#E59400' },
    { key: 'flood', label: tx('Sel', 'Flood'), icon: 'flood', color: '#0288D1' },
    { key: 'storm', label: tx('Fırtına', 'Storm'), icon: 'storm', color: '#3949AB' },
    { key: 'tornado', label: tx('Hortum', 'Tornado'), icon: 'tornado', color: '#8E24AA' },
    { key: 'wildfire', label: tx('Yangın', 'Wildfire'), icon: 'fire', color: '#EF6C00' },
    { key: 'volcano', label: tx('Volkan', 'Volcano'), icon: 'volcano', color: '#C62828' },
    { key: 'tsunami', label: tx('Tsunami', 'Tsunami'), icon: 'tsunami', color: '#00838F' },
  ];
}

export function hazardMeta(h: DisasterEvent['hazard']): { label: string; icon: string; color: string } {
  const found = hazardDefs().find((x) => x.key === h);
  return found ?? { label: h, icon: 'alert', color: '#E59400' };
}

export function HazardBadge({ hazard, size }: { hazard: DisasterEvent['hazard']; size?: 'lg' }) {
  const m = hazardMeta(hazard);
  return (
    <div class={`haz-badge ${hazard} ${size ?? ''}`} role="img" aria-label={m.label}>
      <Icon name={m.icon} />
      <small aria-hidden="true">{m.label}</small>
    </div>
  );
}

export function eventsUrl(f: Filters, includeTest: boolean): string {
  const apiRegion = f.region === 'country' && (f.country || 'TR') === 'TR' ? 'tr' : 'all';
  const q = new URLSearchParams({ region: apiRegion, hours: String(f.hours), minMag: String(f.minMag), limit: '400' });
  if (f.source) q.set('source', f.source);
  if (includeTest) q.set('test', '1');
  return `/api/events?${q}`;
}

export function filterEventsByCountry(events: ListEvent[], f: Filters): ListEvent[] {
  if (f.region !== 'country' || (f.country || 'TR') === 'TR') return events;
  return events.filter((e) => inCountryBounds(e.lat, e.lon, f.country, e.place));
}

export function disastersUrl(hazard: HazardFilter): string | null {
  if (hazard === 'earthquake') return null;
  const q = new URLSearchParams({ hazard: hazard === 'all' ? 'all' : hazard });
  return `/api/disasters?${q}`;
}

function hourOptions(): [number, string][] {
  return [
    [1, tx('Son 1 saat', 'Last 1 hour')],
    [24, tx('Son 24 saat', 'Last 24 hours')],
    [168, tx('Son 7 gün', 'Last 7 days')],
    [720, tx('Son 30 gün', 'Last 30 days')],
  ];
}

function sourceOptions(): [string, string][] {
  return [
    ['', tx('Tümü', 'All')],
    ['AFAD', 'AFAD'],
    ['KOERI', tx('Kandilli (KOERI)', 'KOERI (Kandilli)')],
    ['EMSC', 'EMSC'],
    ['USGS', 'USGS'],
    ['NOA', 'NOA'],
    ['GEOFON', 'GEOFON'],
    ['INGV', 'INGV'],
    ['JMA', 'JMA'],
    ['GEONET', 'GeoNet'],
  ];
}

function filterSummary(f: Filters): string {
  const hDef = hazardDefs().find((x) => x.key === (f.hazard ?? 'all'));
  const parts: string[] = [];
  if (hDef && hDef.key !== 'all') parts.push(hDef.label);
  if (f.hazard === 'all' || f.hazard === 'earthquake') {
    parts.push(hourOptions().find(([h]) => h === f.hours)?.[1] ?? `${f.hours}h`);
    if (f.minMag) parts.push(`M ${f.minMag}+`);
    if (f.source) parts.push(f.source);
  } else {
    parts.push(tx('Aktif ve son kayıtlar', 'Active & recent events'));
  }
  return parts.join(' · ');
}

/** Liste ve haritada ortak filtre: Dünya / Ülke seçici (basılı tutarak ülke değiştir) + Filtreler paneli. */
export function FilterBar({ right, status }: { right?: ComponentChildren; status?: ComponentChildren }) {
  const s = useAppState();
  const f = s.filters;
  const [open, setOpen] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);
  const [countryQuery, setCountryQuery] = useState('');
  const holdTimer = useRef<number | null>(null);
  const heldRef = useRef(false);

  const set = (p: Partial<Filters>) => setState((x) => ({ filters: { ...x.filters, ...p } }));
  const hazard = f.hazard ?? 'all';
  const showEqFilters = hazard === 'all' || hazard === 'earthquake';
  const active = (hazard !== 'all' ? 1 : 0) + (showEqFilters ? (f.hours !== 24 ? 1 : 0) + (f.minMag ? 1 : 0) + (f.source ? 1 : 0) : 0);
  const cLabel = countryLabel(f.country, s.lang);

  const startHold = () => {
    heldRef.current = false;
    if (holdTimer.current) window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => {
      heldRef.current = true;
      holdTimer.current = null;
      navigator.vibrate?.(16);
      setCountryQuery('');
      setCountryOpen(true);
    }, 450);
  };
  const cancelHold = () => {
    if (holdTimer.current) { window.clearTimeout(holdTimer.current); holdTimer.current = null; }
  };

  const filteredCountries = useMemo(() => {
    const q = countryQuery.trim().toLocaleLowerCase(s.lang === 'tr' ? 'tr' : 'en');
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) =>
      c.tr.toLocaleLowerCase('tr').includes(q)
      || c.en.toLowerCase().includes(q)
      || c.code.toLowerCase() === q,
    );
  }, [countryQuery, s.lang]);

  return (
    <>
      <div class="toolbar" role="group" aria-label={tx('Filtreler (liste ve haritada ortak)', 'Filters (shared between list and map)')}>
        <div class={`seg region-seg ${f.region === 'world' ? 'is-world' : ''}`} role="group" aria-label={tx('Bölge', 'Region')}>
          <button type="button" aria-pressed={f.region === 'world'} onClick={() => set({ region: 'world' })}
            title={tx(`Dünya (${cLabel} dahil)`, `World (includes ${cLabel})`)}>
            <Icon name="globe" /><span>{tx('Dünya', 'World')}</span>
          </button>
          <button
            type="button"
            class={`country-seg ${f.region === 'world' ? 'included' : ''}`}
            aria-pressed={f.region === 'country'}
            title={tx('Başka ülke seçmek için basılı tut', 'Hold to choose another country')}
            aria-label={`${cLabel}. ${tx('Başka ülke seçmek için basılı tut', 'Hold to choose another country')}`}
            onPointerDown={startHold}
            onPointerUp={cancelHold}
            onPointerLeave={cancelHold}
            onPointerCancel={cancelHold}
            onContextMenu={(e) => { e.preventDefault(); cancelHold(); setCountryQuery(''); setCountryOpen(true); }}
            onClick={() => {
              if (heldRef.current) { heldRef.current = false; return; }
              set({ region: 'country' });
            }}
          >
            <span>{cLabel}</span>
            <span class="seg-caret" aria-hidden="true">▾</span>
          </button>
        </div>
        <button type="button" class="btn sm filter-btn" onClick={() => setOpen(true)} aria-label={`${tx('Filtreler', 'Filters')}: ${filterSummary(f)}`}>
          <Icon name={hazardDefs().find((h) => h.key === hazard)?.icon ?? 'layers'} />
          <span>{hazard === 'all' ? tx('Filtre', 'Filter') : hazardDefs().find((h) => h.key === hazard)?.label}</span>
          {active > 0 && <span class="count">{active}</span>}
        </button>
        <span class="spacer" />
        {right}
      </div>
      <p class="status-line" aria-live="polite">
        <span>{filterSummary(f)}</span>
        {status && <><span aria-hidden="true">·</span>{status}</>}
      </p>
      {open && (
        <Sheet title={tx('Filtreler', 'Filters')} onClose={() => setOpen(false)}>
          <div class="field">
            <span class="label">{tx('Afet Türü', 'Disaster Type')}</span>
            <div class="chips" style="flex-wrap:wrap">
              {hazardDefs().map((h) => (
                <button
                  key={h.key}
                  type="button"
                  class="chip"
                  aria-pressed={hazard === h.key}
                  onClick={() => set({ hazard: h.key })}
                >
                  <Icon name={h.icon} />
                  <span>{h.label}</span>
                </button>
              ))}
            </div>
          </div>
          {showEqFilters && (
            <>
              <div class="field"><span class="label">{tx('Zaman', 'Time range')}</span>
                <div class="chips" style="flex-wrap:wrap">{hourOptions().map(([h, l]) => <button key={h} type="button" class="chip" aria-pressed={f.hours === h} onClick={() => set({ hours: h })}>{l}</button>)}</div>
              </div>
              <div class="field"><span class="label">{tx('Büyüklük (Deprem)', 'Magnitude (Earthquake)')}</span>
                <div class="chips" style="flex-wrap:wrap">{[0, 2, 3, 4, 5].map((m) => <button key={m} type="button" class="chip" aria-pressed={f.minMag === m} onClick={() => set({ minMag: m })}>{m === 0 ? tx('Tümü', 'All') : `M ${m}+`}</button>)}</div>
              </div>
              <div class="field"><span class="label">{tx('Deprem Kaynağı', 'Seismic Source')}</span>
                <div class="chips" style="flex-wrap:wrap">{sourceOptions().map(([k, l]) => <button key={k} type="button" class="chip" aria-pressed={f.source === k} onClick={() => set({ source: k })}>{l}</button>)}</div>
              </div>
            </>
          )}
          <div class="row" style="margin-top:8px">
            <button type="button" class="btn ghost" onClick={() => set({ hazard: 'all', hours: 24, minMag: 0, source: '' })}>{tx('Sıfırla', 'Reset')}</button>
            <span class="spacer" />
            <button type="button" class="btn primary" onClick={() => setOpen(false)}>{tx('Göster', 'Apply')}</button>
          </div>
        </Sheet>
      )}
      {countryOpen && (
        <Sheet title={tx('Ülke seç', 'Select country')} onClose={() => setCountryOpen(false)}>
          <div class="search" style="margin-bottom:8px">
            <Icon name="search" />
            <input
              type="search"
              class="input"
              value={countryQuery}
              onInput={(e) => setCountryQuery((e.target as HTMLInputElement).value)}
              placeholder={tx('Ülke ara… (ör. Japonya, İtalya)', 'Search country… (e.g. Japan, Italy)')}
              aria-label={tx('Ülke ara', 'Search country')}
            />
          </div>
          <ul class="pick-list" role="radiogroup" aria-label={tx('Ülkeler', 'Countries')}>
            {filteredCountries.map((c) => {
              const checked = f.region === 'country' && (f.country || 'TR') === c.code;
              const name = s.lang === 'en' ? c.en : c.tr;
              return (
                <li key={c.code}>
                  <button
                    type="button"
                    class="pick country-pick"
                    role="radio"
                    aria-checked={checked}
                    onClick={() => { set({ region: 'country', country: c.code }); setCountryOpen(false); }}
                  >
                    <span class="country-code">{c.code}</span>
                    <span style="flex:1;min-width:0"><span class="t">{name}</span></span>
                    {checked && <Icon name="check" />}
                  </button>
                </li>
              );
            })}
            {filteredCountries.length === 0 && (
              <li class="empty" style="padding:18px">{tx('Eşleşen ülke bulunamadı.', 'No matching country found.')}</li>
            )}
          </ul>
        </Sheet>
      )}
    </>
  );
}

function sourceAge(eqResp: EventsResp | null, disResp: DisastersResp | null, hazard: HazardFilter): { text: string; ok: boolean } {
  if (hazard !== 'all' && hazard !== 'earthquake') {
    if (!disResp) return { text: tx('Yükleniyor…', 'Loading…'), ok: true };
    return { text: `${fmtTime(disResp.generatedAt)} ${tx('güncellendi', 'updated')}`, ok: !disResp.error };
  }
  if (!eqResp) return { text: tx('Yükleniyor…', 'Loading…'), ok: true };
  const ok = eqResp.sources.filter((s) => s.last_success_at).map((s) => s.last_success_at!).sort().pop();
  const down = eqResp.sources.some((s) => s.status === 'down');
  return ok
    ? { text: `${fmtTime(ok)} ${tx('güncellendi', 'updated')}${down ? tx(' · bir kaynağa erişilemiyor', ' · a source is unreachable') : ''}`, ok: !down }
    : { text: tx('Kaynağa erişilemiyor', 'Source unreachable'), ok: false };
}

/** Bölge filtresini deprem dışı afetlere uygular; seçili ülkede kayıt yoksa küresel kayıtları bilgi notuyla döner. */
export function filterDisastersByRegion(items: DisasterEvent[], region: Filters['region'], country: string, onlyRegionalStrict = false): { list: DisasterEvent[]; globalFallback: boolean } {
  if (region === 'world') return { list: items, globalFallback: false };
  const matched = items.filter((d) => inCountryBounds(d.lat, d.lon, country, `${d.place} ${d.region ?? ''}`));
  if (matched.length > 0 || onlyRegionalStrict) return { list: matched, globalFallback: false };
  return { list: items, globalFallback: items.length > 0 };
}

type CombinedRow =
  | { kind: 'eq'; time: string; eq: ListEvent }
  | { kind: 'dis'; time: string; dis: DisasterEvent };

export function EventsPage({ r }: { r: Route }) {
  const s = useAppState();
  const hazard = s.filters.hazard ?? 'all';
  const needEq = hazard === 'all' || hazard === 'earthquake';
  const refs = refPoints(s.prefs);
  const [refId, setRef] = useState(getRefId());
  useEffect(() => {
    const sync = () => setRef(getRefId());
    window.addEventListener('afet-ref-changed', sync);
    return () => window.removeEventListener('afet-ref-changed', sync);
  }, []);
  const ref = refs.find((x) => x.id === refId) ?? refs[0] ?? null;
  const selectedEq = r.path[0] === 'olay' ? r.path[1] ?? null : null;
  const selectedDis = r.path[0] === 'afet' ? r.path[1] ?? null : null;

  const eqFetch = useFetch<EventsResp>(needEq ? eventsUrl(s.filters, s.env === 'drill') : null, [s.lang], 30_000);
  const disFetch = useFetch<DisastersResp>(disastersUrl(hazard), [s.lang], 120_000);
  const wide = useWide();

  useEffect(() => {
    const onMore = () => eqFetch.reload();
    window.addEventListener('afet-standalone-more', onMore);
    return () => window.removeEventListener('afet-standalone-more', onMore);
  }, [eqFetch.reload]);

  const reloadAll = () => {
    if (needEq) eqFetch.reload();
    if (hazard !== 'earthquake') disFetch.reload();
  };

  const { rows, globalFallback } = useMemo(() => {
    const out: CombinedRow[] = [];
    if (needEq && eqFetch.data) {
      for (const e of filterEventsByCountry(eqFetch.data.events, s.filters)) out.push({ kind: 'eq', time: e.originTime, eq: e });
    }
    let fallback = false;
    if (hazard !== 'earthquake' && disFetch.data) {
      const filtered = filterDisastersByRegion(disFetch.data.disasters, s.filters.region, s.filters.country, hazard === 'all');
      fallback = filtered.globalFallback;
      for (const d of filtered.list) out.push({ kind: 'dis', time: d.originTime, dis: d });
    }
    out.sort((a, b) => b.time.localeCompare(a.time));
    return { rows: out.slice(0, 450), globalFallback: fallback };
  }, [needEq, hazard, eqFetch.data, disFetch.data, s.filters.region, s.filters.country]);

  const busy = (needEq && eqFetch.loading) || (hazard !== 'earthquake' && disFetch.loading);
  const hasAnyData = (needEq ? !!eqFetch.data : true) && (hazard !== 'earthquake' ? !!disFetch.data : true);
  const err = needEq ? eqFetch.error : disFetch.error;
  const offline = eqFetch.offline || disFetch.offline;
  const age = sourceAge(eqFetch.data, disFetch.data, hazard);
  const selectedDisItem = selectedDis ? disFetch.data?.disasters.find((x) => x.id === selectedDis) ?? null : null;
  const cLabel = countryLabel(s.filters.country, s.lang);

  const detailNode = selectedEq
    ? <EventDetail id={selectedEq} r={r} />
    : selectedDis
      ? <DisasterDetail id={selectedDis} item={selectedDisItem} />
      : null;

  return (
    <div class="split">
      <div>
        <PullToRefresh onRefresh={reloadAll} loading={busy && hasAnyData} />
        <FilterBar right={<RefreshButton loading={busy} onClick={reloadAll} />}
          status={<span style="display:inline-flex;align-items:center;gap:5px"><span class={`dot-live ${age.ok && !offline ? '' : 'off'}`} aria-hidden="true" />{offline ? tx('Çevrimdışı kopya', 'Offline copy') : age.text}</span>} />
        {globalFallback && (
          <div style="margin-bottom:8px">
            <Notice kind="teal" icon="globe">
              {tx(
                `${cLabel} çevresinde şu an aktif ${hazardMeta(hazard as DisasterEvent['hazard']).label.toLocaleLowerCase('tr')} kaydı yok; dünyadaki güncel kayıtlar gösteriliyor.`,
                `No active ${hazardMeta(hazard as DisasterEvent['hazard']).label.toLowerCase()} alerts in ${cLabel} right now; showing current global events.`,
              )}
            </Notice>
          </div>
        )}
        {err && !rows.length && <Notice kind="amber" icon="wifiOff">{tx('Kaynağa erişilemiyor:', 'Source unreachable:')} {err} <button class="btn sm" onClick={reloadAll}>{tx('Tekrar dene', 'Retry')}</button></Notice>}
        {hasAnyData && rows.length === 0 && <div class="card empty">{tx('Bu filtrelerle afet kaydı yok.', 'No disaster events match these filters.')}</div>}
        {rows.length > 0 && (
          <ul class="evlist" aria-label={tx(`Afet listesi, en yeni üstte, ${rows.length} kayıt`, `Disasters list, newest first, ${rows.length} events`)}>
            {rows.map((row) => row.kind === 'eq'
              ? <EventRow key={`eq-${row.eq.id}`} e={row.eq} ref0={ref} current={row.eq.id === selectedEq} />
              : <DisasterRow key={`dis-${row.dis.id}`} d={row.dis} ref0={ref} current={row.dis.id === selectedDis} />)}
          </ul>
        )}
        {!hasAnyData && !err && <div class="card empty"><span class="spin" aria-label={tx('Yükleniyor', 'Loading')} /></div>}
      </div>
      {wide ? (
        <aside class="detail-pane" aria-label={tx('Afet ayrıntısı', 'Disaster details')}>
          {detailNode ?? <div class="card empty">{tx('Ayrıntısını görmek için listeden bir afet seç.', 'Select an event from the list to view details.')}</div>}
        </aside>
      ) : detailNode ? (
        <Sheet title={tx('Afet ayrıntısı', 'Disaster details')} onClose={() => go('/afetler')}>{detailNode}</Sheet>
      ) : null}
    </div>
  );
}

export function useWide(): boolean {
  const mq = '(min-width: 960px)';
  const [w, setW] = useState(window.matchMedia(mq).matches);
  useEffect(() => {
    const m = window.matchMedia(mq);
    const f = () => setW(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return w;
}

function EventRow({ e, ref0, current }: { e: ListEvent; ref0: RefPoint | null; current: boolean }) {
  const d = distanceTo(ref0, e.lat, e.lon);
  return (
    <li>
      <button class={`evrow ${e.isTest ? 'ev-test' : ''}`} aria-current={current ? 'true' : undefined} onClick={() => go(`/olay/${encodeURIComponent(e.id)}`)}
        aria-label={`${e.isTest ? 'TEST, ' : ''}${e.place}, ${fmtMag(e.magnitude, e.magType)}, ${fmtTime(e.originTime)}, ${fmtDepth(e.depthKm)}${d != null ? `, ${fmtKm(d)} ${tx('uzaklıkta', 'away')} (${ref0!.label})` : ''}, ${tx('kaynak', 'source')} ${e.sources.join(', ')}`}>
        <MagBadge m={e.magnitude} type={e.magType} />
        <div style="flex:1;min-width:0">
          <div class="t">{e.place}</div>
          <div class="meta">{fmtTime(e.originTime)} · {fmtRel(e.originTime)} · {e.magType ?? tx('tür ?', 'type ?')} · {e.depthKm == null ? tx('derinlik ?', 'depth ?') : fmtDepth(e.depthKm)}</div>
        </div>
        <div class="side" aria-hidden="true">
          {d != null && <span class="dist">{fmtKm(d)}</span>}
          <span class="src">{e.sources.join(' · ')}</span>
        </div>
      </button>
    </li>
  );
}

function severityPill(sev: DisasterEvent['severity']): [string, string] {
  switch (sev) {
    case 'severe': return [tx('Şiddetli', 'Severe'), 'red'];
    case 'warning': return [tx('Uyarı', 'Warning'), 'amber'];
    case 'watch': return [tx('İzleme', 'Watch'), 'teal'];
    case 'advisory': return [tx('Bilgi', 'Advisory'), 'neutral'];
  }
}

function DisasterRow({ d, ref0, current }: { d: DisasterEvent; ref0: RefPoint | null; current: boolean }) {
  const dist = distanceTo(ref0, d.lat, d.lon);
  const hm = hazardMeta(d.hazard);
  return (
    <li>
      <button class="evrow" aria-current={current ? 'true' : undefined} onClick={() => go(`/afet/${encodeURIComponent(d.id)}`)}
        aria-label={`${hm.label}, ${d.title}, ${fmtDateTime(d.originTime)}${dist != null ? `, ${fmtKm(dist)}` : ''}, ${d.source}`}>
        <HazardBadge hazard={d.hazard} />
        <div style="flex:1;min-width:0">
          <div class="t">{d.title}</div>
          <div class="meta">
            {fmtDateTime(d.originTime)} · {fmtRel(d.originTime)}
            {d.metricLabel ? ` · ${d.metricLabel}` : ''}
          </div>
        </div>
        <div class="side" aria-hidden="true">
          {dist != null && <span class="dist">{fmtKm(dist)}</span>}
          <span class="src">{d.source}</span>
        </div>
      </button>
    </li>
  );
}

export function DisasterDetail({ id, item }: { id: string; item: DisasterEvent | null }) {
  const s = useAppState();
  const { data } = useFetch<DisastersResp>(item ? null : '/api/disasters?hazard=all', [s.lang]);
  const d = item ?? data?.disasters.find((x) => x.id === id) ?? null;
  const refs = refPoints(s.prefs);
  const distances = useMemo(() => (d ? refs.map((x) => ({ ...x, d: haversineKm(x.lat, x.lon, d.lat, d.lon) })) : []), [d, s.prefs, s.lang]);

  if (!d && !data) return <div class="empty"><span class="spin" aria-label={tx('Yükleniyor', 'Loading')} /></div>;
  if (!d) return <Notice kind="amber">{tx('Afet kaydı bulunamadı.', 'Disaster event not found.')}</Notice>;

  const hm = hazardMeta(d.hazard);
  const [sevLbl, sevCls] = severityPill(d.severity);

  return (
    <div class="stack">
      <div class="card">
        <div class="row" style="align-items:flex-start;gap:14px">
          <HazardBadge hazard={d.hazard} size="lg" />
          <div style="flex:1;min-width:0">
            <div class="row wrap" style="gap:6px">
              <span class={`pill ${sevCls}`}>{sevLbl}</span>
              <span class="pill neutral">{hm.label}</span>
            </div>
            <h2 style="margin-top:6px">{d.title}</h2>
            <div class="small muted">{fmtDateTime(d.originTime, true)} ({tx('Türkiye saati', 'Türkiye time')})</div>
          </div>
        </div>
        <dl class="kv" style="margin-top:12px">
          <dt>{tx('Afet türü', 'Hazard type')}</dt><dd>{hm.label}</dd>
          {d.metricLabel && <><dt>{tx('Ölçüm / Düzey', 'Metric / Level')}</dt><dd>{d.metricLabel}</dd></>}
          {d.region && <><dt>{tx('Bölge', 'Region')}</dt><dd>{d.region}</dd></>}
          <dt>{tx('Koordinat', 'Coordinates')}</dt>
          <dd>
            {d.lat.toFixed(4)}, {d.lon.toFixed(4)}{' '}
            <button class="btn sm ghost" style="min-height:36px" onClick={() => { void navigator.clipboard?.writeText(`${d.lat.toFixed(4)}, ${d.lon.toFixed(4)}`); toast(tx('Koordinat kopyalandı', 'Coordinates copied')); }} aria-label={tx('Koordinatı kopyala', 'Copy coordinates')}>
              <Icon name="copy" />
            </button>
          </dd>
          <dt>{tx('Veri kaynağı', 'Data source')}</dt><dd>{d.source}</dd>
        </dl>
        {d.description && (
          <p class="small" style="margin-top:12px;padding:10px 12px;background:var(--surface-2);border-radius:12px">
            {d.description}
          </p>
        )}
        {distances.length > 0 && (
          <>
            <div class="section-title" style="margin-left:0">{tx('Konumlarına uzaklık (kuş uçuşu)', 'Distance to your locations (straight-line)')}</div>
            <ul class="timeline">
              {distances.map((x) => <li key={x.id}><span><Icon name={x.kind === 'active' ? 'locate' : 'pin'} /> {x.label}</span><span class="v">{fmtKm(x.d)}</span></li>)}
            </ul>
          </>
        )}
        <div class="row wrap" style="margin-top:14px">
          <a class="btn" href={`#/harita?afet=${encodeURIComponent(d.id)}`}><Icon name="map" /> {tx('Haritada göster', 'Show on map')}</a>
          {d.url && <Ext href={d.url}>{tx('Resmî kaynakta aç', 'Open official source')}</Ext>}
        </div>
      </div>
    </div>
  );
}

interface Detail {
  event: EventSummary;
  records: { source: string; sourceEventId: string; originTime: string; sourcePublishedAt: string | null; lat: number; lon: number; depthKm: number | null; magnitude: number | null; magType: string | null; place: string; status: string; url: string | null; ingestedAt: string; revision: number }[];
  revisions: { version: number; source: string; change: { type: string; from?: { magnitude: number | null; magType: string | null }; to?: { magnitude: number | null; magType: string | null }; magnitude?: number | null; magType?: string | null }; at: string }[];
  felt: { total: number; byIntensity: { intensity: number; n: number }[] };
}

export interface DeliveryInfo {
  id: string; kind: string; title: string; body: string; reasons: MatchReason[] | null; platform: string; deviceLabel: string; status: string; state: string;
  stages: Record<string, string | null>; timings: Record<string, number | null>; providerDetail: string | null; attempts: number;
}

export function EventDetail({ id, r }: { id: string; r: Route }) {
  const s = useAppState();
  const l = lang();
  const { data, error } = useFetch<Detail>(`/api/events/${encodeURIComponent(id)}`, [s.lang], 30_000);
  const deliveryId = r.query.get('d');
  const { data: delivery } = useFetch<DeliveryInfo>(deliveryId && s.device ? `/api/deliveries/${deliveryId}` : null, [], 5000);
  const [felt, setFelt] = useState<number | null>(null);
  const refs = refPoints(s.prefs);
  const distances = useMemo(() => (data ? refs.map((x) => ({ ...x, d: haversineKm(x.lat, x.lon, data.event.lat, data.event.lon) })) : []), [data, s.prefs, s.lang]);

  const feltLevels = [
    tx('Hafif hissettim', 'Weakly felt'),
    tx('Belirgin hissettim', 'Clearly felt'),
    tx('Güçlü hissettim', 'Strongly felt'),
    tx('Çok güçlü hissettim', 'Very strongly felt'),
    tx('Hasar gördüm', 'Observed damage'),
  ];

  if (error) return <Notice kind="amber" icon="wifiOff">{tx('Olay yüklenemedi:', 'Could not load event:')} {error}</Notice>;
  if (!data) return <div class="empty"><span class="spin" aria-label={tx('Yükleniyor', 'Loading')} /></div>;
  const e = data.event;

  const sendFelt = async (n: number) => {
    if (!s.device) { toast(tx('“Hissettim” için önce Ayarlar’dan bildirimleri açarak cihazını kaydet.', 'Enable notifications in Settings first to register your device for “Did You Feel It?”.')); return; }
    try { await api(`/api/events/${encodeURIComponent(id)}/felt`, { method: 'POST', json: { intensity: n } }); setFelt(n); toast(tx('Teşekkürler, gözlemin toplu sayıma eklendi.', 'Thank you, your report was added to the aggregate count.')); }
    catch (err) { toast(err instanceof ApiError ? err.message : tx('Gönderilemedi', 'Could not send')); }
  };

  const revLabels: Record<string, string> = {
    created: tx('ilk kayıt', 'initial record'),
    revised: tx('özet güncellendi', 'summary updated'),
    deleted: tx('geri çekildi', 'retracted'),
    'source-added': tx('yeni kaynak eklendi', 'new source merged'),
    'source-revised': tx('kaynak revizyonu', 'source revision'),
  };

  return (
    <div class="stack">
      {deliveryId && <WhyNotified delivery={delivery} />}
      <div class="card">
        <div class="row" style="align-items:flex-start;gap:14px">
          <MagBadge m={e.magnitude} type={e.magType} size="lg" />
          <div style="flex:1;min-width:0">
            {e.isTest && <span class="pill amber">{tx('TEST · gerçek olay değil', 'TEST · not a real event')}</span>}
            {e.status === 'deleted' && <span class="pill red">{tx('Kaynak tarafından geri çekildi', 'Retracted by source')}</span>}
            <h2 style="margin-top:4px">{e.place}</h2>
            <div class="small muted">{fmtDateTime(e.originTime, true)} ({tx('Türkiye saati', 'Türkiye time')}) · {new Date(e.originTime).toISOString().replace('T', ' ').slice(0, 19)} UTC</div>
          </div>
        </div>
        <dl class="kv" style="margin-top:12px">
          <dt>{tx('Büyüklük', 'Magnitude')}</dt><dd>{fmtMag(e.magnitude, e.magType)}</dd>
          <dt>{tx('Derinlik', 'Depth')}</dt><dd>{fmtDepth(e.depthKm)}</dd>
          {feltRadiusKm(e.magnitude) != null && <><dt>{tx('Hissedilme alanı', 'Estimated felt area')}</dt><dd>{tx('yaklaşık', 'approx.')} {fmtKm(feltRadiusKm(e.magnitude)!)} {tx('yarıçap', 'radius')} <span class="muted small">{tx('(tahmini; derinlik ve zemine göre değişir)', '(estimated; varies by depth and local soil)')}</span></dd></>}
          <dt>{tx('Merkez üssü', 'Epicenter')}</dt><dd>{e.lat.toFixed(4)}, {e.lon.toFixed(4)} <button class="btn sm ghost" style="min-height:36px" onClick={() => { void navigator.clipboard?.writeText(`${e.lat.toFixed(4)}, ${e.lon.toFixed(4)}`); toast(tx('Koordinat kopyalandı', 'Coordinates copied')); }} aria-label={tx('Koordinatı kopyala', 'Copy coordinates')}><Icon name="copy" /></button></dd>
          <dt>{tx('Özet kaynağı', 'Summary source')}</dt><dd>{e.summarySource} <span class="muted small">{tx('(özetteki değerler bu kurumdan)', '(summary values from this agency)')}</span></dd>
          <dt>{tx('Sürüm', 'Version')}</dt><dd>{e.version}</dd>
        </dl>
        {distances.length > 0 && (
          <>
            <div class="section-title" style="margin-left:0">{tx('Konumlarına uzaklık (kuş uçuşu)', 'Distance to your locations (straight-line)')}</div>
            <ul class="timeline">
              {distances.map((x) => <li key={x.id}><span><Icon name={x.kind === 'active' ? 'locate' : 'pin'} /> {x.label}</span><span class="v">{fmtKm(x.d)}</span></li>)}
            </ul>
          </>
        )}
        <div class="row wrap" style="margin-top:12px">
          <a class="btn" href={`#/harita?olay=${encodeURIComponent(e.id)}`}><Icon name="map" /> {tx('Haritada göster', 'Show on map')}</a>
        </div>
        <p class="small muted" style="margin-top:12px">
          {l === 'en' ? (
            <><strong>Magnitude</strong> measures energy released at the earthquake source; <strong>local shaking intensity</strong> describes how strongly a place shakes depending on distance, depth, and soil; <strong>alert radius</strong> is purely your notification preference.</>
          ) : (
            <><strong>Büyüklük</strong> depremin kaynağında açığa çıkan enerjinin ölçüsüdür; <strong>yerel sarsıntı şiddeti</strong> bulunduğun yerde ne kadar sallandığını anlatır ve uzaklık, derinlik ve zemine göre değişir; <strong>takip yarıçapı</strong> ise yalnız senin bildirim tercihindir.</>
          )}
        </p>
      </div>

      <div class="card">
        <h3>{tx('Kaynakların ayrı ölçümleri', 'Measurements by agency')}</h3>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>{tx('Kaynak', 'Source')}</th><th class="num">{tx('Büyüklük', 'Magnitude')}</th><th class="num">{tx('Derinlik', 'Depth')}</th><th>{tx('Oluş (TR)', 'Origin (TR)')}</th><th>{tx('Yayın', 'Published')}</th></tr></thead>
            <tbody>
              {data.records.map((x) => (
                <tr key={x.source + x.sourceEventId}>
                  <td><strong>{x.source}</strong>{x.status === 'deleted' && <span class="pill red">{tx('silindi', 'deleted')}</span>}<div class="small">{x.url ? <Ext href={x.url}>{tx('Kaynakta aç', 'Open at source')}</Ext> : x.sourceEventId}</div></td>
                  <td class="num">{x.magnitude == null ? '—' : `${fmtNum(x.magnitude)} ${x.magType ?? ''}`}</td>
                  <td class="num">{x.depthKm == null ? tx('bilinmiyor', 'unknown') : `${fmtNum(x.depthKm)} km`}</td>
                  <td>{fmtTime(x.originTime, true)}</td>
                  <td class="small">{x.sourcePublishedAt ? fmtTime(x.sourcePublishedAt, true) : tx('bilinmiyor', 'unknown')}<div class="muted">{tx('alındı', 'ingested')} {fmtTime(x.ingestedAt, true)}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {data.revisions.length > 1 && (
        <div class="card">
          <h3>{tx('Güncellemeler', 'Revisions')}</h3>
          <ul class="timeline">
            {data.revisions.map((v, i) => (
              <li key={i}>
                <span>{fmtTime(v.at, true)} · {v.source} · {revLabels[v.change.type] ?? v.change.type}</span>
                <span class="v">{v.change.to ? `${v.change.from?.magnitude ?? '?'} → ${v.change.to.magnitude ?? '?'}` : v.change.magnitude != null ? `M ${fmtNum(v.change.magnitude)}` : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!STANDALONE && <div class="card">
        <h3>{tx('Hissettin mi?', 'Did you feel it?')}</h3>
        <p class="small muted">{tx('İsteğe bağlı. Gözlemin konumunla değil, yalnız olayla ilişkilendirilir ve toplu sayı olarak gösterilir.', 'Optional. Your report is linked only to the event—never your location—and displayed as an aggregate count.')}</p>
        <div class="row wrap" role="group" aria-label={tx('Hissettim düzeyi', 'Felt intensity level')}>
          {feltLevels.map((t, i) => (
            <button key={i} class="chip" aria-pressed={felt === i + 1} onClick={() => void sendFelt(i + 1)}>{t}</button>
          ))}
        </div>
        <p class="small" style="margin-top:8px" aria-live="polite">
          {data.felt.total === 0
            ? tx('Henüz topluluk gözlemi yok.', 'No community reports yet.')
            : `${data.felt.total} ${tx('kişi hissettiğini bildirdi: ', 'people reported feeling this: ')}` + data.felt.byIntensity.map((b) => `${feltLevels[b.intensity - 1]} ${b.n}`).join(', ')}
          <span class="pill neutral" style="margin-left:6px">{tx('Topluluk', 'Community')}</span>
        </p>
      </div>}
    </div>
  );
}

function WhyNotified({ delivery }: { delivery: DeliveryInfo | null }) {
  const l = lang();
  if (!delivery) return <div class="card"><span class="spin" /> {tx('Bildirim bilgisi yükleniyor…', 'Loading notification details…')}</div>;
  const t = delivery.timings;
  const rows: [string, number | null][] = [
    [tx('Kaynağın yayını → platforma giriş', 'Source publish → platform ingest'), t.sourceToPlatformMs ?? null],
    [tx('Platforma giriş → kuyruk', 'Platform ingest → queue'), t.platformToQueueMs ?? null],
    [tx('Platforma giriş → ilk gönderim isteği', 'Platform ingest → first send request'), t.platformToFirstSendMs ?? null],
    [tx('Platforma giriş → sağlayıcı kabulü', 'Platform ingest → push provider accept'), t.platformToProviderAcceptMs ?? null],
    [tx('Platforma giriş → cihazda alım', 'Platform ingest → received on device'), t.platformToDeviceReceivedMs ?? null],
    [tx('Platforma giriş → cihazda gösterim', 'Platform ingest → displayed on device'), t.platformToDisplayedMs ?? null],
    [tx('Platforma giriş → açılış', 'Platform ingest → opened'), t.platformToOpenedMs ?? null],
  ];
  return (
    <div class="card" style="border-color:var(--teal)">
      <div class="row"><Icon name="info" /><h3 style="margin:0">{tx('Bu bildirimi neden aldın?', 'Why did you receive this notification?')}</h3></div>
      <p style="margin-top:8px"><strong>{delivery.title}</strong></p>
      {delivery.reasons ? (
        <ul class="small" style="padding-left:18px;margin:6px 0">
          {delivery.reasons.map((x, i) => <li key={i}><strong>{reasonLabel(x, l)}</strong> — {reasonExplain(x, l)}</li>)}
        </ul>
      ) : <p class="small">{delivery.kind === 'test' ? tx('Bildirim denemesi.', 'Notification test.') : tx('Yetkili uyarı kuralı.', 'Authorized alert rule.')}</p>}
      <p class="small muted">{tx('Cihaz', 'Device')}: {delivery.deviceLabel} · {tx('Durum', 'Status')}: {delivery.state}</p>
      <ul class="timeline" aria-label={tx('Aşama süreleri', 'Stage timings')}>
        {rows.map(([k, v]) => <li key={k} class={v == null ? 'unknown' : ''}><span>{k}</span><span class="v">{fmtMs(v)}</span></li>)}
      </ul>
      <p class="small muted" style="margin-top:6px">{tx('Sağlayıcı kabulü teslim anlamına gelmez; “cihazda gösterim” bu telefonun gönderdiği makbuzla ölçülür.', 'Provider acceptance does not mean delivered; “displayed on device” is verified via receipt from this device.')}</p>
    </div>
  );
}

export { isActiveLocationUsable };
