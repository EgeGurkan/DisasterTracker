// Türkçe ve İngilizce biçimlendirme ve dil yardımcıları.

import type { Lang } from './types.ts';

const BACK = 'aıouâû';
const FRONT = 'eiöüî';
const VOWELS = BACK + FRONT;

function lastVowel(word: string): string | null {
  const w = word.toLocaleLowerCase('tr');
  for (let i = w.length - 1; i >= 0; i--) {
    if (VOWELS.includes(w[i]!)) return w[i]!;
  }
  return null;
}

/**
 * Özel ada kesme işaretiyle yönelme eki ekler: İzmir’e, İstanbul’a, Ankara’ya, Rize’ye.
 */
export function dative(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  const v = lastVowel(trimmed);
  const back = v ? BACK.includes(v) : false;
  const endsWithVowel = VOWELS.includes(trimmed.toLocaleLowerCase('tr').slice(-1));
  const suffix = (endsWithVowel ? 'y' : '') + (back ? 'a' : 'e');
  return `${trimmed}’${suffix}`;
}

/** Dile göre ondalık sayı biçimi: TR "4,1", EN "4.1" */
export function trNumber(n: number, digits = 1, lang: Lang = 'tr'): string {
  return n.toLocaleString(lang === 'en' ? 'en-US' : 'tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatMag(m: number | null, type: string | null, lang: Lang = 'tr'): string {
  if (m == null) return lang === 'en' ? 'Magnitude unknown' : 'Büyüklük bilinmiyor';
  return `M ${trNumber(m, 1, lang)}${type ? ` (${type})` : ''}`;
}

export function formatKm(km: number, lang: Lang = 'tr'): string {
  if (km < 10) return `${trNumber(km, 1, lang)} km`;
  return `${Math.round(km).toLocaleString(lang === 'en' ? 'en-US' : 'tr-TR')} km`;
}

export function formatDepth(d: number | null, lang: Lang = 'tr'): string {
  if (d == null) return lang === 'en' ? 'Depth unknown' : 'Derinlik bilinmiyor';
  return lang === 'en' ? `${trNumber(d, 1, 'en')} km depth` : `${trNumber(d, 1, 'tr')} km derinlik`;
}

const TZ = 'Europe/Istanbul';

export function formatTimeTR(iso: string | number, withSeconds = false, lang: Lang = 'tr'): string {
  return new Date(iso).toLocaleTimeString(lang === 'en' ? 'en-GB' : 'tr-TR', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false, ...(withSeconds ? { second: '2-digit' } : {}),
  });
}

export function formatDateTimeTR(iso: string | number, withSeconds = false, lang: Lang = 'tr'): string {
  return new Date(iso).toLocaleString(lang === 'en' ? 'en-GB' : 'tr-TR', {
    timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false, ...(withSeconds ? { second: '2-digit' } : {}),
  });
}

export function relativeTR(iso: string | number, nowMs = Date.now(), lang: Lang = 'tr'): string {
  const diff = Math.max(0, nowMs - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (lang === 'en') {
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }
  if (m < 1) return 'az önce';
  if (m < 60) return `${m} dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} sa önce`;
  return `${Math.floor(h / 24)} gün önce`;
}

/** Büyüklük sınıfı: renge her zaman etiket ve simge eşlik eder. */
export function magClass(m: number | null, lang: Lang = 'tr'): { key: 'unknown' | 'minor' | 'light' | 'moderate' | 'strong' | 'major'; label: string } {
  if (m == null) return { key: 'unknown', label: lang === 'en' ? 'Unknown' : 'Bilinmiyor' };
  if (m < 3) return { key: 'minor', label: lang === 'en' ? 'Minor' : 'Küçük' };
  if (m < 4) return { key: 'light', label: lang === 'en' ? 'Light' : 'Hafif' };
  if (m < 5) return { key: 'moderate', label: lang === 'en' ? 'Moderate' : 'Orta' };
  if (m < 6) return { key: 'strong', label: lang === 'en' ? 'Strong' : 'Güçlü' };
  return { key: 'major', label: lang === 'en' ? 'Major' : 'Büyük' };
}
