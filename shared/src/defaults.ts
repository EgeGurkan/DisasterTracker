import type { ChannelKey, DevicePrefs, Lang } from './types.ts';

export const RADIUS_SHORTCUTS = [25, 50, 100, 150] as const;

export interface ChannelDef {
  key: ChannelKey;
  title: string;
  titleEn: string;
  example: string;
  exampleEn: string;
  critical?: boolean;
}

export const CHANNELS: ChannelDef[] = [
  {
    key: 'depremYakin',
    title: 'Depremler · yakın ve kayıtlı konumlar',
    titleEn: 'Earthquakes · nearby and saved locations',
    example: 'İzmir’e 42 km uzaklıkta deprem kaydedildi — M 4,1 (ML) · 14:32 · Kaynak: AFAD',
    exampleEn: 'Earthquake recorded 42 km from Izmir — M 4.1 (ML) · 14:32 · Source: AFAD',
  },
  {
    key: 'depremDunya',
    title: 'Depremler · dünya geneli',
    titleEn: 'Earthquakes · worldwide',
    example: 'Dünya genelinde deprem — Japonya · M 6,8 (Mw) · 03:12 · Kaynak: USGS',
    exampleEn: 'Worldwide earthquake — Japan · M 6.8 (Mw) · 03:12 · Source: USGS',
  },
  {
    key: 'uyarilar',
    title: 'Uyarılar · yetkili sarsıntı erken uyarısı',
    titleEn: 'Alerts · authorized earthquake early warning',
    example: 'Bulunduğun bölge için sarsıntı uyarısı — Çök, Kapan, Tutun. Kaynak: yetkili sağlayıcı',
    exampleEn: 'Shaking alert for your area — Drop, Cover, Hold On. Source: authorized provider',
    critical: true,
  },
  {
    key: 'harita',
    title: 'Harita · izlenen katman güncellemeleri',
    titleEn: 'Map · watched layer updates',
    example: 'Harita: AFAD tehlike katmanı güncellendi (yayın tarihi 12.11.2026)',
    exampleEn: 'Map: AFAD hazard layer updated (published 12.11.2026)',
  },
  {
    key: 'raporlar',
    title: 'Raporlar · haftalık özet',
    titleEn: 'Reports · weekly summary',
    example: 'Bu hafta Türkiye’de 812 deprem; en büyüğü M 4,6 Kozan (Adana)',
    exampleEn: '812 earthquakes in Türkiye this week; largest M 4.6 Kozan (Adana)',
  },
  {
    key: 'sismikAg',
    title: 'Sismik Ağ · takip edilen istasyon durumu',
    titleEn: 'Seismic Network · watched station status',
    example: 'KO.ISK istasyonundan 20 dakikadır veri yok',
    exampleEn: 'No data from station KO.ISK for 20 minutes',
  },
  {
    key: 'sohbet',
    title: 'Sohbet · katıldığın odalar',
    titleEn: 'Chat · joined community rooms',
    example: 'Topluluk · Ege odası: 3 yeni ileti',
    exampleEn: 'Community · Aegean room: 3 new messages',
  },
  {
    key: 'ayarlar',
    title: 'Ayarlar · teknik durum hatırlatmaları',
    titleEn: 'Settings · technical status reminders',
    example: 'Bildirim izni kapalı görünüyor; düzeltmek için dokun',
    exampleEn: 'Notification permission appears disabled; tap to fix',
  },
  {
    key: 'hazirlik',
    title: 'Hazırlık · çanta ve plan hatırlatmaları',
    titleEn: 'Preparedness · kit and plan reminders',
    example: 'Afet çantandaki su için kontrol tarihi geldi',
    exampleEn: 'Check date reached for water in your emergency kit',
  },
];

export function getChannels(lang: Lang): { key: ChannelKey; title: string; example: string; critical?: boolean }[] {
  return CHANNELS.map((c) => ({
    key: c.key,
    title: lang === 'en' ? c.titleEn : c.title,
    example: lang === 'en' ? c.exampleEn : c.example,
    critical: c.critical,
  }));
}

export function defaultPrefs(): DevicePrefs {
  return {
    lang: 'tr',
    active: { enabled: true, radiusKm: 100, minMag: 3.5, permission: 'unknown', lat: null, lon: null, measuredAt: null, accuracyM: null },
    saved: [],
    world: { enabled: true, minMag: 6.5 },
    eew: { enabled: true, maxKm: null, remoteSound: false },
    channels: {
      depremYakin: true, depremDunya: true, uyarilar: true, harita: false, raporlar: false,
      sismikAg: false, sohbet: false, ayarlar: true, hazirlik: true,
    },
    sound: true,
    vibration: true,
    quietHours: { enabled: false, start: '23:00', end: '07:00' },
  };
}

/** Sunucuya gelen tercihleri doğrular ve eksikleri varsayılanla tamamlar. */
export function sanitizePrefs(input: unknown): DevicePrefs {
  const d = defaultPrefs();
  const o = (input && typeof input === 'object' ? input : {}) as Partial<DevicePrefs>;
  const num = (v: unknown, def: number, min: number, max: number) => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
  };
  const lang: Lang = o.lang === 'en' ? 'en' : 'tr';
  const a = (o.active ?? {}) as Partial<DevicePrefs['active']>;
  const perm = ['granted', 'denied', 'prompt', 'unknown'].includes(a.permission as string) ? a.permission! : 'unknown';
  const active = {
    enabled: a.enabled ?? d.active.enabled,
    radiusKm: num(a.radiusKm, d.active.radiusKm, 1, 2000),
    minMag: num(a.minMag, d.active.minMag, 0, 10),
    permission: perm,
    lat: a.lat == null ? null : num(a.lat, 0, -90, 90),
    lon: a.lon == null ? null : num(a.lon, 0, -180, 180),
    measuredAt: typeof a.measuredAt === 'string' && !Number.isNaN(Date.parse(a.measuredAt)) ? a.measuredAt : null,
    accuracyM: a.accuracyM == null ? null : num(a.accuracyM, 0, 0, 1e6),
  };
  const saved = Array.isArray(o.saved) ? o.saved.slice(0, 10).map((l, i) => ({
    id: typeof l?.id === 'string' && l.id ? l.id.slice(0, 40) : `loc${i}`,
    label: String(l?.label ?? '').slice(0, 40),
    place: String(l?.place ?? '').slice(0, 60),
    lat: num(l?.lat, 0, -90, 90),
    lon: num(l?.lon, 0, -180, 180),
    enabled: l?.enabled !== false,
    radiusKm: num(l?.radiusKm, 100, 1, 2000),
    minMag: num(l?.minMag, 3.5, 0, 10),
  })) : [];
  const w = (o.world ?? {}) as Partial<DevicePrefs['world']>;
  const e = (o.eew ?? {}) as Partial<DevicePrefs['eew']>;
  const ch = { ...d.channels };
  for (const k of Object.keys(ch) as (keyof typeof ch)[]) {
    if (typeof o.channels?.[k] === 'boolean') ch[k] = o.channels[k];
  }
  const qh = (o.quietHours ?? {}) as Partial<DevicePrefs['quietHours']>;
  const hm = (v: unknown, def: string) => (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : def);
  return {
    lang,
    active,
    saved,
    world: { enabled: w.enabled ?? d.world.enabled, minMag: num(w.minMag, d.world.minMag, 0, 10) },
    eew: { enabled: e.enabled ?? d.eew.enabled, maxKm: e.maxKm == null ? null : num(e.maxKm, 100, 1, 2000), remoteSound: !!e.remoteSound },
    channels: ch,
    sound: o.sound ?? d.sound,
    vibration: o.vibration ?? d.vibration,
    quietHours: { enabled: !!qh.enabled, start: hm(qh.start, d.quietHours.start), end: hm(qh.end, d.quietHours.end) },
  };
}
