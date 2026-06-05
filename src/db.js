// db.js — D1 (brasa-citizens) access. env.DB is the D1 binding.

export async function findByMsisdnHmac(env, hmac) {
  return await env.DB
    .prepare("SELECT gov_id, display_id, status, loa, pin_hash FROM citizens WHERE msisdn_hmac = ?")
    .bind(hmac).first();
}

export async function getByDisplayId(env, displayId) {
  return await env.DB
    .prepare("SELECT display_id, status, loa, created_at FROM citizens WHERE display_id = ?")
    .bind(displayId).first();
}

export async function getFullByDisplayId(env, displayId) {
  return await env.DB
    .prepare("SELECT gov_id, display_id, msisdn_hmac, status, loa, pin_hash FROM citizens WHERE display_id = ?")
    .bind(displayId).first();
}

export async function insertCitizen(env, c) {
  await env.DB.prepare(
    `INSERT INTO citizens
       (gov_id, display_id, msisdn_hmac, created_at, status, loa, language, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(c.gov_id, c.display_id, c.msisdn_hmac, c.created_at, c.status, c.loa, c.language, c.updated_at).run();
}

export async function activateCitizen(env, govId) {
  await env.DB.prepare(
    "UPDATE citizens SET status='active', updated_at=? WHERE gov_id=? AND status='provisional'"
  ).bind(Date.now(), govId).run();
}

export async function setPinHash(env, govId, pinHash, loa) {
  await env.DB.prepare(
    `UPDATE citizens SET pin_hash = ?, loa = ?,
       status = CASE WHEN status='provisional' THEN 'active' ELSE status END,
       updated_at = ? WHERE gov_id = ?`
  ).bind(pinHash, loa, Date.now(), govId).run();
}

export async function updateMsisdnHmac(env, govId, newHmac) {
  await env.DB.prepare(
    "UPDATE citizens SET msisdn_hmac = ?, updated_at = ? WHERE gov_id = ?"
  ).bind(newHmac, Date.now(), govId).run();
}

export async function logEvent(env, govId, event, detail = null) {
  await env.DB.prepare(
    "INSERT INTO id_events (gov_id, ts, event, detail) VALUES (?, ?, ?, ?)"
  ).bind(govId, Date.now(), event, detail).run();
}

// --- recoveries ---

export async function putRecovery(env, r) {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO recoveries
       (gov_id, new_msisdn_hmac, requested_at, cooldown_until, status)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(r.gov_id, r.new_msisdn_hmac, r.requested_at, r.cooldown_until, r.status).run();
}

export async function getRecoveryByNewHmac(env, hmac) {
  return await env.DB.prepare(
    `SELECT gov_id, new_msisdn_hmac, requested_at, cooldown_until, status
       FROM recoveries WHERE new_msisdn_hmac = ? AND status = 'pending'`
  ).bind(hmac).first();
}

export async function getRecoveryByGov(env, govId) {
  return await env.DB.prepare(
    `SELECT gov_id, new_msisdn_hmac, requested_at, cooldown_until, status
       FROM recoveries WHERE gov_id = ? AND status = 'pending'`
  ).bind(govId).first();
}

export async function markRecovery(env, govId, status) {
  await env.DB.prepare(
    "UPDATE recoveries SET status = ? WHERE gov_id = ?"
  ).bind(status, govId).run();
}

// --- credentials & signing keys (Phase 3) ---

export async function getCitizenByGovId(env, govId) {
  return await env.DB
    .prepare("SELECT gov_id, display_id, status, loa FROM citizens WHERE gov_id = ?")
    .bind(govId).first();
}

export async function insertCredential(env, c) {
  await env.DB.prepare(
    `INSERT INTO credentials
       (cred_id, gov_id, credential, std_version, issued_at, key_id, signature, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(c.cred_id, c.gov_id, c.credential, c.std_version, c.issued_at, c.key_id, c.signature, c.status).run();
}

export async function getCredentialById(env, credId) {
  return await env.DB.prepare(
    `SELECT cr.cred_id, cr.gov_id, cr.credential, cr.std_version, cr.issued_at,
            cr.key_id, cr.signature, cr.status, ci.display_id
       FROM credentials cr JOIN citizens ci ON ci.gov_id = cr.gov_id
      WHERE cr.cred_id = ?`
  ).bind(credId).first();
}

export async function getCredentialsByGov(env, govId) {
  const r = await env.DB.prepare(
    `SELECT cred_id, gov_id, credential, std_version, issued_at, key_id, signature, status
       FROM credentials WHERE gov_id = ? ORDER BY issued_at`
  ).bind(govId).all();
  return r.results || [];
}

export async function getSigningKey(env, keyId) {
  return await env.DB.prepare(
    "SELECT key_id, public_key, cert, created_at, status FROM signing_keys WHERE key_id = ?"
  ).bind(keyId).first();
}

export async function listSigningKeys(env) {
  const r = await env.DB.prepare(
    "SELECT key_id, public_key, cert, created_at, status FROM signing_keys ORDER BY created_at"
  ).all();
  return r.results || [];
}

export async function upsertSigningKey(env, k) {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO signing_keys (key_id, public_key, cert, created_at, status)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(k.key_id, k.public_key, k.cert, k.created_at, k.status).run();
}

// --- platform integration (Phase 4): CDR, payments, learning thread ---

export async function recordCdr(env, govId, module, language, outcome) {
  await env.DB.prepare(
    "INSERT INTO cdr (gov_id, ts, module, language, outcome) VALUES (?, ?, ?, ?, ?)"
  ).bind(govId, Date.now(), module, language, outcome).run();
}

export async function insertPayment(env, p) {
  await env.DB.prepare(
    `INSERT INTO payments
       (pay_id, gov_id, rail, vertical, segment, amount_minor, currency, pay_ref, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(p.pay_id, p.gov_id, p.rail, p.vertical, p.segment, p.amount_minor, p.currency, p.pay_ref, p.status, p.created_at).run();
}

export async function getPaymentsByGov(env, govId) {
  const r = await env.DB.prepare(
    "SELECT pay_id, gov_id, rail, vertical, segment, amount_minor, currency, pay_ref, status, created_at FROM payments WHERE gov_id = ? ORDER BY created_at"
  ).bind(govId).all();
  return r.results || [];
}

export async function appendThread(env, e) {
  await env.DB.prepare(
    "INSERT INTO learning_thread (entry_id, gov_id, ts, kind, provider, subject, detail) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(e.entry_id, e.gov_id, e.ts, e.kind, e.provider, e.subject, e.detail).run();
}

export async function getThreadByGov(env, govId) {
  const r = await env.DB.prepare(
    "SELECT entry_id, gov_id, ts, kind, provider, subject, detail FROM learning_thread WHERE gov_id = ? ORDER BY ts"
  ).bind(govId).all();
  return r.results || [];
}

// --- payment destination registry (multi-rail) ---

export async function getDestination(env, code) {
  return await env.DB.prepare(
    "SELECT code, rail, country, account, account_ref, dial_code, name, currency, verified, vertical, segment FROM pay_destinations WHERE code = ?"
  ).bind(code).first();
}

export async function upsertDestination(env, d) {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO pay_destinations
       (code, rail, country, account, account_ref, dial_code, name, currency, verified, vertical, segment)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(d.code, d.rail, d.country ?? null, d.account, d.account_ref ?? null, d.dial_code ?? null,
         d.name, d.currency, d.verified ? 1 : 0, d.vertical ?? null, d.segment ?? null).run();
}

// --- Phase 5: LoA-3 in-person verification at ABC campuses ---

export async function setLoa(env, govId, loa) {
  await env.DB
    .prepare("UPDATE citizens SET loa = ?, updated_at = ? WHERE gov_id = ?")
    .bind(loa, Date.now(), govId).run();
}

export async function upsertCampus(env, c) {
  await env.DB
    .prepare(`INSERT OR REPLACE INTO campuses
       (campus_id, name, country, location, status, created_at) VALUES (?,?,?,?,?,?)`)
    .bind(c.campus_id, c.name, c.country ?? null, c.location ?? null, c.status, c.created_at).run();
}

export async function getCampus(env, campusId) {
  return env.DB
    .prepare("SELECT campus_id, name, country, location, status, created_at FROM campuses WHERE campus_id = ?")
    .bind(campusId).first();
}

export async function upsertOfficer(env, o) {
  await env.DB
    .prepare(`INSERT OR REPLACE INTO officers
       (officer_id, campus_id, name, status, created_at) VALUES (?,?,?,?,?)`)
    .bind(o.officer_id, o.campus_id, o.name, o.status, o.created_at).run();
}

export async function getOfficer(env, officerId) {
  return env.DB
    .prepare("SELECT officer_id, campus_id, name, status, created_at FROM officers WHERE officer_id = ?")
    .bind(officerId).first();
}

export async function insertVerification(env, v) {
  await env.DB
    .prepare(`INSERT INTO verifications
       (ver_id, gov_id, campus_id, officer_id, method, ts) VALUES (?,?,?,?,?,?)`)
    .bind(v.ver_id, v.gov_id, v.campus_id, v.officer_id, v.method, v.ts).run();
}

export async function getVerificationsByGov(env, govId) {
  const { results } = await env.DB
    .prepare("SELECT ver_id, gov_id, campus_id, officer_id, method, ts FROM verifications WHERE gov_id = ? ORDER BY ts ASC")
    .bind(govId).all();
  return results;
}

// --- Phase 6: aggregate, content-free metrics for the OpenLedger ---
// All queries are COUNT/GROUP BY only. No gov_id, number, or message leaves here.

export async function metricCitizensByStatus(env) {
  const { results } = await env.DB.prepare("SELECT status, COUNT(*) AS n FROM citizens GROUP BY status").bind().all();
  return results;
}
export async function metricCitizensByLoa(env) {
  const { results } = await env.DB.prepare("SELECT loa, COUNT(*) AS n FROM citizens GROUP BY loa").bind().all();
  return results;
}
export async function metricCitizensByLanguage(env) {
  const { results } = await env.DB.prepare("SELECT language, COUNT(*) AS n FROM citizens GROUP BY language").bind().all();
  return results;
}
export async function metricRecoveriesByStatus(env) {
  const { results } = await env.DB.prepare("SELECT status, COUNT(*) AS n FROM recoveries GROUP BY status").bind().all();
  return results;
}
export async function metricCredentialCount(env) {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM credentials").bind().first();
  return r ? r.n : 0;
}
export async function metricVerificationCount(env) {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM verifications").bind().first();
  return r ? r.n : 0;
}
export async function metricCdrCount(env) {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM cdr").bind().first();
  return r ? r.n : 0;
}

// --- Report card capability shares (the QR token) ---

export async function insertShare(env, s) {
  await env.DB
    .prepare(`INSERT INTO report_shares (token, gov_id, created_at, expires_at, status) VALUES (?,?,?,?,?)`)
    .bind(s.token, s.gov_id, s.created_at, s.expires_at, s.status).run();
}
export async function getShare(env, token) {
  return env.DB
    .prepare("SELECT token, gov_id, created_at, expires_at, status FROM report_shares WHERE token = ?")
    .bind(token).first();
}
export async function revokeShare(env, token) {
  await env.DB.prepare("UPDATE report_shares SET status = 'revoked' WHERE token = ?").bind(token).run();
}
