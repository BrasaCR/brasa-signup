// credentials.js — issue and read BRASA Standard credentials bound to a GovID.
//
// Issuance is an administrative action performed by BRASA Standards after
// assessment (not citizen self-serve), so the Worker route is admin-gated.
// LoA 2 (a set PIN) is the minimum binding assurance; high-stakes credentials
// would additionally require LoA 3 (verified in person) — enforced by policy
// at the assessment layer.

import { uuidv7, parseDisplay } from "./govid.js";
import { sign, canonicalCredential } from "./sign.js";
import * as db from "./db.js";

async function resolveCitizen(env, ref) {
  if (typeof ref === "string" && ref.toUpperCase().startsWith("BRA")) {
    const p = parseDisplay(ref);
    if (!p.valid) return { error: "bad_govid" };
    const c = await db.getFullByDisplayId(env, p.normalized);
    return c ? { citizen: c } : { error: "not_found" };
  }
  const c = await db.getCitizenByGovId(env, ref);
  return c ? { citizen: c } : { error: "not_found" };
}

export async function issueCredential(env, ref, credential, stdVersion) {
  if (/\|/.test(credential) || /\|/.test(stdVersion)) return { ok: false, reason: "bad_input" };

  const { citizen, error } = await resolveCitizen(env, ref);
  if (error) return { ok: false, reason: error };
  if ((citizen.loa || 1) < 2) return { ok: false, reason: "loa_too_low" };

  const cred = {
    cred_id: uuidv7(),
    gov_id: citizen.gov_id,
    credential,
    std_version: stdVersion,
    issued_at: Date.now(),
    key_id: env.SIGNING_KEY_ID,
  };
  cred.signature = await sign(env.SIGNING_PRIVATE_KEY, canonicalCredential(cred));

  await db.insertCredential(env, { ...cred, status: "active" });
  await db.logEvent(env, citizen.gov_id, "credential", credential);
  return { ok: true, ...cred };
}

export async function listCredentials(env, govId) {
  return db.getCredentialsByGov(env, govId);
}
