import type { PushPayload } from '../../../shared/src/types.ts';
import type { DeviceTarget, PushResult, PushSender, SendOptions, Transport } from './types.ts';
import { sendWebPush, type VapidKeys } from './webpush.ts';
import { FcmSender } from './fcm.ts';
import { ApnsSender } from './apns.ts';

export class PushRouter implements PushSender {
  private vapid: VapidKeys;
  private fcm: FcmSender | null;
  private apns: ApnsSender | null;

  constructor(vapid: VapidKeys, fcm: FcmSender | null, apns: ApnsSender | null) {
    this.vapid = vapid;
    this.fcm = fcm;
    this.apns = apns;
  }

  get available(): Record<Transport, boolean> {
    return { webpush: true, fcm: !!this.fcm, apns: !!this.apns, fake: false };
  }

  async send(t: DeviceTarget, p: PushPayload, o: SendOptions): Promise<PushResult> {
    switch (t.transport) {
      case 'webpush': return sendWebPush(this.vapid, t, p, o);
      case 'fcm': return this.fcm ? this.fcm.send(t, p, o) : { ok: false, status: null, detail: 'FCM yapılandırılmadı (FCM_SERVICE_ACCOUNT yok)' };
      case 'apns': return this.apns ? this.apns.send(t, p, o) : { ok: false, status: null, detail: 'APNs yapılandırılmadı (APNS_* yok)' };
      default: return { ok: false, status: null, detail: `bilinmeyen kanal ${t.transport}` };
    }
  }
}
