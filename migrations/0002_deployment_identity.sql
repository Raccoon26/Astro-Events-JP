-- Identity is set once by guarded initialization, never inferred by the Worker.
CREATE TABLE deployment_identity (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  environment TEXT NOT NULL CHECK(environment IN ('staging','production')),
  database_name TEXT NOT NULL UNIQUE,
  schema_version INTEGER NOT NULL CHECK(schema_version = 2),
  initialized_at TEXT NOT NULL,
  CHECK(database_name = 'astro-events-jp-' || environment)
);
