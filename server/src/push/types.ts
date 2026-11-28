import type { PushPayload } from '../../../shared/src/types.ts';

export type Transport = 'webpush' | 'fcm' | 'apns' | 'fake';

export interface DeviceTarget {
  id: string;
  transport: Transport;
  platform: string;
  /** Web Push aboneliği ya da FCM/APNs belirteci */
  push: unknown;
}

export interface SendOptions {
  ttlSec: number;
  urgency: 'very-low' | 'low' | 'normal' | 'high';
  /** Bekleyen aynı konulu mesajı değiştirmek için (Web Push Topic / APNs collapse-id / FCM collapse_key) */
  topic: string;
  critical: boolean;
}

export interface PushResult {
  ok: boolean;
  status: number | null;
  detail: string;
  /** Belirteç geçersiz/aboneliği silinmiş: cihazın push kaydı kapatılır */
  invalidToken?: boolean;
  retryable?: boolean;
}

export interface PushSender {
  send(target: DeviceTarget, payload: PushPayload, opts: SendOptions): Promise<PushResult>;
  readonly available: Record<Transport, boolean>;
}
