ALTER TABLE service_sessions ADD COLUMN family_id TEXT;
ALTER TABLE service_sessions ADD COLUMN family_expires_at TEXT;
ALTER TABLE service_sessions ADD COLUMN rotated_from TEXT;
CREATE INDEX IF NOT EXISTS idx_service_session_family ON service_sessions(family_id, created_at);
CREATE TABLE IF NOT EXISTS session_invitations (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE CHECK(length(code_hash) = 64),
  display_id TEXT NOT NULL,
  audience TEXT NOT NULL CHECK(audience IN ('brasa-education')),
  assurance_level INTEGER NOT NULL CHECK(assurance_level BETWEEN 1 AND 3),
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);
