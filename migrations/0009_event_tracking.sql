-- Additive local/isolated schema. Remote deployment identity and migration policy are unchanged.
CREATE TABLE event_tracking_epoch (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1), version INTEGER NOT NULL
);
INSERT INTO event_tracking_epoch VALUES (1,0);
CREATE TABLE event_identity_observations (
 candidate_id TEXT PRIMARY KEY REFERENCES event_candidates(candidate_id) ON DELETE CASCADE,
 event_id TEXT NOT NULL REFERENCES events(stable_event_id) ON DELETE CASCADE,
 decision_id TEXT NOT NULL REFERENCES verification_decisions(decision_id) ON DELETE CASCADE,
 identity_json TEXT NOT NULL CHECK(json_valid(identity_json) AND length(identity_json)<=8192),
 url_key TEXT NOT NULL, provider_key TEXT, organizer_key TEXT NOT NULL, year INTEGER, start_date TEXT,
 relation TEXT NOT NULL CHECK(relation IN ('primary','alias')),
 official_url TEXT NOT NULL
);
CREATE INDEX event_identity_url ON event_identity_observations(url_key,candidate_id) WHERE relation='primary';
CREATE INDEX event_identity_provider ON event_identity_observations(provider_key,candidate_id) WHERE relation='primary';
CREATE INDEX event_identity_organizer ON event_identity_observations(organizer_key,year,start_date,candidate_id) WHERE relation='primary';
CREATE INDEX events_tracking_original_url ON events(official_url,stable_event_id);
CREATE TABLE event_identity_reviews (
 candidate_id TEXT NOT NULL REFERENCES event_candidates(candidate_id) ON DELETE CASCADE,
 related_event_id TEXT NOT NULL REFERENCES events(stable_event_id) ON DELETE CASCADE,
 decision_id TEXT NOT NULL REFERENCES verification_decisions(decision_id) ON DELETE CASCADE,
 related_decision_id TEXT NOT NULL REFERENCES verification_decisions(decision_id) ON DELETE CASCADE,
 state TEXT NOT NULL CHECK(state IN ('pending','held','approved','rejected')),
 details TEXT NOT NULL CHECK(json_valid(details) AND length(details)<=8192),
 created_at TEXT NOT NULL,
 PRIMARY KEY(candidate_id,related_event_id,decision_id)
);
CREATE TABLE event_identity_actions (
 action_id TEXT PRIMARY KEY,
 candidate_id TEXT NOT NULL,
 related_event_id TEXT NOT NULL,
 decision_id TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('held','approved','rejected')),
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 8 AND 500),
 decided_at TEXT NOT NULL, commit_nonce TEXT NOT NULL,
 FOREIGN KEY(candidate_id,related_event_id,decision_id)
  REFERENCES event_identity_reviews(candidate_id,related_event_id,decision_id) ON DELETE CASCADE
);
CREATE TABLE event_identity_holds (
 candidate_id TEXT PRIMARY KEY REFERENCES event_candidates(candidate_id) ON DELETE CASCADE,
 decision_id TEXT NOT NULL REFERENCES verification_decisions(decision_id) ON DELETE CASCADE,
 reason TEXT NOT NULL
);
CREATE TABLE event_tracking_revisions (
 event_id TEXT NOT NULL REFERENCES events(stable_event_id) ON DELETE CASCADE,
 revision INTEGER NOT NULL,
 decision_id TEXT NOT NULL UNIQUE REFERENCES verification_decisions(decision_id) ON DELETE CASCADE,
 checked_at TEXT NOT NULL,
 changes TEXT NOT NULL CHECK(json_valid(changes) AND length(changes)<=65536),
 purpose TEXT NOT NULL CHECK(purpose IN ('initial','official-change','recheck')),
 PRIMARY KEY(event_id,revision)
);
CREATE TABLE event_delivery_intents (
 event_id TEXT NOT NULL REFERENCES events(stable_event_id) ON DELETE CASCADE,
 revision INTEGER NOT NULL, kind TEXT NOT NULL, mode TEXT NOT NULL CHECK(mode='simulation'),
 group_id TEXT NOT NULL UNIQUE REFERENCES notification_groups(group_id) ON DELETE CASCADE,
 content_digest TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','posted','held','recheck')),
 generation INTEGER NOT NULL DEFAULT 0, action_id TEXT, updated_at TEXT,
 PRIMARY KEY(event_id,revision,kind,mode),
 UNIQUE(event_id,kind,mode,content_digest)
);
CREATE TABLE event_booking_intents (
 event_id TEXT NOT NULL REFERENCES events(stable_event_id) ON DELETE CASCADE,
 revision INTEGER NOT NULL,
 purpose TEXT NOT NULL CHECK(purpose IN ('applications-open','deadline')),
 window_key TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(event_id,purpose,window_key)
);
CREATE VIEW event_tracking_schema AS SELECT 1 AS version;
