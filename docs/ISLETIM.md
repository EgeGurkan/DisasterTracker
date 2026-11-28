# İşletim talimatı (kesinti ve olay anı)

## İzlenecekler
- **Kaynak sağlığı**: `GET /api/sources` veya panoda “Kaynaklar”. Son başarılı bağlantı ile en son deprem zamanı ayrı izlenir; sessiz bir saat kesinti değildir.
- **Kuyruk**: panoda öncelik bazında iş sayısı ve en eski işin yaşı. Kritik şeritte (öncelik 0) 5 sn’den eski iş alarm sebebidir.
- **Gecikme**: platforma göre ilk gönderim ve gösterim p50/p95/p99. Hedef: ilk gönderim p95 ≤ 2 sn, p99 ≤ 5 sn.
- **Hatalar**: 404/410 → cihaz kaydı kapanır (normal). 429/5xx → otomatik yeniden deneme. 400/403 → yapılandırma hatası (VAPID konusu, APNs anahtarı).

## Otomatik bildirim
Bir kaynak art arda 3 yoklamada başarısız olursa durum `down` olur, `source_gaps` tablosuna veri boşluğu açılır ve `OPS_WEBHOOK_URL` adresine (Slack/Teams uyumlu `{"text": …}`) haber gider. Erişim dönünce kapanış bildirimi gider; raporlarda boşluk işaretlenir. Kullanıcılar listede son güncelleme saatini ve “Kaynağa erişilemiyor” uyarısını görür.

## Adımlar
1. **Kaynak kesintisi**: kurumun durum sayfasını kontrol et; diğer kaynaklar akmaya devam ediyorsa eylem gerekmez. Uzun kesintide uygulama duyurusu yapılmaz; kullanıcı arayüzü zaten son güncelleme saatini gösterir.
2. **Push sağlayıcı hatası**: panoda “Gönderim hataları”. VAPID anahtarları `data/secrets.json` içindedir; değiştirilirse tüm web abonelikleri yenilenmelidir (uygulama açılışta otomatik yeniden abone olur).
3. **Sunucu yeniden başlatma**: `sending` durumundaki işler açılışta kuyruğa geri alınır; son geçerliliği geçmiş uyarılar gönderilmez.
4. **Yanlış uyarı**: kaynak kaydı geri çekerse sistem bildirim almış cihazlara otomatik “geri çekildi” iletisi yollar. Elle müdahale gerekirse yönetici `test-event` ile aynı `sourceEventId` ve `status: deleted` gönderebilir (yalnız TEST olaylar için).
5. **Yayın engeli**: yanlış kişiye kritik alarm, geçersiz uyarının siren çalması veya etkin görünen bir kanalın kontrollü testte çalışmaması → ilgili özelliği kapat, düzelt, aynı testi tekrarla.

## Yedekleme
`data/afet.db` (+ `-wal`) ve `data/secrets.json`. Üretimde PostgreSQL yedekleme politikası uygulanır.
