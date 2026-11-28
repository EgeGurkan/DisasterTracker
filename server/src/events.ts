// Kaynak kayıtlarının alımı, tekilleştirme/birleştirme ve olay sürümleme.

import type { EventSummary, SourceRecord } from '../../shared/src/types.ts';
import { pickMergeTarget, summarize, MERGE_TOLERANCE } from '../../shared/src/merge.ts';
import { tx } from './db.ts';
import { iso, type Ctx } from './ctx.ts';
import { dispatchCatalog } from './dispatch.ts';

export interface EventRow {
  id: string; hazard: string; is_test: number; origin_time: string; origin_ms: number;
  lat: number; lon: number; depth_km: number | null; magnitude: number | null; mag_type: string | null;
  place: string; region: string | null; summary_source: string; status: string; version: number;
  first_ingested_at: string; updated_at: string;
}

export interface RecordRow {
  source: string; source_event_id: string; event_id: string; origin_time: string; origin_ms: number;
  lat: number; lon: number; depth_km: number | null; magnitude: number | null; mag_type: string | null;
  place: string; region: string | null; status: string; url: string | null; source_published_at: string | null;
  first_ingested_at: string; ingested_at: string; is_test: number; revision: number;
}

export function rowToSummary(r: EventRow): EventSummary {
  return {
    id: r.id, hazard: 'earthquake', isTest: !!r.is_test, originTime: r.origin_time, lat: r.lat, lon: r.lon,
    depthKm: r.depth_km, magnitude: r.magnitude, magType: r.mag_type, place: r.place, region: r.region,
    summarySource: r.summary_source as EventSummary['summarySource'], status: r.status as EventSummary['status'], version: r.version,
  };
}

export function rowToRecord(r: RecordRow): SourceRecord {
  return {
    source: r.source as SourceRecord['source'], sourceEventId: r.source_event_id, originTime: r.origin_time,
    sourcePublishedAt: r.source_published_at, lat: r.lat, lon: r.lon, depthKm: r.depth_km, magnitude: r.magnitude,
    magType: r.mag_type, place: r.place, region: r.region, status: r.status as SourceRecord['status'], url: r.url, isTest: !!r.is_test,
  };
}

function sameRecord(a: RecordRow, b: SourceRecord): boolean {
  return a.origin_time === b.originTime && a.lat === b.lat && a.lon === b.lon && a.depth_km === b.depthKm &&
    a.magnitude === b.magnitude && a.mag_type === b.magType && a.status === b.status && a.place === b.place;
}

const summaryKey = (s: Pick<EventSummary, 'originTime' | 'lat' | 'lon' | 'depthKm' | 'magnitude' | 'magType' | 'place' | 'summarySource' | 'status'>) =>
  JSON.stringify([s.originTime, s.lat, s.lon, s.depthKm, s.magnitude, s.magType, s.place, s.summarySource, s.status]);

export interface IngestOutcome {
  eventId: string;
  change: 'new' | 'merged' | 'revised' | 'unchanged';
  version: number;
}

/**
 * Kaynak kayıtlarını alır. notify=false geri doldurma içindir (bildirim üretmez).
 */
export function ingestRecords(ctx: Ctx, records: SourceRecord[], opts: { notify: boolean }): IngestOutcome[] {
  const out: IngestOutcome[] = [];
  const pendingNotify: { ev: EventSummary; ingestedAt: string; rec: SourceRecord }[] = [];
  const CHUNK = 250;
  for (let i = 0; i < records.length; i += CHUNK) {
    const slice = records.slice(i, i + CHUNK);
    tx(ctx.db, () => {
      for (const rec of slice) {
        const res = ingestOne(ctx, rec);
        out.push(res.outcome);
        if (opts.notify && res.changedEvent) {
          pendingNotify.push({ ev: res.changedEvent, ingestedAt: res.ingestedAt, rec });
        }
      }
    });
  }
  for (const item of pendingNotify) {
    dispatchCatalog(ctx, item.ev, {
      platformReceivedAt: item.ingestedAt,
      sourcePublishedAt: item.rec.sourcePublishedAt,
      source: item.rec.source,
    });
  }
  return out;
}

function ingestOne(ctx: Ctx, rec: SourceRecord): { outcome: IngestOutcome; changedEvent: EventSummary | null; ingestedAt: string } {
  const db = ctx.db;
  const ingestedAt = iso(ctx.now());
  const originMs = Date.parse(rec.originTime);
  return tx(db, () => {
    const existing = db.prepare('SELECT * FROM source_records WHERE source = ? AND source_event_id = ?')
      .get(rec.source, rec.sourceEventId) as RecordRow | undefined;
    let eventId: string;
    let change: IngestOutcome['change'];
    if (existing) {
      eventId = existing.event_id;
      if (sameRecord(existing, rec)) {
        const ev = db.prepare('SELECT version FROM events WHERE id = ?').get(eventId) as { version: number };
        return { outcome: { eventId, change: 'unchanged', version: ev.version }, changedEvent: null, ingestedAt };
      }
      db.prepare(`UPDATE source_records SET origin_time=?, origin_ms=?, lat=?, lon=?, depth_km=?, magnitude=?, mag_type=?,
        place=?, region=?, status=?, url=?, source_published_at=?, ingested_at=?, revision=revision+1
        WHERE source=? AND source_event_id=?`)
        .run(rec.originTime, originMs, rec.lat, rec.lon, rec.depthKm, rec.magnitude, rec.magType, rec.place, rec.region,
          rec.status, rec.url, rec.sourcePublishedAt, ingestedAt, rec.source, rec.sourceEventId);
      change = 'revised';
    } else {
      const win = MERGE_TOLERANCE.seconds * 1000;
      const cands = db.prepare('SELECT * FROM events WHERE origin_ms BETWEEN ? AND ? AND is_test = ?')
        .all(originMs - win, originMs + win, rec.isTest ? 1 : 0) as unknown as EventRow[];
      const sourcesStmt = db.prepare('SELECT source FROM source_records WHERE event_id = ?');
      const target = pickMergeTarget(
        rec,
        cands.map((c) => ({ id: c.id, originTime: c.origin_time, lat: c.lat, lon: c.lon, depthKm: c.depth_km, magnitude: c.magnitude, isTest: !!c.is_test })),
        (id) => (sourcesStmt.all(id) as { source: string }[]).map((x) => x.source as SourceRecord['source']),
      );
      if (target) {
        eventId = target.id;
        change = 'merged';
      } else {
        eventId = `${rec.source.toLowerCase()}-${rec.sourceEventId}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
        change = 'new';
      }
      db.prepare(`INSERT INTO source_records (source, source_event_id, event_id, origin_time, origin_ms, lat, lon, depth_km,
        magnitude, mag_type, place, region, status, url, source_published_at, first_ingested_at, ingested_at, is_test)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(rec.source, rec.sourceEventId, eventId, rec.originTime, originMs, rec.lat, rec.lon, rec.depthKm, rec.magnitude,
          rec.magType, rec.place, rec.region, rec.status, rec.url, rec.sourcePublishedAt, ingestedAt, ingestedAt, rec.isTest ? 1 : 0);
    }

    const recs = (db.prepare('SELECT * FROM source_records WHERE event_id = ?').all(eventId) as unknown as RecordRow[]).map(rowToRecord);
    const prev = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId) as EventRow | undefined;
    const next = summarize(eventId, prev ? prev.version : 1, recs);
    if (!prev) {
      db.prepare(`INSERT INTO events (id, hazard, is_test, origin_time, origin_ms, lat, lon, depth_km, magnitude, mag_type, place,
        region, summary_source, status, version, first_ingested_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(eventId, 'earthquake', next.isTest ? 1 : 0, next.originTime, Date.parse(next.originTime), next.lat, next.lon, next.depthKm,
          next.magnitude, next.magType, next.place, next.region, next.summarySource, next.status, 1, ingestedAt, ingestedAt);
      db.prepare('INSERT INTO event_revisions (event_id, version, source, change, at) VALUES (?,?,?,?,?)')
        .run(eventId, 1, rec.source, JSON.stringify({ type: 'created', magnitude: next.magnitude, magType: next.magType }), ingestedAt);
      return { outcome: { eventId, change, version: 1 }, changedEvent: { ...next, version: 1 }, ingestedAt };
    }
    const prevSummary = rowToSummary(prev);
    if (summaryKey(prevSummary) === summaryKey(next)) {
      // Özet değişmedi (ör. ikinci kaynak eklendi ama öncelikli değil): sürüm artmaz, yeni bildirim yok.
      db.prepare('INSERT INTO event_revisions (event_id, version, source, change, at) VALUES (?,?,?,?,?)')
        .run(eventId, prev.version, rec.source, JSON.stringify({ type: change === 'merged' ? 'source-added' : 'source-revised', magnitude: rec.magnitude, magType: rec.magType }), ingestedAt);
      return { outcome: { eventId, change, version: prev.version }, changedEvent: null, ingestedAt };
    }
    const version = prev.version + 1;
    db.prepare(`UPDATE events SET origin_time=?, origin_ms=?, lat=?, lon=?, depth_km=?, magnitude=?, mag_type=?, place=?, region=?,
      summary_source=?, status=?, version=?, updated_at=? WHERE id=?`)
      .run(next.originTime, Date.parse(next.originTime), next.lat, next.lon, next.depthKm, next.magnitude, next.magType, next.place,
        next.region, next.summarySource, next.status, version, ingestedAt, eventId);
    db.prepare('INSERT INTO event_revisions (event_id, version, source, change, at) VALUES (?,?,?,?,?)')
      .run(eventId, version, rec.source, JSON.stringify({
        type: next.status === 'deleted' ? 'deleted' : 'revised',
        from: { magnitude: prev.magnitude, magType: prev.mag_type, source: prev.summary_source },
        to: { magnitude: next.magnitude, magType: next.magType, source: next.summarySource },
      }), ingestedAt);
    return { outcome: { eventId, change, version }, changedEvent: { ...next, version }, ingestedAt };
  });
}
