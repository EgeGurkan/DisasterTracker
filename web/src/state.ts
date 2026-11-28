import { useEffect, useState } from 'preact/hooks';
import type { DeviceEnv, DevicePrefs, HazardFilter, Lang, ThemeMode } from '../../shared/src/types.ts';
import { defaultPrefs, sanitizePrefs } from '../../shared/src/defaults.ts';
import { bindLangGetter, detectDeviceLang } from './i18n.ts';

export interface Contact { id: string; name: string; phone: string }
export interface KitItemState { have: boolean | null; qty: number; checkedAt: string | null; remindAt: string | null; note: string }
export interface Filters { hazard: HazardFilter; region: 'world' | 'country'; country: string; hours: number; minMag: number; source: string }
export interface Draft { kind: 'safe' | 'danger'; text: string; createdAt: number; withLocation: boolean }

export interface LocalState {
  device: { id: string; key: string } | null;
  label: string;
  env: DeviceEnv;
  prefs: DevicePrefs;
  lang: Lang;
  langExplicit: boolean;
  theme: ThemeMode;
  textScale: number;
  reduceMotion: boolean;
  contacts: Contact[];
  household: { adults: number; children: number; elderly: number; disabled: number; pets: number };
  kit: Record<string, KitItemState>;
  customKit: { id: string; title: string; spec: string }[];
  guideChecks: Record<string, boolean>;
  plan: { meetingPoint: string; outOfCityContact: string; assemblyArea: string; notes: string; updatedAt: string | null };
  filters: Filters;
  chat: { nick: string; joined: string[]; muted: string[]; blocked: string[] };
  draft: Draft | null;
  emergencyContext: 'inside' | 'outside' | 'vehicle' | 'limited';
  whistle: { mode: 'continuous' | 'sos'; vibrate: boolean };
  lastTestDeliveryId: string | null;
  updatedAt: Record<string, number>;
}

const KEY = 'afet:v1';
const VALID_THEMES: ThemeMode[] = ['system', 'light', 'dark', 'amoled'];

function initial(): LocalState {
  const detected = detectDeviceLang();
  const prefs = { ...defaultPrefs(), lang: detected };
  return {
    device: null,
    label: detected === 'en' ? 'My Phone' : 'Telefonum',
    env: 'production',
    prefs,
    lang: detected,
    langExplicit: false,
    theme: 'system',
    textScale: 1,
    reduceMotion: false,
    contacts: [],
    household: { adults: 2, children: 0, elderly: 0, disabled: 0, pets: 0 },
    kit: {},
    customKit: [],
    guideChecks: {},
    plan: { meetingPoint: '', outOfCityContact: '', assemblyArea: '', notes: '', updatedAt: null },
    // İlk açılış: Türkçe cihazda Türkiye + yalnız deprem; diğer dillerde Dünya + tüm afetler.
    filters: {
      hazard: detected === 'tr' ? 'earthquake' : 'all',
      region: detected === 'tr' ? 'country' : 'world',
      country: 'TR', hours: 24, minMag: 0, source: '',
    },
    chat: { nick: '', joined: [], muted: [], blocked: [] },
    draft: null,
    emergencyContext: 'inside',
    whistle: { mode: 'continuous', vibrate: true },
    lastTestDeliveryId: null,
    updatedAt: {},
  };
}

function load(): LocalState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initial();
    const parsed = JSON.parse(raw) as Partial<LocalState>;
    const base = initial();
    const explicit = parsed.langExplicit === true && (parsed.lang === 'tr' || parsed.lang === 'en');
    const resolvedLang: Lang = explicit ? parsed.lang! : detectDeviceLang();
    const theme: ThemeMode = VALID_THEMES.includes(parsed.theme as ThemeMode) ? (parsed.theme as ThemeMode) : 'system';
    const rawRegion = (parsed.filters as { region?: string } | undefined)?.region;
    const migratedRegion: Filters['region'] =
      rawRegion === 'world' || rawRegion === 'all' ? 'world'
      : rawRegion === 'country' || rawRegion === 'tr' ? 'country'
      : base.filters.region;
    const s: LocalState = {
      ...base,
      ...parsed,
      lang: resolvedLang,
      langExplicit: explicit,
      theme,
      filters: {
        ...base.filters,
        ...(parsed.filters ?? {}),
        hazard: parsed.filters?.hazard ?? base.filters.hazard,
        region: migratedRegion,
        country: parsed.filters?.country || 'TR',
      },
      prefs: sanitizePrefs({ ...(parsed.prefs ?? {}), lang: resolvedLang }),
    };
    return s;
  } catch {
    return initial();
  }
}

let state: LocalState = load();
bindLangGetter(() => state.lang);
const subs = new Set<() => void>();

export function getState(): LocalState { return state; }

export function setState(fn: (s: LocalState) => Partial<LocalState>): void {
  const patch = fn(state);
  state = { ...state, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* özel pencere / dolu depolama: oturum içinde çalışmaya devam */ }
  subs.forEach((f) => f());
}

export function setLang(next: Lang | 'auto'): void {
  if (next === 'auto') {
    const detected = detectDeviceLang();
    setState((s) => ({
      lang: detected,
      langExplicit: false,
      prefs: sanitizePrefs({ ...s.prefs, lang: detected }),
      updatedAt: { ...s.updatedAt, prefs: Date.now() },
    }));
    return;
  }
  setState((s) => ({
    lang: next,
    langExplicit: true,
    prefs: sanitizePrefs({ ...s.prefs, lang: next }),
    updatedAt: { ...s.updatedAt, prefs: Date.now() },
  }));
}

export function setTheme(theme: ThemeMode): void {
  setState(() => ({ theme }));
}

export function cycleTheme(): ThemeMode {
  const order: ThemeMode[] = ['light', 'dark', 'amoled', 'system'];
  const next = order[(order.indexOf(state.theme) + 1) % order.length]!;
  setTheme(next);
  return next;
}

export function updatePrefs(fn: (p: DevicePrefs) => DevicePrefs): void {
  setState((s) => ({ prefs: sanitizePrefs({ ...fn(s.prefs), lang: s.lang }), updatedAt: { ...s.updatedAt, prefs: Date.now() } }));
}

export function useAppState(): LocalState {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    subs.add(f);
    return () => { subs.delete(f); };
  }, []);
  return state;
}

export function subscribe(f: () => void): () => void {
  subs.add(f);
  return () => subs.delete(f);
}

export function resetLocal(): void {
  try { localStorage.removeItem(KEY); } catch { /* yoksay */ }
  state = initial();
  subs.forEach((f) => f());
}
