-- Installed only in the dedicated local live trial database, after migrations 0001–0008.
CREATE TABLE IF NOT EXISTS trial_live_identity (purpose TEXT PRIMARY KEY CHECK(purpose='dev06r-local-only'));
INSERT OR IGNORE INTO trial_live_identity VALUES ('dev06r-local-only');
CREATE TABLE IF NOT EXISTS trial_live_run (
  id TEXT PRIMARY KEY, target_digest TEXT NOT NULL, github_user_id INTEGER NOT NULL, repo_id INTEGER NOT NULL, approved_plan TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision=1), expires_at INTEGER NOT NULL,
  started_at INTEGER NOT NULL, poll_reads INTEGER NOT NULL DEFAULT 0 CHECK(poll_reads BETWEEN 0 AND 15)
);
CREATE TABLE IF NOT EXISTS trial_live_outbox (
  id TEXT PRIMARY KEY, trial_id TEXT NOT NULL REFERENCES trial_live_run(id),
  part TEXT NOT NULL CHECK(part IN ('copy','management','issue')),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','sent','failed','uncertain')),
  owner TEXT, lease_until INTEGER, external_id TEXT, provider_at TEXT, safe_code TEXT,
  UNIQUE(trial_id,part)
);
CREATE TABLE IF NOT EXISTS trial_live_buttons (
  token_hash TEXT PRIMARY KEY, trial_id TEXT NOT NULL REFERENCES trial_live_run(id),
  action TEXT NOT NULL CHECK(action IN ('posted','held','recheck')),
  revision INTEGER NOT NULL CHECK(revision=1), expires_at INTEGER NOT NULL, update_id INTEGER UNIQUE, consumed_at INTEGER,
  ack_state TEXT CHECK(ack_state IN ('sending','sent','failed','uncertain')), UNIQUE(trial_id,action)
);
CREATE TABLE IF NOT EXISTS trial_live_observations (
  trial_id TEXT NOT NULL REFERENCES trial_live_run(id),
  channel TEXT NOT NULL CHECK(channel IN ('github-web','email')),
  issue_id TEXT NOT NULL, observed_at TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('received','not-received')),
  provenance TEXT NOT NULL CHECK(provenance='operator-observation'),
  PRIMARY KEY(trial_id,channel,observed_at)
);
