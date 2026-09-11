CREATE TABLE IF NOT EXISTS government_operator_invitations (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE CHECK(length(code_hash)=64),
  display_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_government_invitation_lookup ON government_operator_invitations(code_hash, expires_at) WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS government_operator_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE CHECK(length(token_hash)=64),
  display_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  auth_assurance TEXT NOT NULL DEFAULT 'invitation' CHECK(auth_assurance IN ('invitation','cloudflare-access-phishing-resistant')),
  access_subject TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_government_session_lookup ON government_operator_sessions(token_hash, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS government_operator_access_identities (
  display_id TEXT PRIMARY KEY,
  access_subject TEXT NOT NULL UNIQUE,
  bound_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_authenticated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
