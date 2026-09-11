CREATE TABLE IF NOT EXISTS business_operator_invitations (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE CHECK(length(code_hash)=64),
  display_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_business_invitation_lookup ON business_operator_invitations(code_hash, expires_at) WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS business_operator_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),
  display_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_business_session_lookup ON business_operator_sessions(token_hash, expires_at) WHERE revoked_at IS NULL;

