-- Additive local/isolated DEV06 schema. Never applied automatically to remote D1.
ALTER TABLE notification_deliveries ADD COLUMN lease_owner TEXT;
ALTER TABLE notification_deliveries ADD COLUMN started_at TEXT;
ALTER TABLE notification_deliveries ADD COLUMN result_owner TEXT;
ALTER TABLE notification_deliveries ADD COLUMN retryable INTEGER NOT NULL DEFAULT 0 CHECK(retryable IN (0,1));
CREATE TABLE notification_groups (
 group_id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(stable_event_id) ON DELETE RESTRICT,
 post_id TEXT NOT NULL REFERENCES generated_posts(post_id) ON DELETE RESTRICT, revision INTEGER NOT NULL,
 decision_id TEXT NOT NULL, fingerprint TEXT NOT NULL, payload_digest TEXT NOT NULL,
 origin TEXT NOT NULL CHECK(origin='verified-post'), report_version TEXT NOT NULL,
 mode TEXT NOT NULL CHECK(mode IN ('simulation','live')), created_at TEXT NOT NULL, valid_until TEXT NOT NULL,
 controls_json TEXT NOT NULL CHECK(json_valid(controls_json) AND length(controls_json)<=2048),
 priority INTEGER NOT NULL, UNIQUE(post_id,report_version,mode)
);
CREATE TABLE notification_context (
 delivery_id TEXT PRIMARY KEY REFERENCES notification_deliveries(delivery_id) ON DELETE RESTRICT,
 group_id TEXT NOT NULL REFERENCES notification_groups(group_id) ON DELETE RESTRICT,
 part_index INTEGER NOT NULL DEFAULT 0, payload TEXT NOT NULL CHECK(json_valid(payload) AND length(payload)<=60000),
 payload_digest TEXT NOT NULL, target TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(group_id,target,part_index)
);
CREATE INDEX notification_groups_event ON notification_groups(event_id,revision);
CREATE INDEX notification_context_group ON notification_context(group_id,delivery_id);
CREATE TABLE notification_attempts (
 attempt_id TEXT PRIMARY KEY, delivery_id TEXT NOT NULL REFERENCES notification_deliveries(delivery_id) ON DELETE RESTRICT,
 owner TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT, outcome TEXT,
 safe_code TEXT, external_id TEXT, UNIQUE(delivery_id,owner)
);
CREATE TABLE notification_publications (
 event_id TEXT NOT NULL REFERENCES events(stable_event_id) ON DELETE RESTRICT, revision INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','posted','held','recheck')),
 generation INTEGER NOT NULL DEFAULT 0, action_id TEXT, updated_at TEXT NOT NULL,
 mode TEXT NOT NULL DEFAULT 'simulation' CHECK(mode IN ('simulation','live')),
 PRIMARY KEY(event_id,revision,mode)
);
CREATE TABLE notification_callbacks (
 token_hash TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES notification_groups(group_id) ON DELETE RESTRICT,
 action TEXT NOT NULL CHECK(action IN ('posted','held','recheck')), expected_generation INTEGER NOT NULL,
 expires_at TEXT NOT NULL, consumed_at TEXT, result TEXT,
 delivery_id TEXT REFERENCES notification_deliveries(delivery_id) ON DELETE RESTRICT,
 UNIQUE(group_id,action,expected_generation)
);
CREATE TABLE notification_reviews (
 review_id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(stable_event_id) ON DELETE RESTRICT,
 revision INTEGER NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL, resolved_at TEXT
);
CREATE TABLE notification_manual_receipts (
 delivery_id TEXT PRIMARY KEY REFERENCES notification_deliveries(delivery_id) ON DELETE RESTRICT,
 external_id TEXT NOT NULL, reason TEXT NOT NULL CHECK(length(reason) BETWEEN 8 AND 500), recorded_at TEXT NOT NULL,
 mode TEXT NOT NULL CHECK(mode='simulation')
);
CREATE TABLE notification_action_provenance (
 action_id TEXT PRIMARY KEY REFERENCES publication_records(action_id) ON DELETE RESTRICT,
 group_id TEXT NOT NULL REFERENCES notification_groups(group_id) ON DELETE RESTRICT,
 scope TEXT NOT NULL CHECK(scope='simulation'), actor_hash TEXT NOT NULL, update_id TEXT NOT NULL
);
CREATE TABLE notification_request_budgets (
 budget_key TEXT PRIMARY KEY, requests INTEGER NOT NULL DEFAULT 0, next_allowed_at TEXT NOT NULL
);
CREATE TABLE notification_request_reservations (
 reservation_id TEXT PRIMARY KEY, utc_day TEXT NOT NULL, requests INTEGER NOT NULL, created_at TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','consumed'))
);
CREATE TABLE notification_callback_acks (
 ack_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL REFERENCES notification_callbacks(token_hash) ON DELETE RESTRICT,
 callback_id TEXT NOT NULL UNIQUE, state TEXT NOT NULL CHECK(state IN ('pending','sending','sent','uncertain','failed')),
 owner TEXT, lease_until TEXT, created_at TEXT NOT NULL, safe_code TEXT, next_attempt_at TEXT, attempts INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE notification_issue_links (
 event_id TEXT PRIMARY KEY REFERENCES events(stable_event_id) ON DELETE RESTRICT,
 repository TEXT NOT NULL CHECK(repository='Raccoon26/Astro-Events-JP-Reports'),
 issue_number INTEGER NOT NULL CHECK(issue_number>0), marker TEXT NOT NULL UNIQUE,
 mode TEXT NOT NULL CHECK(mode IN ('simulation','live')), updated_at TEXT NOT NULL
);
CREATE TABLE notification_issue_claims (
 event_id TEXT PRIMARY KEY REFERENCES events(stable_event_id) ON DELETE RESTRICT,
 state TEXT NOT NULL CHECK(state IN ('idle','sending','uncertain')), owner TEXT,
 lease_until TEXT, updated_at TEXT NOT NULL, cause_id TEXT
);
CREATE TABLE notification_updates (
 update_id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES notification_groups(group_id) ON DELETE RESTRICT,
 delivery_id TEXT NOT NULL REFERENCES notification_deliveries(delivery_id) ON DELETE RESTRICT,
 publication_generation INTEGER NOT NULL, state TEXT NOT NULL CHECK(state IN ('pending','sending','sent','uncertain','failed')),
 created_at TEXT NOT NULL, safe_code TEXT, owner TEXT, lease_until TEXT, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT,
 UNIQUE(delivery_id,publication_generation)
);
CREATE TABLE notification_status_receipts (
 update_id TEXT PRIMARY KEY REFERENCES notification_updates(update_id) ON DELETE RESTRICT,
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 8 AND 500), recorded_at TEXT NOT NULL
);
CREATE VIEW notification_schema AS SELECT 1 AS version;
