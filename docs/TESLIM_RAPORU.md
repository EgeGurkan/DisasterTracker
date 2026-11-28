# Teslim raporu — bildirim kanıtları

Üretildi: 20.11.2026 18:09:02 (Europe/Istanbul). Bu dosya `npm run report` ile veritabanındaki gerçek kayıtlardan üretilir; elle düzenlenmez.

Aşama tanımları: **giriş** = olayın platforma alındığı an · **ilk gönderim** = push sağlayıcısına ilk istek · **kabul** = sağlayıcının 201/200 yanıtı (teslim sayılmaz) · **alım/gösterim** = cihazın Service Worker veya uygulamadan gönderdiği makbuz (cihaz saati, makbuz anındaki saat farkıyla düzeltilir) · **açılış** = kullanıcının bildirime dokunması.

## 1. Gerçek cihazlarda gönderimler

> Henüz gerçek cihazdan kayıt yok. README’deki “Gerçek telefon gösterimi” adımlarını uyguladığında bu tablo dolar.

## 2. Sunucu hattının uçtan uca kanıtı (push servisi emülatörü)

Çalıştırma: 20.11.2026 18:09:02 · Push servisi yerel emülatördür. VAPID imzası doğrulandı ve her yük aboneye ait anahtarla çözüldü. Gerçek telefon kanıtı ayrı tutulur.

| Bildirim | Cihaz | Kural | Giriş→ilk gönderim | Giriş→kabul | Giriş→gösterim |
|---|---|---|---|---|---|
| TEST · Ailem · İzmir’e 19 km uzaklıkta deprem kaydedildi | Android emülatörü (GPS açık, İstanbul) | Ailem · İzmir 19/100 km ≥ M3.5 | 12 ms | 20 ms | 106 ms |
| TEST · Ailem · İzmir’e 19 km uzaklıkta deprem kaydedildi | iPhone emülatörü (GPS kapalı) | Ailem · İzmir 19/100 km ≥ M3.5 | 16 ms | 20 ms | 119 ms |
| TEST · Dünya genelinde deprem | Android emülatörü (GPS açık, İstanbul) | Dünya ≥ M6.5 | 1 ms | 4 ms | 75 ms |
| TEST · Dünya genelinde deprem | iPhone emülatörü (GPS kapalı) | Dünya ≥ M6.5 | 2 ms | 4 ms | 84 ms |
| TEST · Ailem · İzmir’e 28 km uzaklıkta deprem kaydedildi | Android emülatörü (GPS açık, İstanbul) | Ailem · İzmir 28/100 km ≥ M3.5 + Dünya ≥ M6.5 | 1 ms | 4 ms | 48 ms |
| TEST · Ailem · İzmir’e 28 km uzaklıkta deprem kaydedildi | iPhone emülatörü (GPS kapalı) | Ailem · İzmir 28/100 km ≥ M3.5 + Dünya ≥ M6.5 | 2 ms | 4 ms | 103 ms |
| TEST · Bildirim denemesi | iPhone emülatörü (GPS kapalı) | bildirim testi | 0 ms | 2 ms | 48 ms |

**Android emülatörü (GPS açık, İstanbul) — kilit ekranına düşen metinler:**
- TEST · Ailem · İzmir’e 19 km uzaklıkta deprem kaydedildi — M 4,2 (ML) · 18:08 · Menderes (İzmir) · Kaynak: TEST
- TEST · Dünya genelinde deprem — Japonya · M 6,8 (Mw) · 18:08 · Kaynak: TEST
- TEST · Ailem · İzmir’e 28 km uzaklıkta deprem kaydedildi — M 6,6 (Mw) · 18:08 · Ege Denizi (Karaburun açıkları) · Kaynak: TEST · Ayrıca: Dünya geneli

**iPhone emülatörü (GPS kapalı) — kilit ekranına düşen metinler:**
- TEST · Ailem · İzmir’e 19 km uzaklıkta deprem kaydedildi — M 4,2 (ML) · 18:08 · Menderes (İzmir) · Kaynak: TEST
- TEST · Dünya genelinde deprem — Japonya · M 6,8 (Mw) · 18:08 · Kaynak: TEST
- TEST · Ailem · İzmir’e 28 km uzaklıkta deprem kaydedildi — M 6,6 (Mw) · 18:08 · Ege Denizi (Karaburun açıkları) · Kaynak: TEST · Ayrıca: Dünya geneli
- TEST · Bildirim denemesi — Bu deneme sunucudan "iPhone emülatörü (GPS kapalı)" cihazına gönderildi. Gerçek bir deprem değildir.

## 3. Kabul senaryoları (otomatik)

`npm test` — şartname §10 senaryolarının sunucu tarafı (25 test): eşik/yarıçap sınırları (tam 100 km/M 3,5 bildirir; 101 km ve M 3,4 bildirmez), uzak konum başlığı, GPS kapalıyken dünya kuralı, örtüşen kurallarda tek bildirim, çift kaynak birleştirme, yakın artçıların korunması, eşiği ilk aşan revizyon, geri çekme, TEST yalıtımı, erken uyarı hedefleme/imza/süre/eski sürüm, kuyruk kurtarma, geçersiz belirteç ve 100 cihaz × 5 olay yük testi.

## 4. Yayın engelleri ve açık maddeler

- Gerçek cihaz matrisi (ön plan, arka plan, kilit ekranı, uygulama kapalı, zorla durdurma, pil tasarrufu, sessiz/odak, izin reddi) yalnız Web Push için gösterilebilir durumdadır; native APNs/FCM için Apple Developer ve Firebase hesabı gerekir (docs/DESTEK_MATRISI.md).
- Türkiye için yetkili erken uyarı sağlayıcısı yok; erken uyarı yalnız imzalı TEST sağlayıcısıyla tatbikat cihazlarında çalışır.
- 100 etiketli deneme/platform ve 15 sn içinde ≥ 99/100 görünür bildirim hedefi, gerçek cihaz pilotunda ölçülecek; bu rapor her çalıştırmada güncel sayıları gösterir.
