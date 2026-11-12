CREATE TABLE source_approvals (
 source_id TEXT PRIMARY KEY REFERENCES sources(source_id), payload TEXT NOT NULL CHECK(json_valid(payload)), reviewed_at TEXT NOT NULL
);
CREATE TABLE source_policy_reviews (review_id TEXT PRIMARY KEY,source_id TEXT NOT NULL REFERENCES sources(source_id),decision TEXT NOT NULL CHECK(decision IN ('review','unsupported','active')),reviewed_at TEXT NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)));
CREATE TABLE collection_host_gates(host TEXT PRIMARY KEY,next_allowed_at TEXT NOT NULL);
CREATE TABLE collection_jobs (
 job_id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(source_id), url TEXT NOT NULL,
 format TEXT NOT NULL CHECK(format IN ('rss','atom','html','sitemap')), cycle TEXT NOT NULL, depth INTEGER NOT NULL DEFAULT 0 CHECK(depth BETWEEN 0 AND 4),
 state TEXT NOT NULL CHECK(state IN ('pending','fetching','parsed','unchanged','completed','deferred','failed')),
 retry_at TEXT NOT NULL, owner TEXT, lease_until TEXT, attempts INTEGER NOT NULL DEFAULT 0,
 payload TEXT CHECK(payload IS NULL OR json_valid(payload)), safe_error_code TEXT, updated_at TEXT NOT NULL, offset INTEGER NOT NULL DEFAULT 0, document_digest TEXT,
 UNIQUE(source_id,url,cycle)
);
CREATE INDEX collection_jobs_due ON collection_jobs(state,retry_at,lease_until);
CREATE TABLE collection_documents (
 source_id TEXT NOT NULL REFERENCES sources(source_id), url TEXT NOT NULL, etag TEXT, last_modified TEXT, digest TEXT,
 attempted_at TEXT, succeeded_at TEXT, changed_at TEXT, failures INTEGER NOT NULL DEFAULT 0, complete INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(source_id,url)
);
CREATE TABLE event_candidates (
 candidate_id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(source_id), official_url TEXT NOT NULL,
 fingerprint TEXT NOT NULL, payload TEXT NOT NULL CHECK(json_valid(payload)),
 review_status TEXT NOT NULL DEFAULT 'Review Required' CHECK(review_status IN ('Review Required','Verified','Blocked')),
 first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL
);
CREATE INDEX event_candidates_source ON event_candidates(source_id,last_seen_at);
CREATE TABLE candidate_versions (candidate_id TEXT NOT NULL REFERENCES event_candidates(candidate_id) ON DELETE CASCADE,fingerprint TEXT NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),observed_at TEXT NOT NULL,PRIMARY KEY(candidate_id,fingerprint));
CREATE TABLE candidate_images (
 candidate_id TEXT NOT NULL REFERENCES event_candidates(candidate_id) ON DELETE CASCADE, image_url TEXT NOT NULL,
 image_source_url TEXT NOT NULL, image_type TEXT NOT NULL, rights_status TEXT NOT NULL DEFAULT 'unknown' CHECK(rights_status IN ('unknown','permitted','prohibited')),
 rights_evidence_url TEXT, attribution TEXT, last_checked_at TEXT NOT NULL, available INTEGER CHECK(available IN (0,1)),
 CHECK(rights_status!='permitted' OR rights_evidence_url IS NOT NULL), PRIMARY KEY(candidate_id,image_url)
);
CREATE TABLE collection_cursors (cursor_id TEXT PRIMARY KEY,prefecture INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL);
CREATE TABLE collection_run_metrics (run_id TEXT PRIMARY KEY REFERENCES crawl_runs(run_id) ON DELETE CASCADE,payload TEXT NOT NULL CHECK(json_valid(payload)));
