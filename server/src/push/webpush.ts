import webpush from 'web-push';
import type { PushPayload } from '../../../shared/src/types.ts';
import type { DeviceTarget, PushResult, SendOptions } from './types.ts';

export interface VapidKeys { publicKey: string; privateKey: string; subject: string }

export function generateVapid(subject: string): VapidKeys {
  const k = webpush.generateVAPIDKeys();
  return { ...k, subject };
}

export async function sendWebPush(vapid: VapidKeys, target: DeviceTarget, payload: PushPayload, opts: SendOptions): Promise<PushResult> {
  const sub = target.push as webpush.PushSubscription;
  try {
    const res = await webpush.sendNotification(sub, JSON.stringify(payload), {
      TTL: Math.max(0, Math.floor(opts.ttlSec)),
      urgency: opts.urgency,
      topic: opts.topic,
      vapidDetails: { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
      timeout: 10_000,
    });
    return { ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, detail: `kabul: ${res.statusCode} ${hostOf(sub.endpoint)}` };
  } catch (e) {
    const err = e as { statusCode?: number; body?: string; message?: string };
    const status = err.statusCode ?? null;
    const detail = `${status ?? 'ağ hatası'} ${hostOf(sub.endpoint)} ${(err.body || err.message || '').slice(0, 200)}`;
    if (status === 404 || status === 410) return { ok: false, status, detail, invalidToken: true };
    if (status === 413 || status === 400 || status === 403) return { ok: false, status, detail };
    return { ok: false, status, detail, retryable: true };
  }
}

function hostOf(url: string): string {
  try { return new URL(url).host; } catch { return '?'; }
}
