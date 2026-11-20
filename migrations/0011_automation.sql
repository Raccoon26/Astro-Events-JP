CREATE TABLE ops_jobs (
 id TEXT PRIMARY KEY, slot TEXT NOT NULL, phase TEXT NOT NULL, ordinal INTEGER NOT NULL DEFAULT 0,
 protection INTEGER NOT NULL DEFAULT 0 CHECK(protection IN(0,1)),
 state TEXT NOT NULL CHECK(state IN('pending','running','retry','done','failed')),
 generation INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0,
 owner TEXT, lease_until TEXT, due_at TEXT NOT NULL, finished_at TEXT,
 result_json TEXT CHECK(result_json IS NULL OR (json_valid(result_json) AND length(result_json)<=2048)),
 error TEXT, UNIQUE(slot,phase)
);
CREATE INDEX ops_job_due ON ops_jobs(protection,due_at,slot,ordinal) WHERE state IN('pending','retry');
CREATE INDEX ops_job_lease ON ops_jobs(state,lease_until);
CREATE INDEX ops_job_finished ON ops_jobs(finished_at,id) WHERE finished_at IS NOT NULL;
CREATE INDEX ops_job_daily ON ops_jobs(slot,phase,state);
CREATE TABLE ops_checkpoints (
 phase TEXT PRIMARY KEY, cursor TEXT NOT NULL CHECK(length(cursor)<=200),
 job_id TEXT NOT NULL, generation INTEGER NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE ops_budget_day (
 utc_day TEXT PRIMARY KEY, requests INTEGER NOT NULL, reads INTEGER NOT NULL, writes INTEGER NOT NULL,
 bytes INTEGER NOT NULL, telemetry INTEGER NOT NULL
);
CREATE TABLE ops_lease (singleton INTEGER PRIMARY KEY CHECK(singleton=1), epoch INTEGER NOT NULL);
INSERT INTO ops_lease VALUES(1,0);
CREATE TABLE ops_account_observations (
 captured_at TEXT PRIMARY KEY, utc_day TEXT NOT NULL,
 provenance TEXT NOT NULL CHECK(provenance IN('cloudflare','fixture')),
 use_json TEXT NOT NULL CHECK(json_valid(use_json) AND length(use_json)<=2048)
);
CREATE TABLE ops_warnings (
 utc_day TEXT NOT NULL, code TEXT NOT NULL, first_at TEXT NOT NULL,
 PRIMARY KEY(utc_day,code)
);
CREATE TABLE ops_daily_reports (
 slot TEXT PRIMARY KEY, created_at TEXT NOT NULL,
 payload TEXT NOT NULL CHECK(json_valid(payload) AND length(payload)<=32768)
);
CREATE TABLE ops_retention_receipts (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, at TEXT NOT NULL, plan_json TEXT NOT NULL
 CHECK(json_valid(plan_json) AND length(plan_json)<=16384), affected INTEGER NOT NULL
);
CREATE INDEX ops_retention_ledger ON ops_retention_receipts(at,id);
CREATE TABLE ops_event_tombstones (
 event_id TEXT PRIMARY KEY, candidate_id TEXT, fingerprint TEXT, retired_at TEXT NOT NULL
);
CREATE INDEX ops_retired_candidate ON ops_event_tombstones(candidate_id,fingerprint);
CREATE TABLE ops_region_results (
 job_id TEXT PRIMARY KEY REFERENCES collection_jobs(job_id) ON DELETE CASCADE,
 prefecture INTEGER NOT NULL CHECK(prefecture BETWEEN 1 AND 47), state TEXT NOT NULL,
 attempted_at TEXT NOT NULL, successes INTEGER NOT NULL, failures INTEGER NOT NULL
);
CREATE INDEX ops_region_results_area ON ops_region_results(prefecture,attempted_at);
CREATE TABLE ops_post_intents (
 event_id TEXT NOT NULL REFERENCES events(stable_event_id) ON DELETE CASCADE, revision INTEGER NOT NULL,
 kind TEXT NOT NULL, source_id TEXT NOT NULL, fingerprint TEXT NOT NULL, decision_id TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN('pending','prepared','done','suppressed')), priority INTEGER NOT NULL,
 post_id TEXT, part_cursor INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(event_id,revision,kind,decision_id)
);
CREATE INDEX ops_post_intents_due ON ops_post_intents(state,priority DESC,event_id,revision,kind);
CREATE INDEX ops_notice_review_event ON notification_reviews(event_id,resolved_at);
CREATE INDEX ops_publication_event ON publication_records(event_id,post_id,status);
CREATE INDEX ops_weekend_event ON weekend_members(event_id);
CREATE INDEX ops_identity_review_event ON event_identity_reviews(related_event_id);
CREATE INDEX ops_event_observation ON event_identity_observations(event_id);
CREATE INDEX ops_closed_events ON events(confirmed_ended_at,stable_event_id) WHERE status='ended' AND confirmed_ended_at IS NOT NULL;
CREATE INDEX ops_linked_notices ON facility_notices(event_id,resolved_at);
CREATE INDEX ops_pending_notifications ON notification_deliveries(event_id,state);
CREATE INDEX ops_run_finished ON crawl_runs(finished_at,run_id) WHERE finished_at IS NOT NULL;
CREATE INDEX ops_fingerprint_event ON posted_fingerprints(stable_event_id,expires_at);
CREATE INDEX ops_delivery_lease ON notification_deliveries(state,lease_until);
CREATE INDEX ops_weekend_lease ON weekend_outbox(state,lease_until);
CREATE INDEX ops_ack_lease ON notification_callback_acks(state,lease_until);
CREATE INDEX ops_update_lease ON notification_updates(state,lease_until);
CREATE INDEX ops_event_first_seen ON events(first_seen_at);
CREATE INDEX ops_candidate_first_seen ON event_candidates(first_seen_at);
CREATE INDEX ops_revision_checked ON event_tracking_revisions(checked_at);
CREATE VIEW automation_schema AS SELECT 1 AS version;
