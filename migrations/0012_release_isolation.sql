-- Dedicated validation bindings are authorized separately. This ledger has no default marker.
CREATE TABLE release_isolation (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1),
 purpose TEXT NOT NULL CHECK(purpose IN('synthetic-rehearsal','staging-auth-validation')),
 schema_version INTEGER NOT NULL CHECK(schema_version=1),
 auth_attempt_at TEXT
);
