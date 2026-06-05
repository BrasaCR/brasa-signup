-- schema.sql — BRASA GovID system, brasa-citizens (D1)
-- Phase 0 foundations. Apply with:
--   wrangler d1 execute brasa-citizens --file=./schema.sql

CREATE TABLE IF NOT EXISTS citizens (
  gov_id        TEXT PRIMARY KEY,        -- canonical UUIDv7
  display_id    TEXT UNIQUE NOT NULL,    -- BRA-XXXXX-XXXXX-C
  msisdn_hmac   TEXT UNIQUE NOT NULL,    -- HMAC-SHA256(phone, pepper) — no plaintext
  created_at    INTEGER NOT NULL,        -- epoch ms
  status        TEXT NOT NULL,           -- provisional | active | dormant | closed
  loa           INTEGER NOT NULL,        -- level of assurance 1..3
  language      TEXT NOT NULL,           -- BCP-47 tag from the session layer
  region        TEXT,                    -- optional, self-declared
  display_name  TEXT,                    -- optional, citizen-controlled
  pin_hash      TEXT,                    -- PBKDF2 (Argon2id upgrade later); LoA>=2
  heir_gov_id   TEXT,                    -- Generational succession link
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_citizens_msisdn ON citizens(msisdn_hmac);

-- Activity record. One row per interaction, kept under 2KB. No content.
CREATE TABLE IF NOT EXISTS cdr (
  gov_id   TEXT NOT NULL,
  ts       INTEGER NOT NULL,
  module   TEXT NOT NULL,                -- which of the 62 OS modules
  language TEXT NOT NULL,
  outcome  TEXT NOT NULL,                -- short status code
  FOREIGN KEY (gov_id) REFERENCES citizens(gov_id)
);
CREATE INDEX IF NOT EXISTS idx_cdr_gov ON cdr(gov_id, ts);

-- Append-only identity audit trail.
CREATE TABLE IF NOT EXISTS id_events (
  gov_id  TEXT NOT NULL,
  ts      INTEGER NOT NULL,
  event   TEXT NOT NULL,                 -- issued | auth | recover | loa_up | pin_change | close
  detail  TEXT
);
CREATE INDEX IF NOT EXISTS idx_idevents_gov ON id_events(gov_id, ts);

-- Pending number-rebind recoveries. One active recovery per identity.
-- The cooldown_until window is the SIM-swap defence: the legitimate holder
-- on the old number can cancel before the rebind completes.
CREATE TABLE IF NOT EXISTS recoveries (
  gov_id          TEXT PRIMARY KEY,
  new_msisdn_hmac TEXT NOT NULL,
  requested_at    INTEGER NOT NULL,
  cooldown_until  INTEGER NOT NULL,
  status          TEXT NOT NULL          -- pending | completed | cancelled
);
CREATE INDEX IF NOT EXISTS idx_recoveries_new ON recoveries(new_msisdn_hmac);

-- Published signing keys (the key log). The root public key is published as a
-- config var; intermediates and their root-issued certificates live here.
CREATE TABLE IF NOT EXISTS signing_keys (
  key_id      TEXT PRIMARY KEY,
  public_key  TEXT NOT NULL,             -- base64 raw Ed25519 public key
  cert        TEXT NOT NULL,             -- root signature over the key cert payload
  created_at  INTEGER NOT NULL,
  status      TEXT NOT NULL              -- active | retired | revoked
);

-- Credentials bound to a GovID, each signed by an intermediate key. Permanent:
-- the Stiftung charter protects validity regardless of the GovID's lifecycle.
CREATE TABLE IF NOT EXISTS credentials (
  cred_id     TEXT PRIMARY KEY,          -- UUIDv7
  gov_id      TEXT NOT NULL,
  credential  TEXT NOT NULL,             -- e.g. "BRASA BBA"
  std_version TEXT NOT NULL,             -- BRASA Standard version
  issued_at   INTEGER NOT NULL,
  key_id      TEXT NOT NULL,             -- which intermediate signed it
  signature   TEXT NOT NULL,             -- base64 Ed25519 over the canonical payload
  status      TEXT NOT NULL,             -- active
  FOREIGN KEY (gov_id) REFERENCES citizens(gov_id),
  FOREIGN KEY (key_id) REFERENCES signing_keys(key_id)
);
CREATE INDEX IF NOT EXISTS idx_cred_gov ON credentials(gov_id);

-- Payment intents referencing a GovID, across rails (SINPE for CR/Latam,
-- M-Pesa for Kenya, extensible to MTN MoMo for Rwanda, etc). BRASA records
-- only; it never holds or settles funds.
CREATE TABLE IF NOT EXISTS payments (
  pay_id       TEXT PRIMARY KEY,        -- UUIDv7
  gov_id       TEXT NOT NULL,
  rail         TEXT NOT NULL,           -- sinpe | mpesa | momo ...
  vertical     TEXT,
  segment      TEXT,
  amount_minor INTEGER NOT NULL,        -- integer minor units (céntimos/cents)
  currency     TEXT NOT NULL,           -- CRC | KES | RWF
  pay_ref      TEXT NOT NULL,           -- reference BRASA records (not a transfer)
  status       TEXT NOT NULL,           -- registered | settled
  created_at   INTEGER NOT NULL,
  FOREIGN KEY (gov_id) REFERENCES citizens(gov_id)
);
CREATE INDEX IF NOT EXISTS idx_pay_gov ON payments(gov_id, created_at);

-- The persistent learning thread, one per citizen, keyed on the GovID.
CREATE TABLE IF NOT EXISTS learning_thread (
  entry_id  TEXT PRIMARY KEY,            -- UUIDv7
  gov_id    TEXT NOT NULL,
  ts        INTEGER NOT NULL,
  kind      TEXT NOT NULL,               -- native_lesson | referral | attestation | certification
  provider  TEXT,
  subject   TEXT,
  detail    TEXT,
  FOREIGN KEY (gov_id) REFERENCES citizens(gov_id)
);
CREATE INDEX IF NOT EXISTS idx_thread_gov ON learning_thread(gov_id, ts);

-- Verified payment destinations, looked up by a short pay code. The verified
-- flag is the hard gate: BRASA refuses to generate instructions to an
-- unverified destination. Rail-specific fields:
--   sinpe -> account = SINPE code/phone
--   mpesa -> account = Paybill/Till shortcode; account_ref = Paybill account (null for Till)
CREATE TABLE IF NOT EXISTS pay_destinations (
  code        TEXT PRIMARY KEY,         -- short pay code the citizen enters
  rail        TEXT NOT NULL,            -- sinpe | mpesa | momo | airtel
  country     TEXT,                     -- CR | KE | RW | UG ...
  account     TEXT NOT NULL,            -- SINPE code OR mobile-money short/merchant code
  account_ref TEXT,                     -- Paybill account / merchant reference (null = Till / SINPE)
  dial_code   TEXT,                     -- country-specific USSD string (e.g. *334#) for app-less rails
  name        TEXT NOT NULL,
  currency    TEXT NOT NULL,            -- CRC | KES | RWF | UGX ...
  verified    INTEGER NOT NULL,         -- 1 = verified, 0 = not
  vertical    TEXT,
  segment     TEXT
);


-- Phase 5 — LoA-3 in-person verification at ABC campuses.

-- ABC campuses: the physical points where identity can be proofed in person.
CREATE TABLE IF NOT EXISTS campuses (
  campus_id  TEXT PRIMARY KEY,           -- e.g. abc-nairobi, abc-san-jose
  name       TEXT NOT NULL,
  country    TEXT,
  location   TEXT,
  status     TEXT NOT NULL,              -- active | closed
  created_at INTEGER NOT NULL
);

-- Authorized verifying officers (agents) attached to a campus. Only an active
-- officer at an active campus may raise a citizen to LoA-3.
CREATE TABLE IF NOT EXISTS officers (
  officer_id TEXT PRIMARY KEY,
  campus_id  TEXT NOT NULL,
  name       TEXT NOT NULL,
  status     TEXT NOT NULL,              -- active | revoked
  created_at INTEGER NOT NULL,
  FOREIGN KEY (campus_id) REFERENCES campuses(campus_id)
);

-- Append-only LoA-3 attestation log: the chain of trust for in-person proofing.
-- who (officer) verified whom (gov_id), where (campus), how (method), when.
CREATE TABLE IF NOT EXISTS verifications (
  ver_id     TEXT PRIMARY KEY,           -- UUIDv7
  gov_id     TEXT NOT NULL,
  campus_id  TEXT NOT NULL,
  officer_id TEXT NOT NULL,
  method     TEXT NOT NULL,              -- document | biometric | vouch | recovery
  ts         INTEGER NOT NULL,
  FOREIGN KEY (gov_id) REFERENCES citizens(gov_id)
);
CREATE INDEX IF NOT EXISTS idx_verifications_gov ON verifications(gov_id, ts);

-- Citizen-issued capability tokens for sharing the Education Report Card. The
-- token is the QR's payload; the full portfolio is reachable only through a live
-- (unexpired, unrevoked) share the citizen created.
CREATE TABLE IF NOT EXISTS report_shares (
  token      TEXT PRIMARY KEY,           -- opaque random capability token
  gov_id     TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  status     TEXT NOT NULL,              -- active | revoked
  FOREIGN KEY (gov_id) REFERENCES citizens(gov_id)
);
CREATE INDEX IF NOT EXISTS idx_report_shares_gov ON report_shares(gov_id);
