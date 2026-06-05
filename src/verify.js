// verify.js — public verifier. Validates the display handle offline (check
// symbol) before any database lookup, returns status (no personal data), and
// returns the citizen's credentials with full-chain signature validity.

import { parseDisplay } from "./govid.js";
import { verifyChain } from "./sign.js";
import * as db from "./db.js";

// GET /verify?id=BRA-XXXXX-XXXXX-C
export async function handleVerify(env, displayId) {
  const p = parseDisplay(displayId);
  if (!p.valid) return { valid: false, reason: "bad_check_symbol" };

  const c = await db.getByDisplayId(env, p.normalized);
  if (!c) return { valid: false, reason: "not_found" };

  const full = await db.getFullByDisplayId(env, p.normalized);
  const creds = await db.getCredentialsByGov(env, full.gov_id);
  const credentials = [];
  for (const cr of creds) {
    const key = await db.getSigningKey(env, cr.key_id);
    const chk = await verifyChain(env.ROOT_PUBLIC_KEY, key, cr);
    credentials.push({
      cred_id: cr.cred_id, credential: cr.credential, std_version: cr.std_version,
      issued_at: cr.issued_at, valid: chk.valid, ...(chk.valid ? {} : { reason: chk.reason }),
    });
  }

  return {
    valid: true,
    display_id: c.display_id,
    status: c.status,            // provisional | active | dormant | closed
    loa: c.loa,
    issued_at: c.created_at,
    credentials,
  };
}

// GET /credential?id=<cred_id> — verify a single credential's signature chain.
export async function handleVerifyCredential(env, credId) {
  const cr = await db.getCredentialById(env, credId);
  if (!cr) return { valid: false, reason: "not_found" };
  const key = await db.getSigningKey(env, cr.key_id);
  const chk = await verifyChain(env.ROOT_PUBLIC_KEY, key, cr);
  return {
    valid: chk.valid,
    ...(chk.valid ? {} : { reason: chk.reason }),
    cred_id: cr.cred_id,
    display_id: cr.display_id,
    credential: cr.credential,
    std_version: cr.std_version,
    issued_at: cr.issued_at,
    key_id: cr.key_id,
  };
}
