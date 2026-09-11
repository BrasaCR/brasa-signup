CREATE TABLE IF NOT EXISTS service_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash) = 64),
  display_id TEXT NOT NULL,
  audience TEXT NOT NULL CHECK(audience IN ('brasa-education')),
  assurance_level INTEGER NOT NULL CHECK(assurance_level BETWEEN 1 AND 3),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_service_sessions_lookup ON service_sessions(token_hash, audience, expires_at) WHERE revoked_at IS NULL;
