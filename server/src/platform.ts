import { randomBytes } from 'node:crypto';
import { openDb } from './db.ts';
import type { Ctx } from './ctx.ts';
import type { PushSender } from './push/types.ts';
import { DeliveryWorker } from './queue.ts';
import type { EewProvider } from './eew.ts';

export interface PlatformOptions {
  dbPath: string;
  push: PushSender;
  publicUrl: string;
  secret?: Buffer;
  now?: () => number;
  log?: (m: string, x?: unknown) => void;
  opsAlert?: (m: string) => void;
  eewDrillKey?: Buffer;
}

export function createPlatform(o: PlatformOptions) {
  const db = openDb(o.dbPath);
  let worker: DeliveryWorker | null = null;
  const ctx: Ctx = {
    db,
    now: o.now ?? Date.now,
    push: o.push,
    publicUrl: o.publicUrl.replace(/\/$/, ''),
    secret: o.secret ?? randomBytes(32),
    log: o.log ?? ((m, x) => console.log(`[${new Date().toISOString()}] ${m}`, x ?? '')),
    wake: () => worker?.wake(),
    opsAlert: o.opsAlert ?? ((m) => console.warn(`[OPS] ${m}`)),
  };
  worker = new DeliveryWorker(ctx);
  const eewProviders = new Map<string, EewProvider>();
  eewProviders.set('TEST-EEW', {
    id: 'TEST-EEW', name: 'Tatbikat erken uyarı sağlayıcısı (imzalı)', authorized: true, distributionAllowed: true, drillOnly: true,
    hmacKey: o.eewDrillKey ?? randomBytes(32),
  });
  return { ctx, worker, eewProviders };
}
