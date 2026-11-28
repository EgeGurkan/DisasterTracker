// Aynı fiziksel olayı farklı kurumlardan gelen kayıtlarla birleştirme kuralları.

import type { EventSummary, SourceId, SourceRecord } from './types.ts';
import { haversineKm, inTurkeyRegion } from './geo.ts';

/**
 * Belgelenmiş birleştirme toleransları.
 * Ek koruma: bir olay her kurumdan en fazla bir kayıt taşır. Böylece aynı kurumun
 * birbirine çok yakın iki artçısı asla tek olaya katlanmaz.
 */
export const MERGE_TOLERANCE = {
  seconds: 20,
  km: 60,
  depthKm: 50,
  mag: 1.2,
} as const;

export const SOURCE_PRIORITY_TURKEY: SourceId[] = ['TEST', 'AFAD', 'KOERI', 'NOA', 'EMSC', 'GEOFON', 'INGV', 'USGS', 'GEONET', 'JMA'];
export const SOURCE_PRIORITY_WORLD: SourceId[] = ['TEST', 'USGS', 'GEOFON', 'EMSC', 'JMA', 'GEONET', 'INGV', 'NOA', 'AFAD', 'KOERI'];

export function recordMatchesEvent(r: SourceRecord, ev: { originTime: string; lat: number; lon: number; depthKm: number | null; magnitude: number | null; isTest: boolean }): boolean {
  if (r.isTest !== ev.isTest) return false;
  const dt = Math.abs(new Date(r.originTime).getTime() - new Date(ev.originTime).getTime()) / 1000;
  if (dt > MERGE_TOLERANCE.seconds) return false;
  if (haversineKm(r.lat, r.lon, ev.lat, ev.lon) > MERGE_TOLERANCE.km) return false;
  if (r.depthKm != null && ev.depthKm != null && Math.abs(r.depthKm - ev.depthKm) > MERGE_TOLERANCE.depthKm) return false;
  if (r.magnitude != null && ev.magnitude != null && Math.abs(r.magnitude - ev.magnitude) > MERGE_TOLERANCE.mag) return false;
  return true;
}

/** Birleşmeye aday olaylar arasından en uygununu seçer (aynı kurumun kaydı olmayan, zamanca en yakın). */
export function pickMergeTarget<E extends { id: string; originTime: string; lat: number; lon: number; depthKm: number | null; magnitude: number | null; isTest: boolean }>(
  r: SourceRecord, candidates: E[], sourcesOf: (eventId: string) => SourceId[],
): E | null {
  let best: E | null = null;
  let bestDt = Infinity;
  for (const ev of candidates) {
    if (sourcesOf(ev.id).includes(r.source)) continue;
    if (!recordMatchesEvent(r, ev)) continue;
    const dt = Math.abs(new Date(r.originTime).getTime() - new Date(ev.originTime).getTime());
    if (dt < bestDt) { best = ev; bestDt = dt; }
  }
  return best;
}

/** Özet için kaynak seçimi: Türkiye'de AFAD, dünyada USGS önceliklidir. Silinmiş kayıtlar özete giremez. */
export function selectSummaryRecord(records: SourceRecord[]): SourceRecord | null {
  const live = records.filter((r) => r.status !== 'deleted');
  if (live.length === 0) return null;
  const ref = live[0]!;
  const prio = inTurkeyRegion(ref.lat, ref.lon) ? SOURCE_PRIORITY_TURKEY : SOURCE_PRIORITY_WORLD;
  return [...live].sort((a, b) => {
    const ia = prio.indexOf(a.source), ib = prio.indexOf(b.source);
    const pa = ia === -1 ? 999 : ia, pb = ib === -1 ? 999 : ib;
    if (pa !== pb) return pa - pb;
    // aynı kurum önceliğinde büyüklüğü bilinen kayıt öne
    return (a.magnitude == null ? 1 : 0) - (b.magnitude == null ? 1 : 0);
  })[0]!;
}

export function summarize(id: string, version: number, records: SourceRecord[]): Omit<EventSummary, 'version'> & { version: number } {
  const s = selectSummaryRecord(records);
  if (!s) {
    const r = records[0]!;
    return {
      id, version, hazard: 'earthquake', isTest: r.isTest, originTime: r.originTime, lat: r.lat, lon: r.lon,
      depthKm: r.depthKm, magnitude: r.magnitude, magType: r.magType, place: r.place, region: r.region,
      summarySource: r.source, status: 'deleted',
    };
  }
  return {
    id, version, hazard: 'earthquake', isTest: s.isTest, originTime: s.originTime, lat: s.lat, lon: s.lon,
    depthKm: s.depthKm, magnitude: s.magnitude, magType: s.magType, place: s.place, region: s.region,
    summarySource: s.source, status: 'active',
  };
}
