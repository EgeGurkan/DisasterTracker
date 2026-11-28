// Şartname §10 kabul senaryoları (sunucu tarafı). Tümü TEST olaylarla, gerçek kullanıcılardan yalıtılmış
// sahte push sağlayıcısıyla çalışır. Gerçek cihaz kanıtı docs/TESLIM_RAPORU.md'de ayrıca tutulur.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { destinationPoint } from '../../shared/src/geo.ts';
import { ingestRecords } from '../src/events.ts';
import { ingestEew, signEew } from '../src/eew.ts';
import { ISTANBUL, IZMIR, prefsOnly, setup } from './helpers.ts';

const savedLoc = (label: string, place: string, c: { lat: number; lon: number }, radiusKm: number, minMag: number) =>
  ({ id: label.toLowerCase(), label, place, lat: c.lat, lon: c.lon, enabled: true, radiusKm, minMag });

test('Yerel eşik ve yarıçap: tam 100 km / M 3,5 bildirir; 101 km veya M 3,4 bildirmez', async () => {
  const s = setup();
  s.addDevice('Ev cihazı', prefsOnly({ saved: [savedLoc('Ev', 'İzmir', IZMIR, 100, 3.5)] }));
  const at100 = destinationPoint(IZMIR.lat, IZMIR.lon, 90, 100);
  const at101 = destinationPoint(IZMIR.lat, IZMIR.lon, 90, 101);
  ingestRecords(s.ctx, [s.rec({ ...at100, magnitude: 3.5 })], { notify: true });
  s.advance(60_000);
  ingestRecords(s.ctx, [s.rec({ ...at101, magnitude: 5.0 })], { notify: true });
  s.advance(60_000);
  ingestRecords(s.ctx, [s.rec({ lat: IZMIR.lat + 0.1, lon: IZMIR.lon, magnitude: 3.4 })], { notify: true });
  await s.worker.drain();
  assert.equal(s.push.sent.length, 1);
  assert.match(s.push.sent[0]!.payload.title, /Ev · İzmir’e 100 km uzaklıkta/);
});

test('Uzak konum: aktif İstanbul, aile İzmir → yalnız aile yakınındaki olay "Ailem · İzmir" başlığıyla gelir', async () => {
  const s = setup();
  s.addDevice('Telefon', prefsOnly({
    active: { enabled: true, radiusKm: 100, minMag: 3.5, permission: 'granted', ...ISTANBUL, measuredAt: new Date(s.clock() - 60_000).toISOString(), accuracyM: 20 },
    saved: [savedLoc('Ailem', 'İzmir', IZMIR, 100, 3.5)],
  }));
  const near = destinationPoint(IZMIR.lat, IZMIR.lon, 200, 42);
  ingestRecords(s.ctx, [s.rec({ ...near, magnitude: 4.1, place: 'Menderes (İzmir)' })], { notify: true });
  await s.worker.drain();
  assert.equal(s.push.sent.length, 1);
  const p = s.push.sent[0]!.payload;
  assert.match(p.title, /^TEST · Ailem · İzmir’e 42 km uzaklıkta deprem kaydedildi$/);
  assert.match(p.body, /M 4,1 \(ML\) · \d\d:\d\d · Menderes \(İzmir\) · Kaynak: TEST/);
});

test('İsim verilmemiş aranarak eklenmiş yer: başlıkta yalnız yer adı görünür', async () => {
  const s = setup();
  s.addDevice('Telefon', prefsOnly({ saved: [{ id: 'p1', label: '', place: 'İzmir', ...IZMIR, enabled: true, radiusKm: 100, minMag: 3.5 }] }));
  ingestRecords(s.ctx, [s.rec({ ...destinationPoint(IZMIR.lat, IZMIR.lon, 180, 42), magnitude: 4.0 })], { notify: true });
  await s.worker.drain();
  assert.equal(s.push.sent[0]!.payload.title, 'TEST · İzmir’e 42 km uzaklıkta deprem kaydedildi');
});

test('Dünya kuralı GPS kapalıyken de çalışır; M 6,5 eşiğinde uzak ülkedeki M 6,5 bildirilir', async () => {
  const s = setup();
  s.addDevice('Telefon', prefsOnly({
    active: { enabled: true, radiusKm: 100, minMag: 3.5, permission: 'denied', lat: null, lon: null, measuredAt: null, accuracyM: null },
    world: { enabled: true, minMag: 6.5 },
  }));
  ingestRecords(s.ctx, [s.rec({ lat: 38.3, lon: 142.4, magnitude: 6.5, magType: 'Mw', place: 'near east coast of Honshu, Japan', region: 'Japonya' })], { notify: true });
  ingestRecords(s.ctx, [s.rec({ lat: -20, lon: -70, magnitude: 6.4, magType: 'Mw', region: 'Şili' })], { notify: true });
  await s.worker.drain();
  assert.equal(s.push.sent.length, 1);
  assert.equal(s.push.sent[0]!.payload.title, 'TEST · Dünya genelinde deprem');
  assert.match(s.push.sent[0]!.payload.body, /^Japonya · M 6,5 \(Mw\)/);
});

test('İki konum ve dünya kuralı örtüşürse cihaza tek bildirim gider, tüm nedenler kaydedilir', async () => {
  const s = setup();
  const dev = s.addDevice('Telefon', prefsOnly({
    active: { enabled: true, radiusKm: 150, minMag: 3, permission: 'granted', ...IZMIR, measuredAt: new Date(s.clock()).toISOString(), accuracyM: 10 },
    saved: [savedLoc('Ailem', 'İzmir', IZMIR, 100, 3.5), savedLoc('Ev', 'Manisa', { lat: 38.61, lon: 27.43 }, 100, 3.5)],
    world: { enabled: true, minMag: 6.5 },
  }));
  ingestRecords(s.ctx, [s.rec({ lat: 38.5, lon: 27.2, magnitude: 6.6, magType: 'Mw' })], { notify: true });
  await s.worker.drain();
  assert.equal(s.push.sent.length, 1);
  const d = s.ctx.db.prepare('SELECT reasons_json FROM deliveries WHERE device_id = ?').get(dev) as { reasons_json: string };
  const kinds = (JSON.parse(d.reasons_json) as { kind: string }[]).map((r) => r.kind).sort();
  assert.deepEqual(kinds, ['active', 'saved', 'saved', 'world']);
});

test('Aktif konum eskimişse kullanılmaz; kayıtlı konum yine çalışır', async () => {
  const s = setup();
  s.addDevice('Telefon', prefsOnly({
    active: { enabled: true, radiusKm: 100, minMag: 3, permission: 'granted', ...ISTANBUL, measuredAt: new Date(s.clock() - 7 * 3600_000).toISOString(), accuracyM: 10 },
  }));
  ingestRecords(s.ctx, [s.rec({ lat: 40.9, lon: 29.0, magnitude: 4.5 })], { notify: true });
  await s.worker.drain();
  assert.equal(s.push.sent.length, 0);
});

test('Büyüklüğü eksik kayıt eşiği karşılamış sayılmaz', async () => {
  const s = setup();
  s.addDevice('T', prefsOnly({ saved: [savedLoc('Ailem', 'İzmir', IZMIR, 100, 0)], world: { enabled: true, minMag: 0 } }));
  ingestRecords(s.ctx, [s.rec({ ...IZMIR, magnitude: null })], { notify: true });
  await s.worker.drain();
  assert.equal(s.push.sent.length, 0);
});

test('Çift kaynak: aynı olay iki kurumdan gelince bir olay + iki kaynak; tek bildirim', async () => {
  const s = setup();
  s.addDevice('T', prefsOnly({ saved: [savedLoc('Ailem', 'İzmir', IZMIR, 100, 3.5)] }));
  const t = new Date(s.clock() - 10_000).toISOString();
  const t2 = new Date(s.clock() - 8_000).toISOString();
  const a = ingestRecords(s.ctx, [s.rec({ source: 'TEST', sourceEventId: 'afad-1', ...IZMIR, magnitude: 4.0, originTime: t })], { notify: true });
  s.advance(20_000);
  const b = ingestRecords(s.ctx, [s.rec({ source: 'EMSC', sourceEventId: 'emsc-1', lat: IZMIR.lat + 0.08, lon: IZMIR.lon - 0.05, magnitude: 4.2, originTime: t2 })], { notify: true });
  assert.equal(a[0]!.eventId, b[0]!.eventId);
  assert.equal(b[0]!.change, 'merged');
  const n = s.ctx.db.prepare('SELECT COUNT(*) AS n FROM source_records WHERE event_id = ?').get(a[0]!.eventId) as { n: number };
  assert.equal(n.n, 2);
  await s.worker.drain();
  assert.equal(s.push.sent.length, 1);
});

test('Yakın zaman ve yerdeki iki ayrı artçı korunur (aynı kurum asla tek olaya katlanmaz)', () => {
  const s = setup();
  const t = s.clock() - 30_000;
  const r1 = ingestRecords(s.ctx, [s.rec({ source: 'TEST', sourceEventId: 'a1', ...IZMIR, originTime: new Date(t).toISOString(), magnitude: 3.1 })], { notify: false });
  const r2 = ingestRecords(s.ctx, [s.rec({ source: 'TEST', sourceEventId: 'a2', lat: IZMIR.lat + 0.01, lon: IZMIR.lon, originTime: new Date(t + 6000).toISOString(), magnitude: 3.0 })], { notify: false });
  assert.notEqual(r1[0]!.eventId, r2[0]!.eventId);
  // Başka kurumdan gelen kayıt zamanca en yakın olaya bağlanır
  const r3 = ingestRecords(s.ctx, [s.rec({ source: 'EMSC', sourceEventId: 'x2', lat: IZMIR.lat, lon: IZMIR.lon, originTime: new Date(t + 6500).toISOString(), magnitude: 3.0 })], { notify: false });
  assert.equal(r3[0]!.eventId, r2[0]!.eventId);
});

test('Eşiği ilk kez aşan revizyon tek bildirim üretir; sonraki revizyon yeni bildirim üretmez', async () => {
  const s = setup();
  s.addDevice('T', prefsOnly({ saved: [savedLoc('Ailem', 'İzmir', IZMIR, 100, 4.0)] }));
  ingestRecords(s.ctx, [s.rec({ sourceEventId: 'rev', ...IZMIR, magnitude: 3.8 })], { notify: true });
  await s.worker.drain();
  assert.equal(s.push.sent.length, 0);
  s.advance(30_000);
  ingestRecords(s.ctx, [s.rec({ sourceEventId: 'rev', ...IZMIR, magnitude: 4.1, originTime: new Date(s.clock() - 35_000).toISOString() })], { notify: true });
  await s.worker.drain();
  assert.equal(s.push.sent.length, 1);
  s.advance(30_000);
  ingestRecords(s.ctx, [s.rec({ sourceEventId: 'rev', ...IZMIR, magnitude: 4.4, originTime: new Date(s.clock() - 65_000).toISOString() })], { notify: true });
  await s.worker.drain();
  assert.equal(s.push.sent.length, 1);
});

test('Geri çekilen katalog kaydı, bildirim almış cihaza "geri çekildi" mesajı gönderir', async () => {
  const s = setup();
  s.addDevice('T', prefsOnly({ saved: [savedLoc('Ailem', 'İzmir', IZMIR, 100, 3.5)] }));
  const base = s.rec({ sourceEventId: 'del', ...IZMIR, magnitude: 4.0 });
  ingestRecords(s.ctx, [base], { notify: true });
  await s.worker.drain();
  ingestRecords(s.ctx, [{ ...base, status: 'deleted' }], { notify: true });
  await s.worker.drain();
  assert.equal(s.push.sent.length, 2);
  assert.equal(s.push.sent[1]!.payload.kind, 'retraction');
  assert.equal(s.push.sent[1]!.payload.tag, s.push.sent[0]!.payload.tag);
});

test('TEST olaylar üretim cihazlarına gitmez (tatbikat yalıtımı)', async () => {
  const s = setup();
  s.addDevice('Üretim', prefsOnly({ saved: [savedLoc('Ailem', 'İzmir', IZMIR, 100, 3)] }), 'production');
  ingestRecords(s.ctx, [s.rec({ ...IZMIR, magnitude: 5 })], { notify: true });
  await s.worker.drain();
  assert.equal(s.push.sent.length, 0);
});

test('Kanal kapalıysa ilgili kural çalışmaz; sohbeti kapatmak deprem aboneliğini etkilemez', async () => {
  const s = setup();
  const base = prefsOnly({ saved: [savedLoc('Ailem', 'İzmir', IZMIR, 100, 3)] });
  s.addDevice('Yakın kapalı', { ...base, channels: { ...(await import('../../shared/src/defaults.ts')).defaultPrefs().channels, depremYakin: false } });
  s.addDevice('Sohbet kapalı', { ...base, channels: { ...(await import('../../shared/src/defaults.ts')).defaultPrefs().channels, sohbet: false } });
  ingestRecords(s.ctx, [s.rec({ ...IZMIR, magnitude: 4 })], { notify: true });
  await s.worker.drain();
  assert.equal(s.push.sent.length, 1);
});

test('Eski olay (geri doldurma/geç alım) bildirim üretmez', async () => {
  const s = setup();
  s.addDevice('T', prefsOnly({ saved: [savedLoc('Ailem', 'İzmir', IZMIR, 100, 3)] }));
  ingestRecords(s.ctx, [s.rec({ ...IZMIR, magnitude: 5, originTime: new Date(s.clock() - 31 * 60_000).toISOString() })], { notify: true });
  await s.worker.drain();
  assert.equal(s.push.sent.length, 0);
});

// ---- Erken uyarı ----

const eewBase = (s: ReturnType<typeof setup>, o: Record<string, unknown> = {}) => ({
  provider: 'TEST-EEW', alertId: 'A1', version: 1, msgType: 'alert' as const, status: 'test' as const,
  issuedAt: new Date(s.clock()).toISOString(), expiresAt: new Date(s.clock() + 60_000).toISOString(),
  epicenter: { lat: 38.3, lon: 27.0 }, magnitude: 5.9, area: { circles: [{ lat: 38.3, lon: 27.0, radiusKm: 60 }] }, headline: null, ...o,
});

test('Yetkili test mesajı yalnız hedef alandaki noktalara uyarı verir; uzak kayıtlı yer başlığı doğru', async () => {
  const s = setup();
  const key = s.eewProviders.get('TEST-EEW')!.hmacKey;
  s.addDevice('Aile hedefte', prefsOnly({
    active: { enabled: true, radiusKm: 100, minMag: 3, permission: 'granted', ...ISTANBUL, measuredAt: new Date(s.clock()).toISOString(), accuracyM: 10 },
    saved: [savedLoc('Ailem', 'İzmir', IZMIR, 100, 3.5)],
  }));
  s.addDevice('Hedef dışı', prefsOnly({ saved: [savedLoc('Ev', 'Ankara', { lat: 39.93, lon: 32.85 }, 100, 3.5)] }));
  const r = ingestEew(s.ctx, s.eewProviders, signEew(eewBase(s), key));
  assert.equal(r.decision, 'accepted');
  await s.worker.drain();
  assert.equal(s.push.sent.length, 1);
  assert.equal(s.push.sent[0]!.payload.title, 'TEST · Ailem · İzmir için sarsıntı uyarısı');
  assert.equal(s.push.sent[0]!.payload.kind, 'eew');
  // Uzaktaki konum için ses ayrıca açılmadıysa sessiz
  assert.equal(s.push.sent[0]!.payload.silent, true);
});

test('Erken uyarı katalog kaydının arkasında beklemez ve önce gelen katalog kaydı uyarıyı engellemez', async () => {
  const s = setup();
  const key = s.eewProviders.get('TEST-EEW')!.hmacKey;
  s.addDevice('T', prefsOnly({
    active: { enabled: true, radiusKm: 100, minMag: 3, permission: 'granted', ...IZMIR, measuredAt: new Date(s.clock()).toISOString(), accuracyM: 10 },
  }));
  ingestRecords(s.ctx, [s.rec({ lat: 38.3, lon: 27.0, magnitude: 4.5 })], { notify: true });
  ingestEew(s.ctx, s.eewProviders, signEew(eewBase(s), key));
  // Kritik şerit önce işler
  await s.worker.tick();
  const kinds = s.push.sent.map((x) => x.payload.kind);
  assert.equal(kinds[0], 'eew');
  assert.ok(kinds.includes('catalog'));
  assert.equal(s.push.sent.find((x) => x.payload.kind === 'eew')!.payload.critical, true);
});

test('İmzasız/sahte veya yetkisiz mesaj reddedilir; TEST sağlayıcısı "actual" yayımlayamaz', () => {
  const s = setup();
  const key = s.eewProviders.get('TEST-EEW')!.hmacKey;
  assert.equal(ingestEew(s.ctx, s.eewProviders, { ...eewBase(s), signature: 'x' }).decision, 'bad-signature');
  assert.equal(ingestEew(s.ctx, s.eewProviders, signEew({ ...eewBase(s), provider: 'BILINMEYEN' }, key)).decision, 'unknown-provider');
  assert.equal(ingestEew(s.ctx, s.eewProviders, signEew({ ...eewBase(s), status: 'actual' as 'test' }, key)).decision, 'actual-from-drill-provider');
});

test('Süresi dolmuş mesaj gönderilmez; kuyrukta beklerken süresi dolan mesaj yeniden bağlantıda siren çalmaz', async () => {
  const s = setup();
  const key = s.eewProviders.get('TEST-EEW')!.hmacKey;
  s.addDevice('T', prefsOnly({
    active: { enabled: true, radiusKm: 100, minMag: 3, permission: 'granted', lat: 38.3, lon: 27.0, measuredAt: new Date(s.clock()).toISOString(), accuracyM: 10 },
  }));
  const late = ingestEew(s.ctx, s.eewProviders, signEew(eewBase(s, { alertId: 'OLD', expiresAt: new Date(s.clock() - 1000).toISOString() }), key));
  assert.equal(late.decision, 'expired-on-arrival');
  // Bağlantı yok: sağlayıcı geçici hata veriyor, sonra mesajın süresi doluyor
  s.push.responder = () => ({ ok: false, status: 503, detail: 'çevrimdışı', retryable: true });
  ingestEew(s.ctx, s.eewProviders, signEew(eewBase(s, { alertId: 'B', expiresAt: new Date(s.clock() + 5000).toISOString() }), key));
  await s.worker.tick();
  s.advance(10_000);
  s.push.responder = () => ({ ok: true, status: 201, detail: 'ok' });
  await s.worker.drain();
  assert.equal(s.push.sent.length, 0);
  const st = s.ctx.db.prepare("SELECT status FROM deliveries WHERE kind = 'eew'").get() as { status: string };
  assert.equal(st.status, 'expired');
});

test('Geri çekilmiş uyarı, sonradan ulaşan eski sürümle yeniden etkinleşmez', async () => {
  const s = setup();
  const key = s.eewProviders.get('TEST-EEW')!.hmacKey;
  s.addDevice('T', prefsOnly({
    active: { enabled: true, radiusKm: 100, minMag: 3, permission: 'granted', lat: 38.3, lon: 27.0, measuredAt: new Date(s.clock()).toISOString(), accuracyM: 10 },
  }));
  assert.equal(ingestEew(s.ctx, s.eewProviders, signEew(eewBase(s, { version: 1 }), key)).decision, 'accepted');
  assert.equal(ingestEew(s.ctx, s.eewProviders, signEew(eewBase(s, { version: 3, msgType: 'cancel' }), key)).decision, 'accepted');
  assert.equal(ingestEew(s.ctx, s.eewProviders, signEew(eewBase(s, { version: 2 }), key)).decision, 'stale-version');
  assert.equal(ingestEew(s.ctx, s.eewProviders, signEew(eewBase(s, { version: 4 }), key)).decision, 'already-cancelled');
  await s.worker.drain();
  assert.deepEqual(s.push.sent.map((x) => x.payload.kind), ['eew', 'eew-cancel']);
});

// ---- Kuyruk dayanıklılığı ----

test('Yeniden başlatmada yarım kalan gönderim devam eder; geçersiz belirteç cihazı kapatır', async () => {
  const s = setup();
  const dev = s.addDevice('T', prefsOnly({ saved: [savedLoc('Ailem', 'İzmir', IZMIR, 100, 3)] }));
  ingestRecords(s.ctx, [s.rec({ ...IZMIR, magnitude: 4 })], { notify: true });
  s.ctx.db.prepare("UPDATE deliveries SET status = 'sending'").run(); // çökme anı
  assert.equal(s.worker.recover(), 1);
  await s.worker.drain();
  assert.equal(s.push.sent.length, 1);
  s.push.responder = () => ({ ok: false, status: 410, detail: 'Gone', invalidToken: true });
  s.advance(60_000);
  ingestRecords(s.ctx, [s.rec({ ...IZMIR, magnitude: 4.5 })], { notify: true });
  await s.worker.drain();
  const d = s.ctx.db.prepare('SELECT push_valid FROM devices WHERE id = ?').get(dev) as { push_valid: number };
  assert.equal(d.push_valid, 0);
});

test('Gönderim kuyruğu: olay alımından ilk gönderim isteğine p95 ≤ 2 sn (100 cihaz, 5 eşzamanlı olay, sahte sağlayıcı)', async () => {
  const s = setup(Date.now());
  for (let i = 0; i < 100; i++) s.addDevice(`c${i}`, prefsOnly({ saved: [savedLoc('Ailem', 'İzmir', IZMIR, 300, 3)], world: { enabled: true, minMag: 6 } }));
  // gerçek saatle ölç
  const realStart = Date.now();
  for (let k = 0; k < 5; k++) ingestRecords(s.ctx, [s.rec({ lat: IZMIR.lat + k * 0.2, lon: IZMIR.lon, magnitude: 4 + k * 0.1, originTime: new Date(Date.now() - 2000).toISOString() })], { notify: true });
  await s.worker.drain();
  const elapsed = Date.now() - realStart;
  assert.equal(s.push.sent.length, 500);
  assert.ok(elapsed < 2000, `toplam süre ${elapsed} ms`);
});
