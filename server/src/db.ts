import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Pilot için kalıcı depolama: SQLite (WAL). Üretimde PostgreSQL/PostGIS'e taşınır;
// tablo yapısı ve sorgular aynı kalacak şekilde basit tutuldu (bkz. docs/MIMARI.md).

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  hazard TEXT NOT NULL DEFAULT 'earthquake',
  is_test INTEGER NOT NULL,
  origin_time TEXT NOT NULL,
  origin_ms INTEGER NOT NULL,
  lat REAL NOT NULL, lon REAL NOT NULL, depth_km REAL,
  magnitude REAL, mag_type TEXT,
  place TEXT NOT NULL, region TEXT,
  summary_source TEXT NOT NULL,
  status TEXT NOT NULL,
  version INTEGER NOT NULL,
  first_ingested_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_origin ON events(origin_ms);

CREATE TABLE IF NOT EXISTS source_records (
  source TEXT NOT NULL,
  source_event_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  origin_time TEXT NOT NULL, origin_ms INTEGER NOT NULL,
  lat REAL NOT NULL, lon REAL NOT NULL, depth_km REAL,
  magnitude REAL, mag_type TEXT,
  place TEXT NOT NULL, region TEXT,
  status TEXT NOT NULL, url TEXT,
  source_published_at TEXT,
  first_ingested_at TEXT NOT NULL,
  ingested_at TEXT NOT NULL,
  is_test INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (source, source_event_id)
);
CREATE INDEX IF NOT EXISTS sr_event ON source_records(event_id);
CREATE INDEX IF NOT EXISTS sr_origin ON source_records(origin_ms);

CREATE TABLE IF NOT EXISTS event_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  source TEXT NOT NULL,
  change TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS rev_event ON event_revisions(event_id);

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL,
  label TEXT NOT NULL,
  platform TEXT NOT NULL,
  env TEXT NOT NULL,
  transport TEXT NOT NULL,
  push_json TEXT,
  push_valid INTEGER NOT NULL DEFAULT 0,
  push_invalid_reason TEXT,
  prefs_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seen_at TEXT,
  last_test_ok_at TEXT
);

CREATE TABLE IF NOT EXISTS device_event_state (
  device_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  notified_version INTEGER,
  notified_at TEXT,
  retracted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (device_id, event_id)
);

CREATE TABLE IF NOT EXISTS alerts (
  provider TEXT NOT NULL,
  alert_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  msg_type TEXT NOT NULL,
  status TEXT NOT NULL,
  state TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  message_json TEXT NOT NULL,
  received_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (provider, alert_id)
);
CREATE TABLE IF NOT EXISTS alert_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL, alert_id TEXT NOT NULL, version INTEGER NOT NULL,
  msg_type TEXT NOT NULL, decision TEXT NOT NULL, at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  dedup_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  priority INTEGER NOT NULL,
  env TEXT NOT NULL,
  platform TEXT NOT NULL,
  transport TEXT NOT NULL,
  event_id TEXT, event_version INTEGER,
  alert_key TEXT,
  reasons_json TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  is_test INTEGER NOT NULL,
  source TEXT,
  source_published_at TEXT,
  platform_received_at TEXT NOT NULL,
  queued_at TEXT NOT NULL,
  first_send_at TEXT,
  provider_accepted_at TEXT,
  provider_status INTEGER,
  provider_detail TEXT,
  device_received_at TEXT,
  device_received_server_at TEXT,
  displayed_at TEXT,
  displayed_server_at TEXT,
  opened_at TEXT,
  opened_server_at TEXT,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_ms INTEGER NOT NULL,
  deadline_ms INTEGER NOT NULL,
  locked_until_ms INTEGER,
  expires_at_ms INTEGER,
  payload_json TEXT NOT NULL,
  error TEXT
);
CREATE INDEX IF NOT EXISTS del_queue ON deliveries(status, priority, next_attempt_ms);
CREATE INDEX IF NOT EXISTS del_device ON deliveries(device_id, queued_at);

CREATE TABLE IF NOT EXISTS source_health (
  source TEXT PRIMARY KEY,
  last_poll_at TEXT, last_success_at TEXT, last_error TEXT, last_error_at TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_event_time TEXT, last_count INTEGER, status TEXT NOT NULL DEFAULT 'unknown',
  outage_started_at TEXT
);
CREATE TABLE IF NOT EXISTS source_gaps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL, start_at TEXT NOT NULL, end_at TEXT
);

CREATE TABLE IF NOT EXISTS felt_reports (
  event_id TEXT NOT NULL, device_id TEXT NOT NULL, intensity INTEGER NOT NULL, at TEXT NOT NULL,
  PRIMARY KEY (event_id, device_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY, room TEXT NOT NULL, device_id TEXT NOT NULL, nick TEXT NOT NULL,
  text TEXT NOT NULL, at TEXT NOT NULL, hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS chat_room ON chat_messages(room, at);
CREATE TABLE IF NOT EXISTS chat_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT, message_id TEXT NOT NULL, device_id TEXT NOT NULL,
  reason TEXT NOT NULL, at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor TEXT NOT NULL,
  action TEXT NOT NULL, detail TEXT
);
CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
`;

export type DB = DatabaseSync;

export function openDb(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}

const txDepth = new WeakMap<DB, number>();

export function tx<T>(db: DB, fn: () => T): T {
  const d = txDepth.get(db) ?? 0;
  if (d > 0) return fn();
  txDepth.set(db, 1);
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    txDepth.set(db, 0);
  }
}

export function audit(db: DB, actor: string, action: string, detail: unknown): void {
  db.prepare('INSERT INTO audit_log (at, actor, action, detail) VALUES (?, ?, ?, ?)')
    .run(new Date().toISOString(), actor, action, JSON.stringify(detail));
}
