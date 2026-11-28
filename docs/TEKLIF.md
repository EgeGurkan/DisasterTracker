# Ekran haritası, bağımlılıklar, takvim ve maliyet

## Ekran haritası
```
Alt menü (mobil) / sol menü (masaüstü)
├─ Depremler ── konum seçici · bölge seçici + Filtre paneli · liste ──► Olay ayrıntısı (dar ekranda alt panel)
│                                                                      ├─ Bu bildirimi neden aldın? (kural + aşama süreleri)
│                                                                      ├─ Kaynakların ayrı ölçümleri · güncellemeler
│                                                                      └─ Haritada göster · Hissettim
├─ Harita ── merkez üsleri · konumlarım ve yarıçaplar · istasyonlar · fay/zemin/tehlike/toplanma (resmî bağlantılar)
├─ ACİL ── korunma adımı · Düdük · Güvendeyim · Tehlikedeyim · 112 · düdük ayarları · acil kişiler · çevrimdışı durumu
├─ Uyarılar ── erken uyarı kapsamı · yetkili uyarı geçmişi · bu cihaza gelen bildirimler
└─ Menü ── Raporlar · Sismik Ağ · Sohbet · Hazırlık (rehber, aile planı, çanta, zemin, sigorta) · Ayarlar · İşletim panosu
     Ayarlar ── Konumlarım · Bildirimler (izin, test, kanallar, sessiz saat) · Acil kişiler · Görünüm · Cihaz/tatbikat · Gizlilik
```

## Dış bağımlılıklar
| Bağımlılık | Kimden | Durum | Engellediği |
|---|---|---|---|
| Apple Developer Program (99 USD/yıl), APNs anahtarı | Ürün sahibi | Bekliyor | iOS uygulaması, App Store/TestFlight |
| Kritik uyarı yetkisi | Apple başvurusu | Bekliyor | iOS’ta sessiz modu aşan erken uyarı |
| Firebase projesi + servis hesabı | Ürün sahibi | Bekliyor | Android uygulaması bildirimleri |
| Google Play geliştirici (25 USD, tek sefer) | Ürün sahibi | Bekliyor | Android yayını |
| Yetkili erken uyarı akışı | AFAD / yetkili sağlayıcı | Yok | Gerçek erken uyarı |
| KRDAE yazılı izni | Kandilli | Bekliyor | Kandilli adaptörü |
| MTA diri fay, belediye mikrobölgeleme yeniden dağıtım izni | MTA, belediyeler | Bekliyor | Uygulama içi katmanlar |
| Kalıcı alan adı ve sunucu (yurt içi) | Ürün sahibi | Pilotta geçici tünel | Kalıcı web adresi, Apple VAPID konusu |
| Hazırlık içeriği editör onayı | Yetkin editör | Bekliyor | İçeriğin yayın sürümü |

## Aşamalar ve takvim (tahmini, 2 geliştirici + yarı zamanlı tasarımcı)
| Aşama | Kapsam | Süre | Durum |
|---|---|---|---|
| 1. Özgün tıklanabilir tasarım | Ekranlar, görsel dil, erişilebilirlik | 1–2 hafta | **Bu teslimde: çalışan web arayüzü** |
| 2. Gerçek veriyle uçtan uca | Adaptörler, birleştirme, eşleştirme, kuyruk, Web Push, ölçüm, pano | 3–4 hafta | **Bu teslimde: çalışıyor, testli** |
| 3. Native uygulamalar | Expo derlemeleri, FCM/APNs, kanal/kritik uyarı, gösterim makbuzu genişletmeleri | 3–4 hafta | Kod iskeleti hazır; hesaplar bekleniyor |
| 4. Gerçek cihaz pilotu | Matris testleri, 100 deneme/platform, düzeltmeler | 2–3 hafta | Web Push ile başlatılabilir |
| 5. Üretim | PostGIS, yurt içi barındırma, yönetici MFA, hukuk incelemesi, mağaza yayını | 2–3 hafta | — |

Toplam: kalan iş için yaklaşık **10–14 hafta** (≈ 25–35 kişi-hafta). Para birimi cinsinden teklif, ekip ücretine göre bu kişi-hafta tahmini üzerinden hesaplanmalı; dış maliyetler yukarıdaki tabloda.
