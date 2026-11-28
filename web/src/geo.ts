import { haversineKm } from '../../shared/src/geo.ts';
import { isActiveLocationUsable, placeName } from '../../shared/src/match.ts';
import type { DevicePrefs, SavedLocation } from '../../shared/src/types.ts';
import { getState, setState, updatePrefs } from './state.ts';
import { PROVINCES } from './provinces.ts';
import { lang, tx } from './i18n.ts';

export interface RefPoint { id: string; label: string; lat: number; lon: number; kind: 'active' | 'saved' }

export function currentLabel(): string {
  return tx('Mevcut konumum', 'My current location');
}
export const CURRENT_LABEL = 'Mevcut konumum';

export function refPoints(p: DevicePrefs): RefPoint[] {
  const out: RefPoint[] = [];
  const l = lang();
  if (isActiveLocationUsable(p.active, Date.now())) out.push({ id: 'active', label: currentLabel(), lat: p.active.lat!, lon: p.active.lon!, kind: 'active' });
  for (const loc of p.saved) out.push({ id: loc.id, label: placeName(loc.label, loc.place, l), lat: loc.lat, lon: loc.lon, kind: 'saved' });
  return out;
}

export function distanceTo(ref: RefPoint | null, lat: number, lon: number): number | null {
  return ref ? haversineKm(ref.lat, ref.lon, lat, lon) : null;
}

/**
 * Büyüklüğe göre kabaca "hissedilebilir" yarıçap (km). Yaklaşık bir gösterimdir:
 * gerçek sarsıntı derinliğe, zemine ve fay yönüne göre değişir (ör. M3 ≈ 20 km, M5 ≈ 125 km, M7 ≈ 800 km).
 */
export function feltRadiusKm(m: number | null): number | null {
  if (m == null || m < 2) return null;
  return Math.min(1500, Math.pow(10, 0.4 * m + 0.1));
}

const REF_KEY = 'afet:ref';
export function getRefId(): string { try { return localStorage.getItem(REF_KEY) ?? ''; } catch { return ''; } }
export function setRefId(id: string): void {
  try { localStorage.setItem(REF_KEY, id); } catch { /* yoksay */ }
  window.dispatchEvent(new Event('afet-ref-changed'));
}

/** Mevcut konumu ölçer ve o konum için bildirimleri açar. İzin reddi kayıtlı yerleri etkilemez. */
export function measureActiveLocation(): Promise<{ ok: boolean; message: string }> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve({ ok: false, message: tx('Bu cihaz konum servisini desteklemiyor.', 'This device does not support location services.') });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        updatePrefs((p) => ({ ...p, active: { ...p.active, enabled: true, permission: 'granted', lat: pos.coords.latitude, lon: pos.coords.longitude, measuredAt: new Date(pos.timestamp || Date.now()).toISOString(), accuracyM: pos.coords.accuracy } }));
        resolve({ ok: true, message: tx('Mevcut konumun alındı.', 'Current location acquired.') });
      },
      (err) => {
        const denied = err.code === err.PERMISSION_DENIED;
        updatePrefs((p) => ({ ...p, active: { ...p.active, permission: denied ? 'denied' : p.active.permission } }));
        resolve({
          ok: false,
          message: denied
            ? tx('Konum izni kapalı. Bir yer arayarak seçebilirsin; o yerin bildirimleri izinsiz çalışır.', 'Location permission disabled. You can search and pick a place; saved place alerts work without location permission.')
            : tx('Konum alınamadı. Bir yer arayarak seçebilirsin.', 'Could not get location. You can search and pick a place.'),
        });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60_000 },
    );
  });
}

/** Paylaşım için anlık konum (konum tercihlerine yazılmaz). */
export function oneShotPosition(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition((p) => resolve(p), () => resolve(null), { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
  });
}

export interface PlaceResult { name: string; detail: string; lat: number; lon: number }

const trLower = (s: string) => s.toLocaleLowerCase('tr');

/** Yer arama: önce 81 il (çevrimdışı), sonra OpenStreetMap Nominatim (yalnız aranan metin gönderilir). */
export async function searchPlaces(q: string): Promise<{ results: PlaceResult[]; online: boolean }> {
  const query = q.trim();
  const l = lang();
  const local = PROVINCES.filter(([n]) => trLower(n).startsWith(trLower(query)) || n.toLowerCase().startsWith(query.toLowerCase()))
    .map(([n, lat, lon]) => ({ name: n, detail: tx('İl merkezi', 'Province center'), lat, lon }));
  if (query.length < 3) return { results: local, online: true };
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=8&accept-language=${l}&q=${encodeURIComponent(query)}`);
    const j = (await r.json()) as { name?: string; display_name: string; lat: string; lon: string; address?: Record<string, string> }[];
    const remote = j.map((x) => {
      const a = x.address ?? {};
      const first = x.name || x.display_name.split(',')[0]!.trim();
      const district = a.town || a.city_district || a.county || a.suburb || a.city || '';
      const province = a.province || a.state || a.city || a.country || '';
      const name = [first, district !== first ? district : '', province !== first && province !== district ? province : ''].filter(Boolean).slice(0, 3).join(', ');
      return { name, detail: x.display_name.split(',').slice(1, 4).join(',').trim(), lat: Number(x.lat), lon: Number(x.lon) };
    });
    const seen = new Set<string>();
    return { results: [...local, ...remote].filter((x) => (seen.has(x.name) ? false : (seen.add(x.name), true))), online: true };
  } catch {
    return { results: local, online: false };
  }
}

/** Yeni bir yeri bildirimleri açık olarak kaydeder; aynı yer varsa onu döner. */
export function addPlace(p: { name: string; lat: number; lon: number; label?: string; radiusKm?: number; minMag?: number }): SavedLocation {
  const existing = getState().prefs.saved.find((l) => Math.abs(l.lat - p.lat) < 0.005 && Math.abs(l.lon - p.lon) < 0.005);
  if (existing) return existing;
  const loc: SavedLocation = { id: `loc${Date.now()}`, label: p.label ?? '', place: p.name, lat: p.lat, lon: p.lon, enabled: true, radiusKm: p.radiusKm ?? 100, minMag: p.minMag ?? 3.5 };
  updatePrefs((x) => ({ ...x, saved: [...x.saved, loc] }));
  return loc;
}

export function touchState() { setState((s) => ({ updatedAt: { ...s.updatedAt } })); return getState(); }
