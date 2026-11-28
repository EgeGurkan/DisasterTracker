import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { DB } from './db.ts';
import type { PushSender } from './push/types.ts';

export interface Ctx {
  db: DB;
  now: () => number;
  push: PushSender;
  publicUrl: string;
  /** Makbuz bağlantılarını imzalamak için sunucu sırrı */
  secret: Buffer;
  log: (msg: string, extra?: unknown) => void;
  /** Kuyruğa yeni iş girdiğinde çalışanı uyandırır */
  wake: () => void;
  /** Kesinti ve gecikmede sorumlu ekibe haber (webhook/log) */
  opsAlert: (msg: string) => void;
}

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(9).toString('base64url')}`;
}

export function iso(ms: number): string {
  return new Date(ms).toISOString();
}

export function receiptToken(secret: Buffer, deliveryId: string): string {
  return createHmac('sha256', secret).update(`receipt:${deliveryId}`).digest('base64url').slice(0, 22);
}

export function checkReceiptToken(secret: Buffer, deliveryId: string, token: string): boolean {
  const a = Buffer.from(receiptToken(secret, deliveryId));
  const b = Buffer.from(String(token));
  return a.length === b.length && timingSafeEqual(a, b);
}
