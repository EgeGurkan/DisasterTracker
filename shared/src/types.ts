// Ortak veri modeli. Deprem ve diğer doğal afet türlerini kapsar.

export type HazardType = 'earthquake' | 'flood' | 'storm' | 'tornado' | 'wildfire' | 'volcano' | 'tsunami';
export type HazardFilter = 'all' | HazardType;

export interface DisasterEvent {
  id: string;
  hazard: Exclude<HazardType, 'earthquake'>;
  title: string;
  place: string;
  region: string | null;
  originTime: string;
  updatedAt: string;
  lat: number;
  lon: number;
  severity: 'advisory' | 'watch' | 'warning' | 'severe';
  metricLabel: string | null;
  description: string | null;
  source: string;
  url: string | null;
}
export type SourceId = 'AFAD' | 'KOERI' | 'EMSC' | 'USGS' | 'GEOFON' | 'NOA' | 'INGV' | 'GEONET' | 'JMA' | 'TEST';
export type RecordStatus = 'automatic' | 'reviewed' | 'deleted' | 'unknown';
export type Lang = 'tr' | 'en';
export type ThemeMode = 'system' | 'light' | 'dark' | 'amoled';

/** Bir kurumun bir olay için yayımladığı tek kayıt (en son sürümü). */
export interface SourceRecord {
  source: SourceId;
  sourceEventId: string;
  /** Oluş zamanı, UTC ISO-8601 */
  originTime: string;
  /** Kaynağın kaydı yayımladığı/güncellediği zaman (bilinmiyorsa null) */
  sourcePublishedAt: string | null;
  lat: number;
  lon: number;
  depthKm: number | null;
  magnitude: number | null;
  magType: string | null;
  place: string;
  region: string | null;
  status: RecordStatus;
  url: string | null;
  isTest: boolean;
}

/** Birleştirilmiş (tekilleştirilmiş) fiziksel olay. */
export interface EventSummary {
  id: string;
  hazard: HazardType;
  isTest: boolean;
  originTime: string;
  lat: number;
  lon: number;
  depthKm: number | null;
  magnitude: number | null;
  magType: string | null;
  place: string;
  region: string | null;
  /** Özette kullanılan değerlerin kaynağı */
  summarySource: SourceId;
  status: 'active' | 'deleted';
  version: number;
}

export interface SavedLocation {
  id: string;
  /** İsteğe bağlı kullanıcı adı ("Ev", "İş"); boşsa yer adı kullanılır */
  label: string;
  /** Yer adı: "İzmir" */
  place: string;
  lat: number;
  lon: number;
  enabled: boolean;
  radiusKm: number;
  minMag: number;
}

export type LocationPermission = 'granted' | 'denied' | 'prompt' | 'unknown';

export interface ActiveLocationPrefs {
  enabled: boolean;
  radiusKm: number;
  minMag: number;
  permission: LocationPermission;
  lat: number | null;
  lon: number | null;
  /** Ölçüm zamanı (UTC ISO) */
  measuredAt: string | null;
  accuracyM: number | null;
}

export interface WorldPrefs {
  enabled: boolean;
  minMag: number;
}

export interface EewPrefs {
  enabled: boolean;
  /** Ek km sınırı (isteğe bağlı) */
  maxKm: number | null;
  /** Uzaktaki kayıtlı konum uyarısında ses */
  remoteSound: boolean;
}

export type ChannelKey =
  | 'depremYakin' | 'depremDunya' | 'harita' | 'raporlar' | 'uyarilar'
  | 'sismikAg' | 'sohbet' | 'ayarlar' | 'hazirlik';

export interface QuietHours {
  enabled: boolean;
  start: string; // "23:00" Europe/Istanbul
  end: string;   // "07:00"
}

export interface DevicePrefs {
  lang?: Lang;
  active: ActiveLocationPrefs;
  saved: SavedLocation[];
  world: WorldPrefs;
  eew: EewPrefs;
  channels: Record<ChannelKey, boolean>;
  sound: boolean;
  vibration: boolean;
  quietHours: QuietHours;
}

export type DeviceEnv = 'production' | 'drill';

export type MatchReason =
  | { kind: 'saved'; locationId: string; label: string; place: string; distanceKm: number; radiusKm: number; minMag: number }
  | { kind: 'active'; distanceKm: number; radiusKm: number; minMag: number; measuredAt: string; accuracyM: number | null }
  | { kind: 'world'; minMag: number };

export interface CatalogMatch {
  reasons: MatchReason[];
  primary: MatchReason;
}

export type NotificationKind = 'catalog' | 'retraction' | 'eew' | 'eew-cancel' | 'test';

/** Push yükü: hem Web Push hem FCM/APNs için aynı içerik. */
export interface PushPayload {
  v: 1;
  kind: NotificationKind;
  deliveryId: string;
  title: string;
  body: string;
  tag: string;
  url: string;
  eventId: string | null;
  alertId: string | null;
  isTest: boolean;
  /** Gösterimden önce cihazda kontrol edilen son geçerlilik (UTC ms). */
  expiresAtMs: number | null;
  /** Siren/ses gerektiren kritik uyarı mı */
  critical: boolean;
  silent: boolean;
  sentAtMs: number;
  receiptUrl: string;
}

// ---- Sarsıntı erken uyarısı ----

export interface EewArea {
  /** Sağlayıcının hedef alanı: daireler (merkez + yarıçap km) */
  circles: { lat: number; lon: number; radiusKm: number }[];
}

export interface EewMessage {
  provider: string;
  alertId: string;
  version: number;
  msgType: 'alert' | 'update' | 'cancel';
  status: 'actual' | 'test';
  issuedAt: string;
  expiresAt: string;
  epicenter: { lat: number; lon: number } | null;
  magnitude: number | null;
  area: EewArea;
  /** Sağlayıcının metni (varsa) */
  headline: string | null;
  /** Sağlayıcı imzası (HMAC-SHA256 / pilot) */
  signature: string;
}

export interface EewMatch {
  target: { kind: 'active' } | { kind: 'saved'; locationId: string; label: string; place: string };
  distanceKm: number | null;
}
