import type { DevicePrefs, PushPayload, SourceRecord } from '../../shared/src/types.ts';
import { defaultPrefs } from '../../shared/src/defaults.ts';
import { createPlatform } from '../src/platform.ts';
import type { DeviceTarget, PushResult, PushSender, SendOptions } from '../src/push/types.ts';

export const IZMIR = { lat: 38.4192, lon: 27.1287 };
export const ISTANBUL = { lat: 41.0082, lon: 28.9784 };

export interface Sent { target: DeviceTarget; payload: PushPayload; opts: SendOptions; at: number }

export class FakePush implements PushSender {
  sent: Sent[] = [];
  responder: (t: DeviceTarget) => PushResult = () => ({ ok: true, status: 201, detail: 'sahte kabul' });
  clock: () => number;
  constructor(clock: () => number) { this.clock = clock; }
  get available() { return { webpush: true, fcm: false, apns: false, fake: true }; }
  async send(target: DeviceTarget, payload: PushPayload, opts: SendOptions): Promise<PushResult> {
    const r = this.responder(target);
    if (r.ok) this.sent.push({ target, payload, opts, at: this.clock() });
    return r;
  }
}

export function setup(startMs = Date.parse('2026-11-20T12:00:00Z')) {
  let now = startMs;
  const clock = () => now;
  const push = new FakePush(clock);
  const p = createPlatform({ dbPath: ':memory:', push, publicUrl: '', now: clock, log: () => {}, opsAlert: () => {} });
  const advance = (ms: number) => { now += ms; };
  let n = 0;
  const addDevice = (label: string, prefs: Partial<DevicePrefs>, env: 'production' | 'drill' = 'drill') => {
    const id = `dev${++n}`;
    const full = { ...defaultPrefs(), ...prefs };
    p.ctx.db.prepare(`INSERT INTO devices (id, key_hash, label, platform, env, transport, push_json, push_valid, prefs_json, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id, 'x', label, 'test', env, 'webpush', JSON.stringify({ endpoint: `https://push.example/${id}`, keys: { p256dh: 'a', auth: 'b' } }), 1, JSON.stringify(full), 'x', 'x');
    return id;
  };
  const rec = (o: Partial<SourceRecord> & { lat: number; lon: number }): SourceRecord => ({
    source: 'TEST', sourceEventId: `e${++n}`, originTime: new Date(now - 5000).toISOString(), sourcePublishedAt: new Date(now).toISOString(),
    depthKm: 10, magnitude: 4.0, magType: 'ML', place: 'Test', region: 'Türkiye', status: 'automatic', url: null, isTest: true, ...o,
  });
  return { ...p, push, clock, advance, addDevice, rec };
}

/** Yalnız belirtilen kuralları açık bırakan tercihler. */
export function prefsOnly(p: Partial<DevicePrefs>): Partial<DevicePrefs> {
  const d = defaultPrefs();
  return {
    active: { ...d.active, enabled: false },
    saved: [],
    world: { enabled: false, minMag: 6.5 },
    ...p,
  };
}
