# KVKK veri envanteri (pilot)

| Veri | Amaç | Hukuki dayanak (taslak) | Erişebilen roller | Saklama / silme | Yurt dışına aktarım |
|---|---|---|---|---|---|
| Aktif konum (yalnız son ölçüm, zaman, doğruluk) | Yakın deprem eşleştirmesi | Açık rıza (izin anında, isteğe bağlı) | Sistem; yöneticiler görmez (pano yalnız mesafe/kural gösterir) | Her ölçümde üzerine yazılır; geçmiş tutulmaz; hesap silinince silinir | Yok (sunucu yurt içinde barındırılmalı) |
| Kayıtlı konumlar, yarıçap, eşik | Kayıtlı konum bildirimleri | Sözleşmenin ifası / açık rıza | Sistem | Kullanıcı silene kadar | Yok |
| Push aboneliği / belirteci | Bildirim iletimi | Sözleşmenin ifası | Sistem | Geçersizleşince kapatılır; hesapla silinir | **Var**: Google (FCM/Chrome), Apple (APNs/Safari), Mozilla. Yükte kesin adres ve kişi verisi yok; Web Push yükü uçtan uca şifreli. Aktarım için KVKK md. 9 kapsamında değerlendirme gerekir. |
| Bildirim zaman kayıtları | Teslim ölçümü, işletim | Meşru menfaat | İşletim ekibi | Pilot süresince, sonra anonimleştirilir/silinir | Yok |
| Hissettim gözlemi | Toplu gözlem | Açık rıza | Toplu gösterim | Hesapla silinir | Yok |
| Sohbet iletileri, takma ad | Topluluk | Açık rıza | Moderatör | Hesapla silinir | Yok |
| Acil kişiler, mesaj taslakları, aile planı, çanta | Acil iletişim, hazırlık | — | **Yalnız cihaz** | Cihazda; sunucuya, sohbete, tanılama kayıtlarına gitmez | Yok |
| Adres araması | Konum seçimi | Kullanıcı isteği | OpenStreetMap Nominatim | Uygulama saklamaz | **Var** (OSM Vakfı); arayüzde belirtilir; il listesi alternatifi var |

Diğer önlemler: iletimde HTTPS; cihaz anahtarı sunucuda SHA-256 özeti olarak saklanır; makbuz bağlantıları HMAC ile imzalı; yönetici işlemleri `audit_log` tablosuna yazılır. Üretimde: rol bazlı yetki, çok faktörlü giriş, disk şifreleme, aydınlatma metni ve açık rıza ekranları hukuk incelemesinden geçmeli. Arka plan konumu istenmez (Android’de `ACCESS_BACKGROUND_LOCATION` engelli).
