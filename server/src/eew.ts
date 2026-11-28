// Sarsıntı erken uyarısı (EEW) alımı. Yalnız bu amaçla sağlanan, kullanım ve dağıtım izni
// doğrulanmış sağlayıcıların imzalı mesajları kabul edilir. Pilotta Türkiye için yetkili bir
// üretim akışı yoktur; yalnız tatbikat cihazlarına giden imzalı TEST sağlayıcısı tanımlıdır.

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { EewMessage } from '../../shared/src/types.ts';
import { buildEewText, matchEew } from '../../shared/src/match.ts';
import { tx } from './db.ts';
import { iso, type Ctx } from './ctx.ts';
import { eligibleDevices, effectivePrefs, enqueue, parsePrefs } from './dispatch.ts';

export interface EewProvider {
  id: string;
  name: string;
  /** Erken uyarı amacıyla sağlanan akış ve yazılı kullanım/dağıtım izni doğrulandı mı */
  authorized: boolean;
  distributionAllowed: boolean;
  /** Yalnız TEST mesajı yayımlayabilir, yalnız tatbikat cihazlarına gider */
  drillOnly: boolean;
  hmacKey: Buffer;
}

export function canonicalEew(m: EewMessage): string {
  const { signature: _s, ...rest } = m;
  return JSON.stringify(rest, Object.keys(rest).sort());
}

export function signEew(m: Omit<EewMessage, 'signature'>, key: Buffer): EewMessage {
  const msg = { ...m, signature: '' } as EewMessage;
  msg.signature = createHmac('sha256', key).update(canonicalEew(msg)).digest('base64url');
  return msg;
}

export type EewDecision =
  | 'accepted' | 'unknown-provider' | 'not-authorized' | 'bad-signature' | 'actual-from-drill-provider'
  | 'stale-version' | 'already-cancelled' | 'expired-on-arrival' | 'invalid';

export function ingestEew(ctx: Ctx, providers: Map<string, EewProvider>, msg: EewMessage): { decision: EewDecision; deliveries: string[] } {
  const nowMs = ctx.now();
  const log = (decision: EewDecision) => {
    ctx.db.prepare('INSERT INTO alert_log (provider, alert_id, version, msg_type, decision, at) VALUES (?,?,?,?,?,?)')
      .run(String(msg.provider), String(msg.alertId), Number(msg.version) || 0, String(msg.msgType), decision, iso(nowMs));
    return { decision, deliveries: [] as string[] };
  };
  if (!msg || typeof msg.alertId !== 'string' || !Number.isInteger(msg.version) || !msg.area?.circles?.length) return log('invalid');
  const p = providers.get(msg.provider);
  if (!p) return log('unknown-provider');
  if (!p.authorized || !p.distributionAllowed) return log('not-authorized');
  const expect = Buffer.from(createHmac('sha256', p.hmacKey).update(canonicalEew(msg)).digest('base64url'));
  const got = Buffer.from(String(msg.signature));
  if (expect.length !== got.length || !timingSafeEqual(expect, got)) return log('bad-signature');
  if (p.drillOnly && msg.status !== 'test') return log('actual-from-drill-provider');

  const receivedAt = iso(nowMs);
  const expiresMs = Date.parse(msg.expiresAt);
  const prior = ctx.db.prepare('SELECT version, state FROM alerts WHERE provider = ? AND alert_id = ?').get(msg.provider, msg.alertId) as { version: number; state: string } | undefined;
  // Sırası bozulmuş mesaj: en son geçerli sürüm korunur; geri çekilmiş uyarı eski sürümle yeniden etkinleşmez.
  if (prior && msg.version <= prior.version) return log('stale-version');
  if (prior && prior.state === 'cancelled') return log('already-cancelled');

  const expired = !(expiresMs > nowMs);
  const state = msg.msgType === 'cancel' ? 'cancelled' : expired ? 'expired' : 'active';
  tx(ctx.db, () => {
    ctx.db.prepare(`INSERT INTO alerts (provider, alert_id, version, msg_type, status, state, issued_at, expires_at, message_json, received_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(provider, alert_id) DO UPDATE SET version=excluded.version, msg_type=excluded.msg_type,
      state=excluded.state, expires_at=excluded.expires_at, message_json=excluded.message_json, updated_at=excluded.updated_at`)
      .run(msg.provider, msg.alertId, msg.version, msg.msgType, msg.status, state, msg.issuedAt, msg.expiresAt, JSON.stringify(msg), receivedAt, receivedAt);
  });
  if (expired && msg.msgType !== 'cancel') return log('expired-on-arrival');

  const alertKey = `${msg.provider}:${msg.alertId}`;
  const out: string[] = [];
  const notifiedStmt = ctx.db.prepare("SELECT DISTINCT device_id FROM deliveries WHERE alert_key = ? AND kind = 'eew'");
  const notified = new Set((notifiedStmt.all(alertKey) as { device_id: string }[]).map((r) => r.device_id));

  for (const dev of eligibleDevices(ctx, msg.status === 'test')) {
    const rawPrefs = parsePrefs(dev);
    const devLang = rawPrefs.lang ?? 'tr';
    const prefs = effectivePrefs(rawPrefs);
    if (msg.msgType === 'cancel') {
      if (!notified.has(dev.id)) continue;
      const t = buildEewText(msg, { target: { kind: 'active' }, distanceKm: null }, devLang);
      const id = enqueue(ctx, {
        device: dev, kind: 'eew-cancel', dedupKey: `${dev.id}:eewc:${alertKey}`, ...t, isTest: msg.status === 'test',
        alertKey, alertId: msg.alertId, source: msg.provider, sourcePublishedAt: msg.issuedAt, platformReceivedAt: receivedAt,
        deadlineMs: nowMs + 10 * 60_000, url: `/#/uyarilar?a=${encodeURIComponent(alertKey)}`, tag: `eew-${alertKey}`, silent: true,
      });
      if (id) out.push(id);
      continue;
    }
    const m = matchEew(msg, prefs, nowMs);
    if (!m) continue;
    const t = buildEewText(msg, m, devLang);
    const isRemote = m.target.kind === 'saved';
    const already = notified.has(dev.id);
    const id = enqueue(ctx, {
      device: dev, kind: 'eew', dedupKey: `${dev.id}:eew:${alertKey}:${msg.version}`, ...t, isTest: msg.status === 'test',
      alertKey, alertId: msg.alertId, source: msg.provider, sourcePublishedAt: msg.issuedAt, platformReceivedAt: receivedAt,
      deadlineMs: expiresMs, expiresAtMs: expiresMs,
      // Bulunduğun bölge: siren. Uzaktaki kayıtlı yer: kullanıcı ayrıca açmadıysa sessiz. Güncelleme: sessiz değiştirme.
      critical: !already && (!isRemote || prefs.eew.remoteSound),
      silent: already || (isRemote && !prefs.eew.remoteSound),
      url: `/#/acil?a=${encodeURIComponent(alertKey)}`, tag: `eew-${alertKey}`,
    });
    if (id) out.push(id);
  }
  log('accepted');
  return { decision: 'accepted', deliveries: out };
}
