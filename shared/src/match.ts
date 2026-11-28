// Bildirim eşleştirme kuralları. Sunucu, web ve mobil aynı kodu kullanır
// (sunucu karar verir; istemciler "Bu bildirimi neden aldım?" açıklamasını aynı kurallarla gösterir).

import type {
  ActiveLocationPrefs, CatalogMatch, DevicePrefs, EewMatch, EewMessage, EventSummary, Lang, MatchReason,
} from './types.ts';
import { comparableKm, haversineKm } from './geo.ts';
import { dative, formatKm, formatMag, formatTimeTR } from './turkish.ts';

/** Aktif konum bu süreden eskiyse eşleştirmede kullanılmaz. */
export const ACTIVE_LOCATION_MAX_AGE_MS = 6 * 3600_000;
/** Oluş zamanı bundan eski kayıtlar için yeni bildirim üretilmez (geç alım/geri doldurma). */
export const MAX_NOTIFY_AGE_MS = 30 * 60_000;

export function isActiveLocationUsable(a: ActiveLocationPrefs, nowMs: number): boolean {
  if (!a.enabled || a.permission !== 'granted') return false;
  if (a.lat == null || a.lon == null || !a.measuredAt) return false;
  const age = nowMs - new Date(a.measuredAt).getTime();
  return age >= -60_000 && age <= ACTIVE_LOCATION_MAX_AGE_MS;
}

function within(distanceKm: number, radiusKm: number): boolean {
  return comparableKm(distanceKm) <= radiusKm;
}

function magOk(m: number | null, min: number): boolean {
  // Büyüklüğü eksik kayıt hiçbir eşiği karşılamış sayılmaz.
  return m != null && Number.isFinite(m) && Math.round(m * 10) / 10 >= min;
}

/**
 * Bir katalog olayının cihaz tercihleriyle eşleşip eşleşmediğini döner.
 * Yakın konum ve dünya kuralları birbirinden bağımsızdır; eşleşen tüm nedenler toplanır,
 * cihaza tek bildirim gider.
 */
export function matchCatalogEvent(ev: EventSummary, prefs: DevicePrefs, nowMs: number): CatalogMatch | null {
  if (ev.status !== 'active') return null;
  const reasons: MatchReason[] = [];

  for (const loc of prefs.saved) {
    if (!loc.enabled) continue;
    const d = haversineKm(loc.lat, loc.lon, ev.lat, ev.lon);
    if (within(d, loc.radiusKm) && magOk(ev.magnitude, loc.minMag)) {
      reasons.push({ kind: 'saved', locationId: loc.id, label: loc.label, place: loc.place, distanceKm: d, radiusKm: loc.radiusKm, minMag: loc.minMag });
    }
  }

  const a = prefs.active;
  if (isActiveLocationUsable(a, nowMs)) {
    const d = haversineKm(a.lat!, a.lon!, ev.lat, ev.lon);
    if (within(d, a.radiusKm) && magOk(ev.magnitude, a.minMag)) {
      reasons.push({ kind: 'active', distanceKm: d, radiusKm: a.radiusKm, minMag: a.minMag, measuredAt: a.measuredAt!, accuracyM: a.accuracyM });
    }
  }

  if (prefs.world.enabled && magOk(ev.magnitude, prefs.world.minMag)) {
    reasons.push({ kind: 'world', minMag: prefs.world.minMag });
  }

  if (reasons.length === 0) return null;
  const local = reasons
    .filter((r): r is Exclude<MatchReason, { kind: 'world' }> => r.kind !== 'world')
    .sort((x, y) => x.distanceKm - y.distanceKm);
  const primary = local[0] ?? reasons[0]!;
  return { reasons, primary };
}

/** Kayıtlı yerin görünen adı: isteğe bağlı kullanıcı adı + yer adı ("Ev · Kadıköy, İstanbul" veya yalnız "İzmir"). */
export function placeName(label: string, place: string, lang: Lang = 'tr'): string {
  const l = label.trim(), p = place.trim();
  if (l && p && l !== p) return `${l} · ${p}`;
  return l || p || (lang === 'en' ? 'Saved place' : 'Kayıtlı yer');
}

export function reasonLabel(r: MatchReason, lang: Lang = 'tr'): string {
  switch (r.kind) {
    case 'saved': return placeName(r.label, r.place, lang);
    case 'active': return lang === 'en' ? 'Your current location' : 'Mevcut konumun';
    case 'world': return lang === 'en' ? 'Worldwide' : 'Dünya geneli';
  }
}

export function reasonExplain(r: MatchReason, lang: Lang = 'tr'): string {
  if (lang === 'en') {
    switch (r.kind) {
      case 'saved':
        return `${reasonLabel(r, 'en')}: epicenter ${formatKm(r.distanceKm, 'en')} away (limit ${r.radiusKm} km), magnitude threshold M ${r.minMag}`;
      case 'active':
        return `Your current location: ${formatKm(r.distanceKm, 'en')} away (limit ${r.radiusKm} km), threshold M ${r.minMag}; measured at ${formatTimeTR(r.measuredAt, false, 'en')}${r.accuracyM ? `, ±${Math.round(r.accuracyM)} m` : ''}`;
      case 'world':
        return `Worldwide threshold: M ${r.minMag} and above (location-independent)`;
    }
  }
  switch (r.kind) {
    case 'saved':
      return `${reasonLabel(r, 'tr')}: merkez üssü ${formatKm(r.distanceKm)} uzaklıkta (sınır ${r.radiusKm} km), büyüklük eşiği M ${String(r.minMag).replace('.', ',')}`;
    case 'active':
      return `Mevcut konumun: ${formatKm(r.distanceKm)} uzaklıkta (sınır ${r.radiusKm} km), eşik M ${String(r.minMag).replace('.', ',')}; konum ölçümü ${formatTimeTR(r.measuredAt)}${r.accuracyM ? `, ±${Math.round(r.accuracyM)} m` : ''}`;
    case 'world':
      return `Dünya geneli eşiği: M ${String(r.minMag).replace('.', ',')} ve üzeri (konumdan bağımsız)`;
  }
}

/** Kilit ekranında okunacak başlık ve metin. */
export function buildCatalogText(ev: EventSummary, m: CatalogMatch, lang: Lang = 'tr'): { title: string; body: string } {
  const p = m.primary;
  const testPrefix = ev.isTest ? 'TEST · ' : '';
  if (lang === 'en') {
    let title: string;
    if (p.kind === 'saved') {
      const head = placeName(p.label, p.place, 'en');
      title = `Earthquake recorded ${formatKm(p.distanceKm, 'en')} from ${head}`;
    } else if (p.kind === 'active') {
      title = `Earthquake recorded ${formatKm(p.distanceKm, 'en')} from your current location`;
    } else {
      title = 'Worldwide earthquake';
    }
    const parts = p.kind === 'world'
      ? [ev.region || ev.place, formatMag(ev.magnitude, ev.magType, 'en'), formatTimeTR(ev.originTime, false, 'en'), `Source: ${ev.summarySource}`]
      : [formatMag(ev.magnitude, ev.magType, 'en'), formatTimeTR(ev.originTime, false, 'en'), ev.place, `Source: ${ev.summarySource}`];
    const others = m.reasons.filter((r) => r !== p).map((r) => reasonLabel(r, 'en'));
    let body = parts.join(' · ');
    if (others.length) body += ` · Also: ${others.join(', ')}`;
    return { title: testPrefix + title, body };
  }

  let title: string;
  if (p.kind === 'saved') {
    const head = p.place && p.label.trim() ? `${p.label} · ${dative(p.place)}` : dative(p.place || p.label);
    title = `${head} ${formatKm(p.distanceKm)} uzaklıkta deprem kaydedildi`;
  } else if (p.kind === 'active') {
    title = `Mevcut konumuna ${formatKm(p.distanceKm)} uzaklıkta deprem kaydedildi`;
  } else {
    title = 'Dünya genelinde deprem';
  }
  const parts = p.kind === 'world'
    ? [ev.region || ev.place, formatMag(ev.magnitude, ev.magType), formatTimeTR(ev.originTime), `Kaynak: ${ev.summarySource}`]
    : [formatMag(ev.magnitude, ev.magType), formatTimeTR(ev.originTime), ev.place, `Kaynak: ${ev.summarySource}`];
  const others = m.reasons.filter((r) => r !== p).map((r) => reasonLabel(r, 'tr'));
  let body = parts.join(' · ');
  if (others.length) body += ` · Ayrıca: ${others.join(', ')}`;
  return { title: testPrefix + title, body };
}

export function buildRetractionText(ev: EventSummary, lang: Lang = 'tr'): { title: string; body: string } {
  if (lang === 'en') {
    return {
      title: `${ev.isTest ? 'TEST · ' : ''}Earthquake record retracted`,
      body: `${ev.place} · ${formatTimeTR(ev.originTime, false, 'en')} record was retracted by the source (${ev.summarySource}). Disregard the previous notification.`,
    };
  }
  return {
    title: `${ev.isTest ? 'TEST · ' : ''}Deprem kaydı geri çekildi`,
    body: `${ev.place} · ${formatTimeTR(ev.originTime)} kaydı kaynak (${ev.summarySource}) tarafından geri çekildi. Önceki bildirimi dikkate alma.`,
  };
}

// ---- Erken uyarı ----

export function pointInEewArea(lat: number, lon: number, msg: EewMessage): boolean {
  return msg.area.circles.some((c) => comparableKm(haversineKm(c.lat, c.lon, lat, lon)) <= c.radiusKm);
}

/**
 * Erken uyarı yalnız sağlayıcının hedef alanında kalan aktif/kayıtlı noktalar için eşleşir.
 * Kullanıcının isteğe bağlı ek km sınırı merkez üssüne göre uygulanır.
 * Aktif konum hedef alandaysa önceliklidir.
 */
export function matchEew(msg: EewMessage, prefs: DevicePrefs, nowMs: number): EewMatch | null {
  if (!prefs.eew.enabled) return null;
  const extraOk = (lat: number, lon: number): { ok: boolean; d: number | null } => {
    const d = msg.epicenter ? haversineKm(msg.epicenter.lat, msg.epicenter.lon, lat, lon) : null;
    if (prefs.eew.maxKm != null && d != null && comparableKm(d) > prefs.eew.maxKm) return { ok: false, d };
    return { ok: true, d };
  };
  const a = prefs.active;
  if (isActiveLocationUsable(a, nowMs) && pointInEewArea(a.lat!, a.lon!, msg)) {
    const x = extraOk(a.lat!, a.lon!);
    if (x.ok) return { target: { kind: 'active' }, distanceKm: x.d };
  }
  for (const loc of prefs.saved) {
    if (!loc.enabled) continue;
    if (pointInEewArea(loc.lat, loc.lon, msg)) {
      const x = extraOk(loc.lat, loc.lon);
      if (x.ok) return { target: { kind: 'saved', locationId: loc.id, label: loc.label, place: loc.place }, distanceKm: x.d };
    }
  }
  return null;
}

export function buildEewText(msg: EewMessage, m: EewMatch, lang: Lang = 'tr'): { title: string; body: string } {
  const test = msg.status === 'test' ? 'TEST · ' : '';
  if (lang === 'en') {
    if (msg.msgType === 'cancel') {
      return { title: `${test}Shaking alert cancelled`, body: `${msg.provider} cancelled the previous alert.` };
    }
    const who = m.target.kind === 'active'
      ? 'Shaking alert for your area'
      : `Shaking alert for ${placeName(m.target.label, m.target.place, 'en')}`;
    const step = m.target.kind === 'active' ? 'Drop, Cover, Hold On.' : 'Try reaching loved ones after shaking stops.';
    return { title: test + who, body: `${step} Source: ${msg.provider}.${msg.headline ? ' ' + msg.headline : ''}` };
  }
  if (msg.msgType === 'cancel') {
    return { title: `${test}Sarsıntı uyarısı geri çekildi`, body: `${msg.provider} önceki uyarıyı geri çekti.` };
  }
  const who = m.target.kind === 'active'
    ? 'Bulunduğun bölge için sarsıntı uyarısı'
    : `${placeName(m.target.label, m.target.place)} için sarsıntı uyarısı`;
  const step = m.target.kind === 'active' ? 'Çök, Kapan, Tutun.' : 'Yakınlarına ulaşmayı sarsıntı geçtikten sonra dene.';
  return { title: test + who, body: `${step} Kaynak: ${msg.provider}.${msg.headline ? ' ' + msg.headline : ''}` };
}

export const EEW_NOT_AVAILABLE_TEXT =
  'Bu konumda sarsıntı erken uyarısı sunulamıyor. Yakın deprem bildirimlerini kullanabilirsin.';

export const EEW_NOT_AVAILABLE_TEXT_EN =
  'Earthquake early warning is not available at this location. You can use nearby earthquake notifications.';

export function eewNotAvailableText(lang: Lang = 'tr'): string {
  return lang === 'en' ? EEW_NOT_AVAILABLE_TEXT_EN : EEW_NOT_AVAILABLE_TEXT;
}

/** Sessiz saat (Europe/Istanbul) içinde mi? Kritik erken uyarı sessiz saatten etkilenmez. */
export function inQuietHours(prefs: DevicePrefs, nowMs: number): boolean {
  if (!prefs.quietHours.enabled) return false;
  const hm = new Date(nowMs).toLocaleTimeString('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hour12: false });
  const { start, end } = prefs.quietHours;
  return start <= end ? hm >= start && hm < end : hm >= start || hm < end;
}
