// Teslim raporu üretici: veritabanındaki gerçek gönderim kayıtlarından ve uçtan uca kanıttan
// docs/TESLIM_RAPORU.md dosyasını yazar. Çalıştır: npm run report
import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deliveryState, deliveryTimings, type DeliveryRowFull } from '../src/ops.ts';
import type { MatchReason } from '../../shared/src/types.ts';
import { reasonLabel } from '../../shared/src/match.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const dbPath = join(process.env.AFET_DATA_DIR ?? join(root, 'data'), 'afet.db');
const ms = (v: number | null) => (v == null ? 'bilinmiyor' : v < 1000 ? `${v} ms` : `${(v / 1000).toFixed(2)} sn`);
const tr = (iso: string | null) => (iso ? new Date(iso).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }) : '—');
const PLAT: Record<string, string> = { 'ios-pwa': 'iPhone · ana ekran web uyg.', 'ios-safari': 'iPhone · Safari', 'android-web': 'Android · tarayıcı', 'android-pwa': 'Android · yüklü web uyg.', 'desktop-web': 'Masaüstü', 'android-native': 'Android uygulaması', 'ios-native': 'iOS uygulaması' };

const rule = (j: string | null, kind: string) => {
  if (!j) return kind === 'test' ? 'Bildirim testi' : kind.startsWith('eew') ? 'Erken uyarı hedef alanı' : '—';
  return (JSON.parse(j) as MatchReason[]).map((r) => r.kind === 'world' ? `Dünya ≥ M ${r.minMag}` : `${reasonLabel(r)}: ${Math.round(r.distanceKm)} km ≤ ${r.radiusKm} km, ≥ M ${r.minMag}`).join(' + ');
};

let lines: string[] = [];
const L = (s = '') => lines.push(s);
L('# Teslim raporu — bildirim kanıtları');
L();
L(`Üretildi: ${tr(new Date().toISOString())} (Europe/Istanbul). Bu dosya \`npm run report\` ile veritabanındaki gerçek kayıtlardan üretilir; elle düzenlenmez.`);
L();
L('Aşama tanımları: **giriş** = olayın platforma alındığı an · **ilk gönderim** = push sağlayıcısına ilk istek · **kabul** = sağlayıcının 201/200 yanıtı (teslim sayılmaz) · **alım/gösterim** = cihazın Service Worker veya uygulamadan gönderdiği makbuz (cihaz saati, makbuz anındaki saat farkıyla düzeltilir) · **açılış** = kullanıcının bildirime dokunması.');
L();

if (existsSync(dbPath)) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const rows = db.prepare(`SELECT d.*, v.label AS device_label FROM deliveries d LEFT JOIN devices v ON v.id = d.device_id
    WHERE d.platform NOT IN ('test') ORDER BY d.queued_at`).all() as unknown as DeliveryRowFull[];
  const real = rows.filter((r) => !/emülatör/i.test(r.device_label ?? ''));
  L('## 1. Gerçek cihazlarda gönderimler');
  L();
  if (!real.length) {
    L('> Henüz gerçek cihazdan kayıt yok. README’deki “Gerçek telefon gösterimi” adımlarını uyguladığında bu tablo dolar.');
  } else {
    L('| Zaman | Bildirim (kilit ekranı başlığı) | Cihaz | Platform | Kural | Kaynak yayını→giriş | Giriş→ilk gönderim | Giriş→kabul | Giriş→alım | Giriş→gösterim | Giriş→açılış | Durum |');
    L('|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const d of real) {
      const t = deliveryTimings(d);
      L(`| ${tr(d.queued_at)} | ${d.title} | ${d.device_label} | ${PLAT[d.platform] ?? d.platform} | ${rule(d.reasons_json, d.kind)} | ${ms(t.sourceToPlatformMs)} | ${ms(t.platformToFirstSendMs)} | ${ms(t.platformToProviderAcceptMs)} | ${ms(t.platformToDeviceReceivedMs)} | ${ms(t.platformToDisplayedMs)} | ${ms(t.platformToOpenedMs)} | ${deliveryState(d)} |`);
    }
    L();
    const byPlat = new Map<string, DeliveryRowFull[]>();
    for (const d of real) byPlat.set(d.platform, [...(byPlat.get(d.platform) ?? []), d]);
    L('### Platform özeti');
    L();
    L('| Platform | Deneme | Sağlayıcı kabulü | Görünür (makbuzlu) | ≤ 15 sn görünür | Başarısız | Ölçülemeyen |');
    L('|---|---|---|---|---|---|---|');
    for (const [p, list] of byPlat) {
      const disp = list.filter((d) => d.displayed_at);
      const in15 = disp.filter((d) => (deliveryTimings(d).platformToDisplayedMs ?? 1e9) <= 15000);
      L(`| ${PLAT[p] ?? p} | ${list.length} | ${list.filter((d) => d.provider_accepted_at).length} | ${disp.length} | ${in15.length} | ${list.filter((d) => d.status === 'failed' || d.status === 'expired').length} | ${list.filter((d) => d.provider_accepted_at && !d.displayed_at).length} |`);
    }
    const failed = real.filter((d) => d.status === 'failed' || d.status === 'expired' || (d.provider_accepted_at && !d.displayed_at));
    if (failed.length) {
      L();
      L('### Başarısız, geç veya ölçülemeyen denemeler');
      L();
      for (const d of failed) L(`- ${tr(d.queued_at)} · ${d.device_label} · ${d.title} → ${deliveryState(d)}${d.error ? ` (${d.error})` : ''}${d.provider_detail ? ` · sağlayıcı: ${d.provider_detail}` : ''}`);
    }
  }
  L();
  db.close();
} else {
  L('> Veritabanı bulunamadı; sunucu henüz çalıştırılmamış.');
}

const e2ePath = join(root, 'docs/kanit/e2e-webpush.json');
L('## 2. Sunucu hattının uçtan uca kanıtı (push servisi emülatörü)');
L();
if (existsSync(e2ePath)) {
  const e = JSON.parse(readFileSync(e2ePath, 'utf8')) as { calistirma: string; not: string; kilit_ekrani: { cihaz: string; gorunen: string[] }[]; teslim: Record<string, unknown>[] };
  L(`Çalıştırma: ${tr(e.calistirma)} · ${e.not}`);
  L();
  L('| Bildirim | Cihaz | Kural | Giriş→ilk gönderim | Giriş→kabul | Giriş→gösterim |');
  L('|---|---|---|---|---|---|');
  for (const r of e.teslim) L(`| ${r.bildirim} | ${r.cihaz} | ${r.kural} | ${ms(r.ilkGonderimMs as number)} | ${ms(r.kabulMs as number)} | ${ms(r.gosterimMs as number)} |`);
  L();
  for (const k of e.kilit_ekrani) { L(`**${k.cihaz} — kilit ekranına düşen metinler:**`); k.gorunen.forEach((g) => L(`- ${g}`)); L(); }
} else {
  L('> `node server/scripts/e2e-webpush.ts` henüz çalıştırılmadı.');
}

L('## 3. Kabul senaryoları (otomatik)');
L();
L('`npm test` — şartname §10 senaryolarının sunucu tarafı (25 test): eşik/yarıçap sınırları (tam 100 km/M 3,5 bildirir; 101 km ve M 3,4 bildirmez), uzak konum başlığı, GPS kapalıyken dünya kuralı, örtüşen kurallarda tek bildirim, çift kaynak birleştirme, yakın artçıların korunması, eşiği ilk aşan revizyon, geri çekme, TEST yalıtımı, erken uyarı hedefleme/imza/süre/eski sürüm, kuyruk kurtarma, geçersiz belirteç ve 100 cihaz × 5 olay yük testi.');
L();
L('## 4. Yayın engelleri ve açık maddeler');
L();
L('- Gerçek cihaz matrisi (ön plan, arka plan, kilit ekranı, uygulama kapalı, zorla durdurma, pil tasarrufu, sessiz/odak, izin reddi) yalnız Web Push için gösterilebilir durumdadır; native APNs/FCM için Apple Developer ve Firebase hesabı gerekir (docs/DESTEK_MATRISI.md).');
L('- Türkiye için yetkili erken uyarı sağlayıcısı yok; erken uyarı yalnız imzalı TEST sağlayıcısıyla tatbikat cihazlarında çalışır.');
L('- 100 etiketli deneme/platform ve 15 sn içinde ≥ 99/100 görünür bildirim hedefi, gerçek cihaz pilotunda ölçülecek; bu rapor her çalıştırmada güncel sayıları gösterir.');

writeFileSync(join(root, 'docs/TESLIM_RAPORU.md'), lines.join('\n') + '\n');
lines = [];
console.log('docs/TESLIM_RAPORU.md yazıldı');
