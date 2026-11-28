# Platform destek matrisi

Durum işaretleri: **✔ doğrulandı** (bu ortamda gösterildi) · **◐ uygulandı, gerçek cihaz testi bekliyor** · **✖ platform izin vermiyor** · **⏳ dış hesap/izin bekliyor**.

## Bildirim teslimi

| Durum | Android · Chrome (Web Push) | iPhone · ana ekran web uyg. (iOS 16.4+) | Masaüstü tarayıcı | Android uygulaması (FCM) | iOS uygulaması (APNs) |
|---|---|---|---|---|---|
| Sunucu hattı (eşleştirme → kuyruk → imzalı/şifreli istek) | ✔ emülatörle | ✔ emülatörle | ✔ emülatörle | ◐ kod hazır | ◐ kod hazır |
| Ön plan | ◐ | ◐ | ◐ | ⏳ Firebase | ⏳ Apple Developer |
| Arka plan / kilit ekranı | ◐ | ◐ | ◐ | ⏳ | ⏳ |
| Uygulama/sekme kapalı | ◐ (tarayıcı süreci yaşıyorsa) | ◐ | ◐ (tarayıcı açıksa) | ⏳ (sistem gösterir) | ⏳ (sistem gösterir) |
| Zorla durdurma | ✖ Chrome zorla durdurulursa teslim yok | — | — | ✖ Android, zorla durdurulmuş uygulamaya FCM teslim etmez | iOS’ta uygulama kapatılsa da APNs teslim eder |
| Pil tasarrufu / Doze | ◐ `urgency: high` | ◐ | — | ◐ yüksek öncelikli FCM | — |
| Sessiz / Odak modu | Sistem kuralı uygulanır | Sistem kuralı uygulanır | Sistem | Kanal bazlı; `erken-uyari` kanalı DND’yi aşmayı ister | Kritik uyarı yalnız Apple yetkisiyle; yoksa `time-sensitive` |
| İzin reddi | Uygulama nedenini ve ayara dönüş yolunu gösterir | Aynı | Aynı | Aynı + sistem ayarlarına bağlantı | Aynı |
| Gösterim makbuzu (teslim kanıtı) | ✔ Service Worker | ✔ Service Worker | ✔ | Yalnız ön planda; kapalıyken “bilinmiyor” | Yalnız ön planda; Notification Service Extension ile genişletilecek |
| Süresi geçmiş uyarıda siren yok | ✔ sunucu + SW kontrolü | ✔ | ✔ | ✔ sunucu (TTL) | ✔ sunucu (apns-expiration) |
| Siren sesi | Yalnız uygulama açıkken | Yalnız uygulama açıkken | Yalnız açıkken | Kanal sesi (`siren.wav`) | Kritik uyarı yetkisiyle |
| Tam ekran alarm | ✖ web’de yok | ✖ | ✖ | ⏳ yerel modül + Android 14 USE_FULL_SCREEN_INTENT koşulları | ✖ (iOS izin vermez) |

Web Push, iPhone’da yalnız Safari’den **Ana Ekrana Ekle** ile kurulan uygulamada çalışır; uygulama izin istemeden önce bunu denetler ve kullanıcıya adımı gösterir.

## Acil araçlar

| Özellik | Web/PWA | Android uyg. | iOS uyg. |
|---|---|---|---|
| Düdük (uygulamayla dağıtılan ses) | ✔ çevrimdışı önbellekte | ✔ paket içinde | ✔ sessiz modda da çalar (`playsInSilentMode`) |
| Kesikli (SOS) / titreşim | ✔ / Android’de ✔, iOS’ta ✖ | sürekli | sürekli |
| Kulaklık algılama | ✖ web’de mümkün değil; uyarı metni gösterilir | ⏳ yerel modül | ⏳ yerel modül |
| SMS taslağı | `sms:` bağlantısı | expo-sms (iptal = gönderilmedi) | expo-sms |
| WhatsApp | `wa.me` | `whatsapp://` yoksa SMS’e geçiş | aynı |
| 112 | `tel:112`; masaüstünde büyük numara + kopyala; tatbikatta aranmaz | `tel:112` | `tel:112` |
| Çevrimdışı rehber, plan, çanta | ✔ Service Worker + yerel depolama | ✔ | ✔ |

Not: Bu ortamdaki gömülü tarayıcı paneli Service Worker kaydına izin vermediği için web’in çevrimdışı ve push davranışı gerçek tarayıcıda/telefonda doğrulanmalıdır.
