-- Additive DEV04 compatibility: the existing Health/Cron schema2 identity is unchanged.
ALTER TABLE event_candidates ADD COLUMN verification_generation INTEGER NOT NULL DEFAULT 0;
ALTER TABLE facilities ADD COLUMN verification_epoch INTEGER NOT NULL DEFAULT 0;
CREATE TABLE verification_decisions (
 decision_id TEXT PRIMARY KEY,
 candidate_id TEXT NOT NULL REFERENCES event_candidates(candidate_id) ON DELETE CASCADE,
 fingerprint TEXT NOT NULL, generation INTEGER NOT NULL CHECK(generation>0),
 signature TEXT NOT NULL, commit_nonce TEXT NOT NULL, rule_version TEXT NOT NULL, checked_at TEXT NOT NULL, expires_at TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('Verified','Review Required','Blocked')),
 packet_digest TEXT NOT NULL, source_digest TEXT NOT NULL, approval_digest TEXT NOT NULL,
 snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
 result_json TEXT NOT NULL CHECK(json_valid(result_json)),
 UNIQUE(candidate_id,generation)
);
ALTER TABLE events ADD COLUMN candidate_id TEXT REFERENCES event_candidates(candidate_id);
ALTER TABLE events ADD COLUMN verification_id TEXT REFERENCES verification_decisions(decision_id);
ALTER TABLE events ADD COLUMN start_date TEXT;
ALTER TABLE events ADD COLUMN end_date TEXT;
ALTER TABLE events ADD COLUMN start_month TEXT;
ALTER TABLE events ADD COLUMN end_month TEXT;
CREATE UNIQUE INDEX events_candidate ON events(candidate_id) WHERE candidate_id IS NOT NULL;
CREATE INDEX events_verified_page ON events(verification_status,stable_event_id);
CREATE INDEX event_candidates_review_page ON event_candidates(review_status,candidate_id);
ALTER TABLE event_images ADD COLUMN availability_status TEXT NOT NULL DEFAULT 'unknown' CHECK(availability_status IN ('unknown','available','missing'));
ALTER TABLE event_images ADD COLUMN related INTEGER NOT NULL DEFAULT 0 CHECK(related IN (0,1));
ALTER TABLE facility_notices ADD COLUMN source_id TEXT REFERENCES sources(source_id);
ALTER TABLE facility_notices ADD COLUMN candidate_id TEXT REFERENCES event_candidates(candidate_id);
ALTER TABLE facility_notices ADD COLUMN fingerprint TEXT;
ALTER TABLE facility_notices ADD COLUMN verification_payload TEXT CHECK(verification_payload IS NULL OR json_valid(verification_payload));
ALTER TABLE facility_notices ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE facility_notices ADD COLUMN review_digest TEXT;
ALTER TABLE facility_notices ADD COLUMN review_nonce TEXT;
CREATE INDEX facility_notices_unresolved ON facility_notices(facility_id,resolved_at,notice_id);
CREATE INDEX events_facility_page ON events(facility_id,stable_event_id);
CREATE TABLE facility_notice_history (
 notice_id TEXT NOT NULL REFERENCES facility_notices(notice_id), revision INTEGER NOT NULL,
 recorded_at TEXT NOT NULL, before_json TEXT, after_json TEXT NOT NULL CHECK(json_valid(after_json)),
 review_digest TEXT NOT NULL, PRIMARY KEY(notice_id,revision), UNIQUE(notice_id,review_digest)
);
-- Created last: an incomplete/old migration cannot pass the verifier compatibility gate.
CREATE VIEW verification_schema AS SELECT 1 AS version;
