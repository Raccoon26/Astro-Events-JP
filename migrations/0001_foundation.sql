PRAGMA foreign_keys = ON;
CREATE TABLE sources (
  source_id TEXT PRIMARY KEY, name TEXT NOT NULL, official_url TEXT NOT NULL UNIQUE,
  allowed_hosts_json TEXT NOT NULL CHECK(json_valid(allowed_hosts_json)),
  category TEXT NOT NULL CHECK(category IN ('astronomy','space-development','research','local','facility','vtuber')),
  prefecture INTEGER CHECK(prefecture BETWEEN 1 AND 47), municipality TEXT,
  format TEXT NOT NULL CHECK(format IN ('rss','atom','html','sitemap')),
  priority INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'review' CHECK(state IN ('active','review','unsupported','paused')),
  state_reason TEXT, last_crawled_at TEXT, next_crawl_at TEXT NOT NULL,
  etag TEXT, last_modified TEXT, content_digest TEXT, failure_count INTEGER NOT NULL DEFAULT 0,
  robots_checked_at TEXT, terms_reviewed_at TEXT, min_interval_seconds INTEGER NOT NULL DEFAULT 86400 CHECK(min_interval_seconds >= 3600)
);
CREATE INDEX sources_due ON sources(state,next_crawl_at,prefecture);
CREATE TABLE facilities (
  facility_id TEXT PRIMARY KEY, facility_name TEXT NOT NULL, prefecture INTEGER NOT NULL CHECK(prefecture BETWEEN 1 AND 47),
  municipality TEXT, official_url TEXT NOT NULL UNIQUE,
  operating_status TEXT NOT NULL DEFAULT 'unknown' CHECK(operating_status IN ('open','closed','renovation','unknown')),
  closure_start TEXT, closure_end TEXT, reopening_date TEXT, status_source_url TEXT, last_verified_at TEXT,
  CHECK(closure_end IS NULL OR closure_start IS NULL OR closure_end >= closure_start)
);
CREATE TABLE vtubers (
  vtuber_id TEXT PRIMARY KEY, name TEXT NOT NULL, official_url TEXT UNIQUE,
  official_accounts_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(official_accounts_json)),
  verification_status TEXT NOT NULL DEFAULT 'Review Required' CHECK(verification_status IN ('Verified','Review Required','Blocked')),
  last_verified_at TEXT, enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1))
);
CREATE TABLE vtuber_sources (
  vtuber_id TEXT NOT NULL REFERENCES vtubers(vtuber_id), source_id TEXT NOT NULL REFERENCES sources(source_id),
  PRIMARY KEY(vtuber_id,source_id)
);
CREATE TABLE events (
  stable_event_id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(source_id),
  facility_id TEXT REFERENCES facilities(facility_id), title TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('astronomy','space-development','research','local','facility','vtuber')),
  organizer TEXT, prefecture INTEGER CHECK(prefecture BETWEEN 1 AND 47), municipality TEXT, venue TEXT,
  start_datetime TEXT, end_datetime TEXT, timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo' CHECK(timezone='Asia/Tokyo'),
  date_precision TEXT NOT NULL DEFAULT 'unknown' CHECK(date_precision IN ('datetime','date','month','unknown')),
  application_start TEXT, application_deadline TEXT,
  reservation_required INTEGER CHECK(reservation_required IN (0,1)), participation_fee TEXT,
  official_url TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'unknown' CHECK(status IN ('scheduled','postponed','cancelled','ended','unknown')),
  verification_status TEXT NOT NULL DEFAULT 'Review Required' CHECK(verification_status IN ('Verified','Review Required','Blocked')),
  verification_evidence_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(verification_evidence_json)),
  first_seen_at TEXT NOT NULL, last_verified_at TEXT, edition_year INTEGER, edition TEXT,
  revision INTEGER NOT NULL DEFAULT 1, confirmed_ended_at TEXT,
  CHECK(end_datetime IS NULL OR start_datetime IS NULL OR end_datetime >= start_datetime),
  CHECK(application_deadline IS NULL OR application_start IS NULL OR application_deadline >= application_start)
);
CREATE INDEX events_retention ON events(confirmed_ended_at);
CREATE INDEX events_schedule ON events(prefecture,start_datetime,status);
CREATE TABLE event_vtubers (
  event_id TEXT NOT NULL REFERENCES events(stable_event_id) ON DELETE CASCADE,
  vtuber_id TEXT NOT NULL REFERENCES vtubers(vtuber_id), PRIMARY KEY(event_id,vtuber_id)
);
CREATE TABLE event_changes (
  change_id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(stable_event_id) ON DELETE CASCADE,
  revision INTEGER NOT NULL, detected_at TEXT NOT NULL, source_url TEXT NOT NULL,
  change_type TEXT NOT NULL, before_json TEXT CHECK(before_json IS NULL OR json_valid(before_json)),
  after_json TEXT NOT NULL CHECK(json_valid(after_json)), official_confirmation INTEGER NOT NULL DEFAULT 0 CHECK(official_confirmation IN (0,1)),
  UNIQUE(event_id,revision)
);
CREATE TABLE facility_notices (
  notice_id TEXT PRIMARY KEY, facility_id TEXT NOT NULL REFERENCES facilities(facility_id),
  event_id TEXT REFERENCES events(stable_event_id) ON DELETE SET NULL,
  kind TEXT NOT NULL, source_url TEXT NOT NULL, starts_at TEXT, ends_at TEXT, resolved_at TEXT,
  routine_closure INTEGER NOT NULL DEFAULT 0 CHECK(routine_closure IN (0,1)), last_verified_at TEXT
);
CREATE TABLE event_images (
  image_id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(stable_event_id) ON DELETE CASCADE,
  image_url TEXT NOT NULL, image_source_url TEXT NOT NULL,
  image_type TEXT NOT NULL CHECK(image_type IN ('poster','key-visual','representative','facility')),
  image_rights_status TEXT NOT NULL DEFAULT 'unknown' CHECK(image_rights_status IN ('permitted','unknown','prohibited')),
  image_attribution TEXT, rights_evidence_url TEXT, image_last_checked_at TEXT,
  available INTEGER NOT NULL DEFAULT 1 CHECK(available IN (0,1)), UNIQUE(event_id,image_url),
  CHECK(image_rights_status != 'permitted' OR rights_evidence_url IS NOT NULL)
);
CREATE TABLE generated_posts (
  post_id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(stable_event_id) ON DELETE CASCADE,
  revision INTEGER NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL, weighted_length INTEGER NOT NULL CHECK(weighted_length BETWEEN 1 AND 280),
  hashtags_json TEXT NOT NULL CHECK(json_valid(hashtags_json)), template_version TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE(event_id,revision,kind,template_version)
);
CREATE TABLE publication_records (
  publication_id TEXT PRIMARY KEY, event_id TEXT REFERENCES events(stable_event_id) ON DELETE SET NULL,
  post_id TEXT REFERENCES generated_posts(post_id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','posted','held','recheck')),
  action_id TEXT NOT NULL UNIQUE, recorded_at TEXT NOT NULL, x_url TEXT, expires_at TEXT NOT NULL
);
CREATE TABLE posted_fingerprints (
  fingerprint TEXT PRIMARY KEY, stable_event_id TEXT NOT NULL,
  edition_year INTEGER, edition TEXT, revision INTEGER NOT NULL,
  kind TEXT NOT NULL, posted_at TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE INDEX fingerprint_expiry ON posted_fingerprints(expires_at);
CREATE TABLE crawl_runs (
  run_id TEXT PRIMARY KEY, started_at TEXT NOT NULL, finished_at TEXT,
  state TEXT NOT NULL CHECK(state IN ('running','completed','deferred','failed')),
  cursor TEXT, sources_processed INTEGER NOT NULL DEFAULT 0, deferred INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0, requests INTEGER NOT NULL DEFAULT 0,
  rows_read INTEGER NOT NULL DEFAULT 0, rows_written INTEGER NOT NULL DEFAULT 0,
  safe_error_code TEXT
);
CREATE INDEX runs_retention ON crawl_runs(started_at);
CREATE TABLE notification_deliveries (
  delivery_id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL UNIQUE,
  event_id TEXT REFERENCES events(stable_event_id) ON DELETE SET NULL,
  post_id TEXT REFERENCES generated_posts(post_id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK(channel IN ('telegram','github-issue')),
  revision INTEGER NOT NULL, message_part TEXT NOT NULL CHECK(message_part IN ('management','post','image')),
  state TEXT NOT NULL CHECK(state IN ('pending','sending','sent','uncertain','failed')),
  external_id TEXT, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT,
  lease_until TEXT, sent_at TEXT, expires_at TEXT NOT NULL, safe_error_code TEXT
);
CREATE INDEX deliveries_due ON notification_deliveries(state,next_attempt_at);
CREATE TABLE discovery_candidates (
  candidate_id TEXT PRIMARY KEY, canonical_url TEXT NOT NULL UNIQUE,
  discovered_from TEXT NOT NULL, prefecture INTEGER CHECK(prefecture BETWEEN 1 AND 47), municipality TEXT,
  category TEXT, reason TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'review' CHECK(state IN ('review','approved','rejected','unsupported')),
  created_at TEXT NOT NULL, reviewed_at TEXT
);
CREATE TABLE scheduler_state (
  key TEXT PRIMARY KEY, cursor TEXT, lease_owner TEXT, lease_until TEXT, updated_at TEXT NOT NULL
);
CREATE TABLE daily_usage (
  utc_day TEXT PRIMARY KEY, requests INTEGER NOT NULL DEFAULT 0,
  rows_read INTEGER NOT NULL DEFAULT 0, rows_written INTEGER NOT NULL DEFAULT 0,
  database_bytes INTEGER NOT NULL DEFAULT 0, warning_sent_at TEXT
);
