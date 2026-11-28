// Web dil algılama ve TR/EN çeviri yardımcıları.
// Kural: Cihaz dili Türkçe (tr*) ise Türkçe açılır; diğer tüm dillerde İngilizce (en) açılır.

import type { Lang } from '../../shared/src/types.ts';
import {
  formatDateTimeTR, formatDepth, formatKm, formatMag, formatTimeTR, magClass, relativeTR, trNumber,
} from '../../shared/src/turkish.ts';

export function detectDeviceLang(): Lang {
  if (typeof navigator === 'undefined') return 'tr';
  const primary = (navigator.languages?.[0] || navigator.language || '').trim().toLowerCase();
  return primary.startsWith('tr') ? 'tr' : 'en';
}

let currentLangGetter: () => Lang = detectDeviceLang;
export function bindLangGetter(fn: () => Lang): void {
  currentLangGetter = fn;
}

export function lang(): Lang {
  return currentLangGetter();
}

export function isEn(): boolean {
  return currentLangGetter() === 'en';
}

export function tx(tr: string, en: string): string {
  return currentLangGetter() === 'en' ? en : tr;
}

export function txVal<T>(tr: T, en: T): T {
  return currentLangGetter() === 'en' ? en : tr;
}

export const fmtNum = (n: number, digits = 1) => trNumber(n, digits, currentLangGetter());
export const fmtMag = (m: number | null, type: string | null) => formatMag(m, type, currentLangGetter());
export const fmtKm = (km: number) => formatKm(km, currentLangGetter());
export const fmtDepth = (d: number | null) => formatDepth(d, currentLangGetter());
export const fmtTime = (iso: string | number, withSeconds = false) => formatTimeTR(iso, withSeconds, currentLangGetter());
export const fmtDateTime = (iso: string | number, withSeconds = false) => formatDateTimeTR(iso, withSeconds, currentLangGetter());
export const fmtRel = (iso: string | number, nowMs = Date.now()) => relativeTR(iso, nowMs, currentLangGetter());
export const getMagClass = (m: number | null) => magClass(m, currentLangGetter());
export const fmtDec = (n: number) => (currentLangGetter() === 'en' ? String(n) : String(n).replace('.', ','));
