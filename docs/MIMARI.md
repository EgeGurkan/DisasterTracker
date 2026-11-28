# Mimari

```
Kaynaklar (AFAD 20 sn · EMSC 60 sn · USGS 60 sn · GEOFON istasyon)        Yetkili erken uyarı (imzalı mesaj)
        │ adaptör: UTC'ye normalize, büyüklük türü, durum                          │ imza + yetki + son geçerlilik
        ▼                                                                          ▼
  events.ts  ── kaynak kaydı → aynı fiziksel olay mı? (≤20 sn, ≤60 km, Δderinlik ≤50, Δbüyüklük ≤1,2,      eew.ts
               her kurumdan tek kayıt) → olay sürümü (özet: TR'de AFAD, dünyada USGS önceliği)
        │ özet değiştiyse
        ▼
  dispatch.ts ── cihaz başına: kanal tercihleri → shared/match.ts (kayıtlı/aktif/dünya) → tek bildirim,
               nedenler birlikte · ilk eşik aşımı · geri çekme · TEST yalnız tatbikat cihazına
        ▼
  deliveries (SQLite, kalıcı)  ── tekilleştirme anahtarı (cihaz+olay[+sürüm]), öncelik, son geçerlilik
        ▼
  queue.ts ── kritik şerit (öncelik 0) + normal şerit · yeniden başlatmada kurtarma · üstel yeniden deneme
              son geçerlilik geçtiyse göndermez · geçersiz belirteçte cihazı kapatır
        ▼
  push/router.ts ── Web Push (VAPID, aes128gcm, TTL/urgency/topic) · FCM HTTP v1 · APNs HTTP/2
        ▼
  Cihaz (Service Worker / uygulama) ── süre kontrolü → göster → makbuz (alım, gösterim, açılış)
```

## Teknoloji gerekçesi

| Katman | Seçim | Neden |
|---|---|---|
| Ortak kurallar | TypeScript (`shared/`) | Sunucu karar verir; web ve mobil “neden aldım” açıklamasını aynı kodla üretir. |
| Sunucu | Node 24+, derleme adımı olmadan TS, tek bağımlılık (`web-push`) | Küçük saldırı yüzeyi, hızlı açılış; FCM/APNs bağımlılıksız. |
| Depolama | Pilot: SQLite (WAL, `node:sqlite`) · Üretim: PostgreSQL/PostGIS | Pilot tek süreçte dayanıklı kuyruk. Üretimde konum sorguları `ST_DWithin` ile indeksli; cihaz başına tarama yerini alır. |
| Kuyruk | Veritabanı tabanlı, öncelikli | Kalıcılık ve yeniden başlatma sonrası devam; üretimde ayrı kritik kuyruk (ör. Postgres `SKIP LOCKED` veya bir mesaj aracısı). |
| Web | Preact + Vite, Leaflet, kendi Service Worker’ı | ~100 KB gzip, çevrimdışı Acil, Web Push. |
| Mobil | Expo (React Native) + yerel modüller | Tek kod tabanı; kritik uyarı, tam ekran alarm ve gösterim makbuzu için yerel genişletmeler. |

## Arayüzler (HTTP API)

| Uç | Yetki | Amaç |
|---|---|---|
| `GET /api/config` | — | VAPID anahtarı, aktarım durumu, erken uyarı kapsamı |
| `POST /api/devices` · `GET/PUT/DELETE /api/devices/me` | cihaz anahtarı | Kayıt, tercih eşitleme, hesap ve konum silme |
| `POST /api/devices/me/test` | cihaz | “TEST · Bildirim denemesi” |
| `GET /api/devices/me/deliveries` · `GET /api/deliveries/:id` | cihaz | Bildirim geçmişi, neden ve aşama süreleri |
| `POST /api/receipts/:id?t=` | HMAC makbuz belirteci | Cihazdan alım/gösterim/açılış |
| `GET /api/events` · `GET /api/events/:id` · `POST …/felt` | — / cihaz | Liste, ayrıntı (kaynak ölçümleri, revizyonlar), Hissettim |
| `GET /api/alerts` · `/api/reports` · `/api/sources` · `/api/stations` | — | Uyarı geçmişi, raporlar, kaynak sağlığı ve envanter, istasyonlar |
| `GET/POST /api/chat/:oda` · `POST /api/chat-report` | cihaz | Topluluk odaları, şikâyet (3 şikâyette otomatik gizleme) |
| `POST /api/admin/test-event` · `/api/admin/eew` · `GET /api/admin/ops` | yönetici | Tatbikat olayı, imzalı test uyarısı, işletim panosu (denetim kaydı tutulur) |

Kaynak adaptörü arayüzü: `fetch(nowMs) → SourceRecord[]` (bkz. `server/src/sources/adapters.ts`). Yeni kurum eklemek için yalnız adaptör ve envanter satırı gerekir.

## Zaman ölçümü

`deliveries` tablosunda her aşama ayrı sütundur: kaynağın yayını (`source_published_at`, AFAD için yalnız revizyonda bilinir), platforma giriş, kuyruk, ilk gönderim, sağlayıcı kabulü, cihazda alım/gösterim (cihaz saati, makbuz anındaki saat farkıyla düzeltilir; ayrıca sunucuya varış saati üst sınır olarak saklanır), açılış. Ölçülemeyen aşama `null` → arayüzde “bilinmiyor”. Sağlayıcı kabulü hiçbir yerde “teslim edildi” diye gösterilmez.

## Çevrimdışı birleştirme

Çanta, aile planı ve rehber işaretleri yalnız cihazda tutulur (sunucuya gitmez); bu yüzden çift kayıt riski yoktur. Hesaplar arası eşitleme eklendiğinde kalem kimliği + son değişiklik zamanı ile birleştirilecek.
