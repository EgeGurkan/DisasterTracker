# Afet Takip — iOS ve Android uygulaması (Expo)

Aynı sunucu API’sini ve `../shared` kurallarını kullanır. Durum: TypeScript denetimi ve iOS/Android JS paketlemesi
(`npx expo export`) geçiyor; imzalı derleme için aşağıdaki hesaplar gerekir.

## Gerekenler
- **Android**: Firebase projesi → Android uygulaması `tr.afettakip.app` → `google-services.json` dosyasını bu klasöre koy.
  Sunucuda `FCM_SERVICE_ACCOUNT=<servis-hesabi.json>`.
- **iOS**: Apple Developer Program, bundle id `tr.afettakip.app`, Push Notifications yeteneği, APNs `.p8` anahtarı.
  Sunucuda `APNS_KEY_PATH`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID=tr.afettakip.app` (geliştirme derlemesinde `APNS_SANDBOX=1`).
  Kritik uyarı için Apple’dan yetki alınınca `APNS_CRITICAL=1`.
- `app.json` → `extra.apiBase`: sunucunun https adresi.

## Derleme
```powershell
npm install
```
```powershell
npx expo prebuild
```
```powershell
npx expo run:android
```
iOS derlemesi macOS + Xcode veya EAS Build ister (`npx eas build -p ios`).

## Kapsam
Depremler (liste, ayrıntı, “neden aldım”), Harita (web haritasına geçiş; liste metin alternatifi), Acil (düdük, Güvendeyim/Tehlikedeyim SMS ve WhatsApp, 112, tatbikatta arama yok), Uyarılar, Ayarlar (bildirim izni ve test, aktif konum, kayıtlı konumlar, dünya eşiği, acil kişiler, tatbikat).
Android kanalları: `deprem`, `deprem-sessiz`, `erken-uyari` (siren, DND’yi aşma isteği), `erken-uyari-uzak`, `test`.

## Sonraki yerel modüller
- iOS Notification Service Extension: uygulama kapalıyken gösterim makbuzu.
- Android `FirebaseMessagingService`: kapalıyken makbuz ve Android 14 tam ekran (`USE_FULL_SCREEN_INTENT`) koşullarının denetimi.
- Kulaklık algılama (düdük öncesi güvenli çıkış).
