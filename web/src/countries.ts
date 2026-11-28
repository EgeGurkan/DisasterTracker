// Ülke filtresi listesi ve coğrafi sınırları (Dünya / Ülke seçici için).
import { inTurkeyRegion } from '../../shared/src/geo.ts';
import type { Lang } from '../../shared/src/types.ts';

export interface CountryOption {
  code: string;
  tr: string;
  en: string;
  /** [minLat, maxLat, minLon, maxLon] */
  bbox: [number, number, number, number];
  /** [lat, lon, zoom] */
  center: [number, number, number];
  /** Metin eşleşmesi için ek anahtar kelimeler (küçük harf). */
  keywords?: string[];
}

export const COUNTRIES: CountryOption[] = [
  { code: 'TR', tr: 'Türkiye', en: 'Türkiye', bbox: [35.0, 43.0, 25.0, 45.5], center: [39.0, 35.0, 5], keywords: ['turkey', 'türkiye', 'turkiye'] },
  { code: 'GR', tr: 'Yunanistan', en: 'Greece', bbox: [34.5, 41.8, 19.2, 28.4], center: [38.3, 23.8, 6], keywords: ['greece', 'aegean', 'crete', 'dodecanese'] },
  { code: 'IT', tr: 'İtalya', en: 'Italy', bbox: [36.5, 47.2, 6.6, 18.8], center: [42.0, 12.8, 5], keywords: ['italy', 'sicily', 'tyrrhenian'] },
  { code: 'JP', tr: 'Japonya', en: 'Japan', bbox: [24.0, 45.8, 122.8, 146.5], center: [36.2, 138.2, 5], keywords: ['japan', 'honshu', 'hokkaido', 'kyushu', 'ryukyu'] },
  { code: 'US', tr: 'ABD', en: 'United States', bbox: [18.5, 71.5, -179.5, -66.5], center: [39.5, -98.3, 4], keywords: ['usa', 'united states', 'california', 'alaska', 'hawaii', 'texas', 'oklahoma', 'florida'] },
  { code: 'NZ', tr: 'Yeni Zelanda', en: 'New Zealand', bbox: [-47.5, -34.0, 165.5, 179.0], center: [-41.2, 173.0, 5], keywords: ['new zealand', 'kermadec'] },
  { code: 'ID', tr: 'Endonezya', en: 'Indonesia', bbox: [-11.5, 6.5, 94.5, 141.5], center: [-2.0, 118.0, 4], keywords: ['indonesia', 'sumatra', 'java', 'sulawesi', 'maluku'] },
  { code: 'CL', tr: 'Şili', en: 'Chile', bbox: [-56.0, -17.3, -76.0, -66.5], center: [-33.4, -70.6, 4], keywords: ['chile'] },
  { code: 'MX', tr: 'Meksika', en: 'Mexico', bbox: [14.3, 32.8, -118.5, -86.5], center: [23.6, -102.5, 5], keywords: ['mexico', 'oaxaca', 'chiapas', 'guerrero'] },
  { code: 'PH', tr: 'Filipinler', en: 'Philippines', bbox: [4.5, 21.2, 116.5, 127.2], center: [12.8, 121.8, 5], keywords: ['philippines', 'luzon', 'mindanao'] },
  { code: 'IR', tr: 'İran', en: 'Iran', bbox: [25.0, 39.8, 44.0, 63.5], center: [32.4, 53.7, 5], keywords: ['iran'] },
  { code: 'ES', tr: 'İspanya', en: 'Spain', bbox: [27.5, 43.9, -18.5, 4.5], center: [40.2, -3.7, 5], keywords: ['spain', 'canary'] },
  { code: 'PT', tr: 'Portekiz', en: 'Portugal', bbox: [32.3, 42.2, -31.5, -6.1], center: [39.5, -8.0, 6], keywords: ['portugal', 'azores'] },
  { code: 'FR', tr: 'Fransa', en: 'France', bbox: [41.3, 51.2, -5.2, 9.6], center: [46.6, 2.2, 5], keywords: ['france'] },
  { code: 'DE', tr: 'Almanya', en: 'Germany', bbox: [47.2, 55.1, 5.8, 15.1], center: [51.1, 10.4, 5], keywords: ['germany'] },
  { code: 'GB', tr: 'Birleşik Krallık', en: 'United Kingdom', bbox: [49.8, 60.9, -8.2, 1.8], center: [54.5, -2.5, 5], keywords: ['united kingdom', 'uk', 'england', 'scotland'] },
  { code: 'CA', tr: 'Kanada', en: 'Canada', bbox: [41.7, 83.2, -141.0, -52.5], center: [56.1, -106.3, 3], keywords: ['canada'] },
  { code: 'AU', tr: 'Avustralya', en: 'Australia', bbox: [-44.0, -10.5, 112.5, 154.0], center: [-25.3, 133.8, 4], keywords: ['australia'] },
  { code: 'PE', tr: 'Peru', en: 'Peru', bbox: [-18.4, -0.0, -81.4, -68.6], center: [-9.2, -75.0, 5], keywords: ['peru'] },
  { code: 'TW', tr: 'Tayvan', en: 'Taiwan', bbox: [21.8, 25.4, 119.9, 122.2], center: [23.7, 121.0, 7], keywords: ['taiwan'] },
  { code: 'IN', tr: 'Hindistan', en: 'India', bbox: [6.7, 35.6, 68.1, 97.4], center: [21.0, 79.0, 4], keywords: ['india'] },
  { code: 'CN', tr: 'Çin', en: 'China', bbox: [18.1, 53.6, 73.5, 135.1], center: [35.8, 104.2, 4], keywords: ['china'] },
  { code: 'IS', tr: 'İzlanda', en: 'Iceland', bbox: [63.2, 66.6, -24.6, -13.4], center: [64.9, -18.5, 6], keywords: ['iceland'] },
  { code: 'CY', tr: 'Kıbrıs', en: 'Cyprus', bbox: [34.4, 35.8, 32.1, 34.8], center: [35.1, 33.4, 8], keywords: ['cyprus'] },
  { code: 'AZ', tr: 'Azerbaycan', en: 'Azerbaijan', bbox: [38.3, 41.9, 44.7, 50.6], center: [40.2, 47.6, 7], keywords: ['azerbaijan'] },
];

export function getCountry(code: string | undefined): CountryOption {
  return COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0]!;
}

export function countryLabel(code: string | undefined, lang: Lang): string {
  const c = getCountry(code);
  return lang === 'en' ? c.en : c.tr;
}

export function inCountryBounds(lat: number, lon: number, code: string | undefined, placeText?: string | null): boolean {
  const c = getCountry(code);
  if (c.code === 'TR') return inTurkeyRegion(lat, lon);
  const [minLat, maxLat, minLon, maxLon] = c.bbox;
  if (lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon) return true;
  if (placeText && c.keywords?.length) {
    const low = placeText.toLowerCase();
    return c.keywords.some((k) => low.includes(k));
  }
  return false;
}
