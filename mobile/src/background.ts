// Ön planda gelen bildirimleri gösterir ve alım/gösterim makbuzu yollar.
// Uygulama kapalıyken bildirimi işletim sistemi gösterir; o durumda gösterim makbuzu
// iOS'ta Notification Service Extension, Android'de FCM onMessageReceived yerel modülü gerektirir
// (sonraki aşama, docs/DESTEK_MATRISI.md). O ana kadar panoda "bilinmiyor" görünür.
import * as Notifications from 'expo-notifications';
import { payloadOf, receipt } from './core';

Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const p = payloadOf(n);
    const expired = !!(p?.expiresAtMs && Date.now() >= p.expiresAtMs);
    void receipt(p, 'received');
    return {
      shouldShowBanner: true,
      shouldShowList: true,
      // Süresi geçmiş uyarı sessizce geçmişe işlenir
      shouldPlaySound: !expired && !p?.silent,
      shouldSetBadge: false,
    };
  },
});

Notifications.addNotificationReceivedListener((n) => { void receipt(payloadOf(n), 'displayed'); });
