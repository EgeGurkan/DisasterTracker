import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPlatform } from './platform.ts';
import { createHandler } from './app.ts';
import { PushRouter } from './push/router.ts';
import { generateVapid, type VapidKeys } from './push/webpush.ts';
import { FcmSender } from './push/fcm.ts';
import { ApnsSender } from './push/apns.ts';
import { backfill, startPollers } from './sources/poller.ts';

const here = dirname(fileURLToPath(import.meta.url));
// Bilerek projeye özgü değişken adı: genel DATA_DIR/PORT başka uygulamalarla çakışabilir.
const DATA = resolve(process.env.AFET_DATA_DIR ?? join(here, '../../data'));
const PORT = Number(process.env.AFET_PORT ?? 8787);
const PUBLIC_URL = process.env.AFET_PUBLIC_URL ?? '';
mkdirSync(DATA, { recursive: true });

interface Secrets { vapid: VapidKeys; secret: string; adminToken: string; eewDrillKey: string }
const secretsPath = join(DATA, 'secrets.json');
let secrets: Secrets;
if (existsSync(secretsPath)) {
  secrets = JSON.parse(readFileSync(secretsPath, 'utf8')) as Secrets;
} else {
  secrets = {
    vapid: generateVapid('mailto:ops@afet-takip.example'),
    secret: randomBytes(32).toString('base64url'),
    adminToken: randomBytes(18).toString('base64url'),
    eewDrillKey: randomBytes(32).toString('base64url'),
  };
  writeFileSync(secretsPath, JSON.stringify(secrets, null, 2), { mode: 0o600 });
}
// Apple Web Push, VAPID "sub" alanında geçerli bir https:// veya mailto: ister.
if (process.env.VAPID_SUBJECT) secrets.vapid.subject = process.env.VAPID_SUBJECT;
else if (PUBLIC_URL.startsWith('https://')) secrets.vapid.subject = PUBLIC_URL;

const fcm = process.env.FCM_SERVICE_ACCOUNT ? new FcmSender(process.env.FCM_SERVICE_ACCOUNT) : null;
const apns = process.env.APNS_KEY_PATH ? new ApnsSender({
  keyPath: process.env.APNS_KEY_PATH, keyId: process.env.APNS_KEY_ID ?? '', teamId: process.env.APNS_TEAM_ID ?? '',
  bundleId: process.env.APNS_BUNDLE_ID ?? 'tr.afettakip.app', sandbox: process.env.APNS_SANDBOX === '1',
  criticalEntitled: process.env.APNS_CRITICAL === '1',
}) : null;

let lastOps = 0;
const opsAlert = (m: string) => {
  console.warn(`[OPS ${new Date().toISOString()}] ${m}`);
  const hook = process.env.OPS_WEBHOOK_URL;
  if (hook && Date.now() - lastOps > 30_000) {
    lastOps = Date.now();
    void fetch(hook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: `[afet-takip] ${m}` }) }).catch(() => {});
  }
};

const { ctx, worker, eewProviders } = createPlatform({
  dbPath: join(DATA, 'afet.db'),
  push: new PushRouter(secrets.vapid, fcm, apns),
  publicUrl: '',
  secret: Buffer.from(secrets.secret, 'base64url'),
  eewDrillKey: Buffer.from(secrets.eewDrillKey, 'base64url'),
  opsAlert,
});

const webRoot = resolve(here, '../../web/dist');
const handler = createHandler({
  ctx, worker, vapidPublicKey: secrets.vapid.publicKey, adminToken: secrets.adminToken, eewProviders,
  webRoot: existsSync(webRoot) ? webRoot : null, env: 'pilot',
});

worker.start();
createServer((req, res) => void handler(req, res)).listen(PORT, () => {
  ctx.log(`Afet Takip sunucusu http://localhost:${PORT} (veri: ${DATA})`);
  ctx.log(`Yönetici belirteci: ${join(DATA, 'secrets.json')} → adminToken`);
  ctx.log(`Aktarım: webpush=açık fcm=${fcm ? 'açık' : 'kapalı'} apns=${apns ? 'açık' : 'kapalı'}${existsSync(webRoot) ? '' : ' · UYARI: web/dist yok, önce npm run build'}`);
});

if (process.env.AFET_NO_POLL !== '1') {
  startPollers(ctx);
  setTimeout(() => { void backfill(ctx); }, 1500);
}
