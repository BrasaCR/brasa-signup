ALTER TABLE business_operator_sessions ADD COLUMN auth_assurance TEXT NOT NULL DEFAULT 'invitation'
  CHECK(auth_assurance IN ('invitation','cloudflare-access-phishing-resistant'));
ALTER TABLE business_operator_sessions ADD COLUMN access_subject TEXT;

CREATE TABLE IF NOT EXISTS business_operator_access_identities (
  display_id TEXT PRIMARY KEY,
  access_subject TEXT NOT NULL UNIQUE,
  bound_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_authenticated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_business_operator_access_subject
  ON business_operator_access_identities(access_subject);
