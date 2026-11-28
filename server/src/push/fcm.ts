// Firebase Cloud Messaging HTTP v1 gönderici (Android native uygulama).
// Bağımlılıksız: servis hesabı JWT'si node:crypto ile imzalanır.
// Etkinleştirmek için FCM_SERVICE_ACCOUNT=<servis-hesabi.json yolu> ortam değişkeni gerekir.

import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { PushPayload } from '../../../shared/src/types.ts';
import type { DeviceTarget, PushResult, SendOptions } from './types.ts';

interface ServiceAccount { project_id: string; client_email: string; private_key: string; token_uri?: string }

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export class FcmSender {
  private sa: ServiceAccount;
  private token: { value: string; expMs: number } | null = null;

  constructor(path: string) {
    this.sa = JSON.parse(readFileSync(path, 'utf8')) as ServiceAccount;
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expMs - Date.now() > 60_000) return this.token.value;
    const now = Math.floor(Date.now() / 1000);
    const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = b64u(JSON.stringify({
      iss: this.sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: this.sa.token_uri ?? 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
    }));
    const signer = createSign('RSA-SHA256');
    signer.update(`${head}.${claims}`);
    const jwt = `${head}.${claims}.${b64u(signer.sign(this.sa.private_key))}`;
    const r = await fetch(this.sa.token_uri ?? 'https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
    });
    const j = (await r.json()) as { access_token: string; expires_in: number };
    this.token = { value: j.access_token, expMs: Date.now() + j.expires_in * 1000 };
    return j.access_token;
  }

  async send(target: DeviceTarget, payload: PushPayload, opts: SendOptions): Promise<PushResult> {
    const token = (target.push as { token: string }).token;
    // Bildirim + veri iletisi: uygulama kapalı/arka plandayken sistem doğru kanalda gösterir
    // (zorla durdurulmuş uygulamaya Android hiçbir FCM iletisini teslim etmez — destek matrisinde belirtildi).
    const channel = payload.kind === 'eew' && payload.critical ? 'erken-uyari'
      : payload.kind === 'eew' || payload.kind === 'eew-cancel' ? 'erken-uyari-uzak'
      : payload.kind === 'test' ? 'test'
      : payload.silent ? 'deprem-sessiz' : 'deprem';
    const body = {
      message: {
        token,
        notification: { title: payload.title, body: payload.body },
        data: { payload: JSON.stringify(payload) },
        android: {
          priority: opts.urgency === 'high' ? 'HIGH' : 'NORMAL',
          ttl: `${Math.max(0, Math.floor(opts.ttlSec))}s`,
          collapse_key: opts.topic,
          notification: {
            channel_id: channel, tag: payload.tag, visibility: 'PUBLIC',
            notification_priority: opts.critical ? 'PRIORITY_MAX' : 'PRIORITY_HIGH',
            default_sound: !payload.silent, default_vibrate_timings: !payload.silent,
          },
        },
      },
    };
    try {
      const r = await fetch(`https://fcm.googleapis.com/v1/projects/${this.sa.project_id}/messages:send`, {
        method: 'POST',
        headers: { authorization: `Bearer ${await this.accessToken()}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const text = await r.text();
      if (r.ok) return { ok: true, status: r.status, detail: `FCM kabul ${text.slice(0, 120)}` };
      const invalid = r.status === 404 || /UNREGISTERED|INVALID_ARGUMENT.*token/i.test(text);
      return { ok: false, status: r.status, detail: text.slice(0, 200), invalidToken: invalid, retryable: r.status === 429 || r.status >= 500 };
    } catch (e) {
      return { ok: false, status: null, detail: String(e), retryable: true };
    }
  }
}
