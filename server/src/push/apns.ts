// Apple Push Notification service gönderici (iOS native uygulama), HTTP/2 + ES256 JWT.
// Etkinleştirmek için: APNS_KEY_PATH (.p8), APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID,
// isteğe bağlı APNS_SANDBOX=1. Kritik uyarı (critical alert) yalnız Apple'ın verdiği
// "com.apple.developer.usernotifications.critical-alerts" yetkisi ve kullanıcı izniyle çalışır;
// APNS_CRITICAL=1 bu yetki alındığında açılır, aksi halde 'time-sensitive' kullanılır.

import { connect, type ClientHttp2Session } from 'node:http2';
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { PushPayload } from '../../../shared/src/types.ts';
import type { DeviceTarget, PushResult, SendOptions } from './types.ts';

export interface ApnsConfig { keyPath: string; keyId: string; teamId: string; bundleId: string; sandbox: boolean; criticalEntitled: boolean }

export class ApnsSender {
  private key: string;
  private jwt: { value: string; iatMs: number } | null = null;
  private session: ClientHttp2Session | null = null;
  private cfg: ApnsConfig;

  constructor(cfg: ApnsConfig) {
    this.cfg = cfg;
    this.key = readFileSync(cfg.keyPath, 'utf8');
  }

  private token(): string {
    if (this.jwt && Date.now() - this.jwt.iatMs < 40 * 60_000) return this.jwt.value;
    const iat = Math.floor(Date.now() / 1000);
    const h = Buffer.from(JSON.stringify({ alg: 'ES256', kid: this.cfg.keyId })).toString('base64url');
    const c = Buffer.from(JSON.stringify({ iss: this.cfg.teamId, iat })).toString('base64url');
    const s = createSign('SHA256');
    s.update(`${h}.${c}`);
    const sig = s.sign({ key: this.key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    this.jwt = { value: `${h}.${c}.${sig}`, iatMs: Date.now() };
    return this.jwt.value;
  }

  private conn(): ClientHttp2Session {
    if (this.session && !this.session.closed && !this.session.destroyed) return this.session;
    this.session = connect(this.cfg.sandbox ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com');
    this.session.on('error', () => { this.session = null; });
    return this.session;
  }

  send(target: DeviceTarget, payload: PushPayload, opts: SendOptions): Promise<PushResult> {
    const token = (target.push as { token: string }).token;
    const sound = payload.silent ? undefined
      : opts.critical && this.cfg.criticalEntitled ? { critical: 1, name: 'siren.caf', volume: 1.0 }
      : opts.critical ? 'siren.caf' : 'default';
    const aps: Record<string, unknown> = {
      alert: { title: payload.title, body: payload.body },
      'thread-id': payload.eventId ?? payload.alertId ?? 'genel',
      'mutable-content': 1,
      'interruption-level': opts.critical ? (this.cfg.criticalEntitled ? 'critical' : 'time-sensitive') : payload.silent ? 'passive' : 'active',
    };
    if (sound) aps.sound = sound;
    const body = JSON.stringify({ aps, p: payload });
    const exp = opts.ttlSec > 0 ? Math.floor(Date.now() / 1000) + Math.floor(opts.ttlSec) : 0;
    return new Promise((resolve) => {
      let req;
      try {
        req = this.conn().request({
          ':method': 'POST', ':path': `/3/device/${token}`,
          authorization: `bearer ${this.token()}`,
          'apns-topic': this.cfg.bundleId, 'apns-push-type': 'alert',
          'apns-priority': opts.urgency === 'high' ? '10' : '5',
          'apns-expiration': String(exp), 'apns-collapse-id': opts.topic.slice(0, 64),
        });
      } catch (e) {
        resolve({ ok: false, status: null, detail: String(e), retryable: true });
        return;
      }
      let status = 0;
      let data = '';
      req.setEncoding('utf8');
      req.on('response', (h) => { status = Number(h[':status']); });
      req.on('data', (c) => { data += c; });
      req.on('end', () => {
        if (status === 200) return resolve({ ok: true, status, detail: 'APNs kabul' });
        const invalid = status === 410 || /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/.test(data);
        resolve({ ok: false, status, detail: data.slice(0, 200), invalidToken: invalid, retryable: status === 429 || status >= 500 });
      });
      req.on('error', (e) => resolve({ ok: false, status: null, detail: String(e), retryable: true }));
      req.end(body);
    });
  }
}
