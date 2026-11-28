export const EARTH_RADIUS_KM = 6371.0088;
const RAD = Math.PI / 180;

/** Kuş uçuşu (büyük daire) uzaklığı, km. */
export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = (bLat - aLat) * RAD;
  const dLon = (bLon - aLon) * RAD;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * RAD) * Math.cos(bLat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Eşik karşılaştırmasında kullanılan uzaklık: 10 m çözünürlüğe yuvarlanır.
 * Böylece "tam 100 km" kayıt, kayan nokta hatası yüzünden 100,0000001 km sayılmaz.
 */
export function comparableKm(d: number): number {
  return Math.round(d * 100) / 100;
}

/** Bir noktadan verilen yön ve uzaklıktaki nokta (testler ve hedef alanlar için). */
export function destinationPoint(lat: number, lon: number, bearingDeg: number, distKm: number): { lat: number; lon: number } {
  const d = distKm / EARTH_RADIUS_KM;
  const b = bearingDeg * RAD;
  const p1 = lat * RAD;
  const l1 = lon * RAD;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return { lat: p2 / RAD, lon: ((l2 / RAD + 540) % 360) - 180 };
}

/** Türkiye ve yakın çevresi (kaynak önceliği ve "Türkiye" filtresi için). */
export function inTurkeyRegion(lat: number, lon: number): boolean {
  return lat >= 35.0 && lat <= 43.0 && lon >= 25.0 && lon <= 45.5;
}
