import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dative, formatDepth, formatKm, formatMag, magClass, relativeTR } from '../../shared/src/turkish.ts';
import { buildCatalogText, buildRetractionText, matchCatalogEvent } from '../../shared/src/match.ts';
import { defaultPrefs } from '../../shared/src/defaults.ts';
import { summarize } from '../../shared/src/merge.ts';
import {
  extractRegionFaults, normalizeAfad, normalizeEmsc, normalizeGeonet, normalizeJma,
  normalizeUsgs, normMagType, parseFdsnEventText, parseKoeriHtml,
} from '../src/sources/adapters.ts';
import { parseEonetEvents, parseGdacsRss } from '../src/sources/hazards.ts';
import { INVENTORY } from '../src/sources/inventory.ts';

test('Türkçe yönelme eki', () => {
  assert.equal(dative('İzmir'), 'İzmir’e');
  assert.equal(dative('İstanbul'), 'İstanbul’a');
  assert.equal(dative('Ankara'), 'Ankara’ya');
  assert.equal(dative('Rize'), 'Rize’ye');
  assert.equal(dative('Muş'), 'Muş’a');
  assert.equal(dative('Düzce'), 'Düzce’ye');
});

test('Büyüklük, derinlik ve uzaklık TR/EN biçimlendirmesi', () => {
  assert.equal(formatMag(4.1, 'ML', 'tr'), 'M 4,1 (ML)');
  assert.equal(formatMag(4.1, 'ML', 'en'), 'M 4.1 (ML)');
  assert.equal(formatMag(null, null, 'tr'), 'Büyüklük bilinmiyor');
  assert.equal(formatMag(null, null, 'en'), 'Magnitude unknown');
  assert.equal(formatDepth(8.5, 'tr'), '8,5 km derinlik');
  assert.equal(formatDepth(8.5, 'en'), '8.5 km depth');
  assert.equal(formatKm(6.4, 'en'), '6.4 km');
  assert.equal(magClass(5.2, 'en').label, 'Strong');
  assert.equal(relativeTR(Date.now() - 5 * 60_000, Date.now(), 'en'), '5m ago');
});

test('AFAD tarihi UTC kabul edilir ve normalize edilir', () => {
  const r = normalizeAfad({ eventID: '734675', location: 'Kahta (Adıyaman)', latitude: '37.64883', longitude: '38.7065', depth: '7.42', type: 'ML', magnitude: '1.5', country: 'Türkiye', province: 'Adıyaman', district: 'Kahta', date: '2026-11-20T12:17:10', isEventUpdate: false, lastUpdateDate: null })!;
  assert.equal(r.originTime, '2026-11-20T12:17:10.000Z');
  assert.equal(r.magnitude, 1.5);
  assert.equal(r.sourcePublishedAt, null);
});

test('Eksik derinlik null olarak korunur', () => {
  const r = normalizeAfad({ eventID: '1', location: 'X', latitude: '38', longitude: '27', depth: '', type: 'ML', magnitude: '', country: null, province: null, district: null, date: '2026-11-20T12:17:10', isEventUpdate: false, lastUpdateDate: null })!;
  assert.equal(r.depthKm, null);
  assert.equal(r.magnitude, null);
});

test('USGS ve EMSC normalizasyonu', () => {
  const u = normalizeUsgs({ id: 'us1', properties: { mag: 6.8, place: '120 km E of Miyako, Japan', time: 1795173935140, updated: 1795178760548, url: 'u', status: 'reviewed', magType: 'mww', type: 'earthquake', title: '' }, geometry: { coordinates: [142, 39, 30] } })!;
  assert.equal(u.region, 'Japonya');
  assert.equal(u.magType, 'Mww');
  const e = normalizeEmsc({ id: 'x', properties: { unid: '20261120_1', time: '2026-11-20T12:37:00.0Z', lastupdate: '2026-11-20T12:42:17Z', lat: 38, lon: 27, depth: 10, mag: 3.8, magtype: 'ml', flynn_region: 'WESTERN TURKEY', evtype: 'ke', auth: 'X' } })!;
  assert.equal(e.place, 'Western Turkey');
  assert.equal(e.magType, 'ML');
  assert.equal(normMagType('mb'), 'mb');
  assert.equal(normMagType('MLh'), 'ML');
});

test('Kandilli (KOERI) HTML ayrıştırması: Türkiye saati (+03:00) UTC’ye çevrilir, Mw önceliklidir ve REVIZE tanınır', () => {
  const html = `<HTML><BODY><pre>
Tarih      Saat      Enlem(N)  Boylam(E) Derinlik(km)  MD   ML   Mw    Yer                                             Çözüm Niteliği
---------- --------  --------  -------   ----------    ------------    --------------                                  --------------
2026.11.27 22:23:42  37.1280   27.8643       11.3      -.-  3.1  3.0   BAGDAMLARI-MILAS (MUGLA)                          İlksel
2026.11.27 12:32:37  39.2642   28.1070        8.2      -.-  1.9  -.-   KARAGUR-SINDIRGI (BALIKESIR)                      REVIZE01   (2026.11.27 12:32:46)
</pre></BODY></HTML>`;
  const recs = parseKoeriHtml(html);
  assert.equal(recs.length, 2);
  assert.equal(recs[0]!.source, 'KOERI');
  assert.equal(recs[0]!.originTime, '2026-11-27T19:23:42.000Z');
  assert.equal(recs[0]!.magnitude, 3.0);
  assert.equal(recs[0]!.magType, 'Mw');
  assert.equal(recs[0]!.status, 'automatic');
  assert.equal(recs[1]!.status, 'reviewed');
  assert.equal(recs[1]!.sourcePublishedAt, '2026-11-27T09:32:46.000Z');
  assert.equal(recs[1]!.magType, 'ML');
});

test('FDSN metin (GEOFON, NOA, INGV), GeoNet, JMA ve diri fay ayrıştırması', () => {
  const fdsn = `#EventID|Time|Latitude|Longitude|Depth/km|Author|Catalog|Contributor|ContributorID|MagType|Magnitude|MagAuthor|EventLocationName|EventType
noa2026xgqde|2026-11-27T20:34:55.750605|38.2498|26.6442|18.17|A.Papageorgiou||NOAIG|noa2026xgqde|MLh|3.64|A.P|Aegean Sea|earthquake
blast1|2026-11-27T20:00:00|38.0|27.0|1.0|auto||||ML|2.1||Quarry|quarry blast`;
  const noa = parseFdsnEventText(fdsn, 'NOA', { urlOf: () => 'https://bbnet.gein.noa.gr/', reviewedIf: (a) => !/auto/i.test(a) });
  assert.equal(noa.length, 1);
  assert.equal(noa[0]!.magType, 'ML');
  assert.equal(noa[0]!.magnitude, 3.6);
  assert.equal(noa[0]!.status, 'reviewed');

  const gn = normalizeGeonet({
    geometry: { coordinates: [175.83, -40.68] },
    properties: { publicID: '2026p894209', time: '2026-11-27T20:34:58.284Z', depth: 22.58, magnitude: 4.36, locality: '10 km east of Eketahuna', quality: 'best' },
  })!;
  assert.equal(gn.source, 'GEONET');
  assert.equal(gn.magnitude, 4.4);
  assert.equal(gn.status, 'reviewed');

  const jma = normalizeJma({
    eid: '20261128043207', ctt: '20261128043444', at: '2026-11-28T04:32:00+09:00', rdt: '2026-11-28T04:34:00+09:00',
    cod: '+43.3+145.3-80000/', mag: '5.1', en_anm: 'Southern Nemuro Region, Hokkaido',
  })!;
  assert.equal(jma.source, 'JMA');
  assert.equal(jma.depthKm, 80);
  assert.equal(jma.originTime, '2026-11-27T19:32:00.000Z');
  assert.equal(jma.magType, 'Mj');

  const faults = extractRegionFaults({
    features: [
      { properties: { catalog_id: 'NAF1', name: 'North Anatolian Fault', slip_type: 'Dextral', catalog_name: 'EMME' }, geometry: { type: 'LineString', coordinates: [[29.0, 40.7], [30.5, 40.75]] } },
      { properties: { catalog_id: 'FAR1' }, geometry: { type: 'LineString', coordinates: [[-120.0, 36.0], [-121.0, 36.5]] } },
    ],
  });
  assert.equal(faults.length, 1);
  assert.equal(faults[0]!.name, 'North Anatolian Fault');
});

test('Türkiye bölgesinde özet önceliği AFAD > KOERI > NOA > EMSC ve İngilizce bildirim metni üretimi', () => {
  const sum = summarize('ev1', 1, [
    { source: 'EMSC', sourceEventId: 'e1', originTime: '2026-11-27T20:00:00.000Z', sourcePublishedAt: null, lat: 38.4, lon: 27.1, depthKm: 10, magnitude: 4.1, magType: 'ML', place: 'Western Turkey', region: 'Türkiye', status: 'automatic', url: null, isTest: false },
    { source: 'KOERI', sourceEventId: 'k1', originTime: '2026-11-27T20:00:01.000Z', sourcePublishedAt: null, lat: 38.42, lon: 27.12, depthKm: 9.4, magnitude: 4.2, magType: 'Mw', place: 'Urla (İzmir)', region: 'Türkiye', status: 'reviewed', url: null, isTest: false },
  ]);
  assert.equal(sum.summarySource, 'KOERI');

  const prefs = {
    ...defaultPrefs(),
    lang: 'en' as const,
    saved: [{ id: 's1', label: 'Family', place: 'Izmir', lat: 38.42, lon: 27.13, enabled: true, radiusKm: 100, minMag: 3.5 }],
  };
  const m = matchCatalogEvent(sum, prefs, Date.parse('2026-11-27T20:01:00.000Z'))!;
  const txt = buildCatalogText(sum, m, 'en');
  assert.match(txt.title, /^Earthquake recorded .* from Family · Izmir$/);
  assert.match(txt.body, /Source: KOERI/);
  assert.equal(buildRetractionText(sum, 'en').title, 'Earthquake record retracted');
});

test('Sismik Ağ envanter sıralaması (AFAD-TDTH, EEW-TR üzerinde) ve çoklu afet ayrıştırıcıları', () => {
  const tdthIdx = INVENTORY.findIndex((i) => i.id === 'AFAD-TDTH');
  const eewIdx = INVENTORY.findIndex((i) => i.id === 'EEW-TR');
  assert.ok(tdthIdx >= 0 && eewIdx >= 0);
  assert.equal(eewIdx, tdthIdx + 1, 'AFAD-TDTH, EEW-TR kaynağının bir üstünde yer almalı');

  const eonet = parseEonetEvents([
    {
      id: 'EONET_1', title: 'Muğla Wildfire, Turkey', description: null, link: 'https://eonet.gsfc.nasa.gov/api/v3/events/EONET_1',
      categories: [{ id: 'wildfires', title: 'Wildfires' }],
      geometry: [{ magnitudeValue: 6200, magnitudeUnit: 'acres', date: '2026-11-27T18:00:00Z', type: 'Point', coordinates: [28.36, 37.21] }],
    },
    {
      id: 'EONET_2', title: 'Tornado Outbreak, Oklahoma', description: null, link: 'https://eonet.gsfc.nasa.gov/api/v3/events/EONET_2',
      categories: [{ id: 'severeStorms', title: 'Severe Storms' }],
      geometry: [{ magnitudeValue: null, magnitudeUnit: null, date: '2026-11-27T19:00:00Z', type: 'Polygon', coordinates: [[[-97.5, 35.4], [-97.3, 35.4], [-97.3, 35.6], [-97.5, 35.6]]] }],
    },
  ]);
  assert.equal(eonet.length, 2);
  assert.equal(eonet[0]!.hazard, 'wildfire');
  assert.equal(eonet[0]!.severity, 'severe');
  assert.equal(eonet[1]!.hazard, 'tornado');
  assert.equal(eonet[1]!.lat, 35.5);

  const gdacs = parseGdacsRss(`<rss><channel>
    <item>
      <title>Orange flood alert in Spain</title>
      <link>http://www.gdacs.org/report.aspx?eventtype=FL&amp;eventid=1</link>
      <guid>FL1</guid>
      <pubDate>Fri, 27 Nov 2026 15:00:00 GMT</pubDate>
      <geo:lat>39.47</geo:lat><geo:long>-0.38</geo:long>
      <gdacs:eventtype>FL</gdacs:eventtype>
      <gdacs:alertlevel>Orange</gdacs:alertlevel>
      <gdacs:country>Spain</gdacs:country>
    </item>
  </channel></rss>`);
  assert.equal(gdacs.length, 1);
  assert.equal(gdacs[0]!.hazard, 'flood');
  assert.equal(gdacs[0]!.severity, 'warning');
  assert.equal(gdacs[0]!.url, 'https://www.gdacs.org/report.aspx?eventtype=FL&eventid=1');
});
