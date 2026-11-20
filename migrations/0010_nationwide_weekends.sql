-- DEV08 local planning and isolated weekend delivery.
CREATE INDEX survey_due_region ON sources(prefecture,next_crawl_at,source_id) WHERE state='active' AND category<>'vtuber';
CREATE INDEX survey_due_category ON sources(category,next_crawl_at,source_id) WHERE state='active';
CREATE INDEX survey_due_general ON sources(next_crawl_at,source_id) WHERE state='active' AND category<>'vtuber';
CREATE INDEX survey_source_pending ON collection_jobs(source_id) WHERE state NOT IN ('completed','unchanged');
CREATE INDEX survey_events_recent ON events(source_id,first_seen_at,stable_event_id);
CREATE INDEX survey_candidate_state ON event_candidates(source_id,review_status,last_seen_at);
CREATE INDEX survey_discovery_region ON discovery_candidates(prefecture,candidate_id);
CREATE INDEX survey_source_reviews ON source_policy_reviews(source_id,reviewed_at);
CREATE INDEX weekend_event_day ON events(start_date,stable_event_id) WHERE verification_status='Verified' AND status='scheduled';
CREATE INDEX weekend_event_period ON events(end_date,start_date,stable_event_id) WHERE verification_status='Verified' AND status='scheduled' AND end_date IS NOT NULL;
CREATE TABLE survey_checkpoint (
 lane TEXT PRIMARY KEY CHECK(lane IN ('regional','category','vtuber')),
 cursor INTEGER NOT NULL DEFAULT 0, generation INTEGER NOT NULL DEFAULT 0,
 nonce TEXT, last_at TEXT
);
INSERT INTO survey_checkpoint(lane) VALUES('regional'),('category'),('vtuber');
CREATE TABLE survey_opportunities (
 lane TEXT NOT NULL, slot INTEGER NOT NULL CHECK(slot BETWEEN 0 AND 47),
 selected INTEGER NOT NULL DEFAULT 0, last_at TEXT NOT NULL, municipality TEXT,
 cursor_source TEXT NOT NULL DEFAULT '', cursor_due TEXT NOT NULL DEFAULT '', recent_finds INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(lane,slot)
);
CREATE TABLE survey_plans (
 run_id TEXT PRIMARY KEY, lane TEXT NOT NULL, slot INTEGER NOT NULL,
 source_id TEXT REFERENCES sources(source_id) ON DELETE SET NULL,
 job_id TEXT REFERENCES collection_jobs(job_id) ON DELETE SET NULL,
 made_at TEXT NOT NULL, reason TEXT NOT NULL, matches INTEGER NOT NULL
);
CREATE TABLE weekend_editions (
 edition_id TEXT PRIMARY KEY, saturday TEXT NOT NULL, scope TEXT NOT NULL,
 digest TEXT NOT NULL UNIQUE, owner TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE weekend_active (
 saturday TEXT NOT NULL, scope TEXT NOT NULL,
 edition_id TEXT NOT NULL UNIQUE REFERENCES weekend_editions(edition_id) ON DELETE RESTRICT,
 PRIMARY KEY(saturday,scope)
);
CREATE TABLE weekend_members (
 edition_id TEXT NOT NULL REFERENCES weekend_editions(edition_id) ON DELETE CASCADE,
 event_id TEXT NOT NULL REFERENCES events(stable_event_id) ON DELETE RESTRICT,
 revision INTEGER NOT NULL, decision_id TEXT NOT NULL REFERENCES verification_decisions(decision_id) ON DELETE RESTRICT,
 fingerprint TEXT NOT NULL, valid_until TEXT NOT NULL, item TEXT NOT NULL CHECK(json_valid(item) AND length(item)<=4096),
 part INTEGER NOT NULL CHECK(part BETWEEN 0 AND 2), position INTEGER NOT NULL CHECK(position BETWEEN 0 AND 1),
 PRIMARY KEY(edition_id,event_id)
);
CREATE TABLE weekend_outbox (
 part_id TEXT PRIMARY KEY, edition_id TEXT NOT NULL REFERENCES weekend_editions(edition_id) ON DELETE CASCADE,
 ordinal INTEGER NOT NULL, body TEXT NOT NULL CHECK(length(body)<=4096), body_hash TEXT NOT NULL,
 target TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','sending','sent','uncertain','stale','failed')),
 owner TEXT, lease_until TEXT, external_id TEXT, provider_started INTEGER NOT NULL DEFAULT 0,
 attempts INTEGER NOT NULL DEFAULT 0, next_attempt TEXT, error TEXT,
 UNIQUE(edition_id,ordinal)
);
CREATE INDEX weekend_part_state ON weekend_outbox(edition_id,state,ordinal);
CREATE VIEW nationwide_schema AS SELECT 1 AS version;
