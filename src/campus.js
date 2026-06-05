// campus.js — Phase 5: LoA-3 in-person verification at ABC campuses.
//
// LoA ladder:
//   1  anchor only        — a phone number resolves to a GovID
//   2  PIN (knowledge)    — set/step-up via auth.js
//   3  in-person proofed  — an authorized officer at an ABC campus attests the
//                           citizen's identity face to face (this module)
//
// LoA-3 unlocks the highest-assurance modules and provides the no-PIN recovery
// path that recover.js points to ("recover it in person at an ABC campus").
//
// Transport auth for these operations is the admin gate (the campus operator
// console). The acting officer's identity travels in the payload and is
// validated against the officers registry, producing an append-only attestation.

import { uuidv7 } from "./govid.js";
import { hmacMsisdn } from "./crypto.js";
import * as db from "./db.js";

export async function registerCampus(env, { campus_id, name, country = null, location = null } = {}) {
  if (!campus_id || !name) return { ok: false, reason: "bad_input" };
  await db.upsertCampus(env, { campus_id, name, country, location, status: "active", created_at: Date.now() });
  return { ok: true, campus_id };
}

export async function registerOfficer(env, { officer_id, campus_id, name } = {}) {
  if (!officer_id || !campus_id || !name) return { ok: false, reason: "bad_input" };
  const campus = await db.getCampus(env, campus_id);
  if (!campus || campus.status !== "active") return { ok: false, reason: "no_campus" };
  await db.upsertOfficer(env, { officer_id, campus_id, name, status: "active", created_at: Date.now() });
  return { ok: true, officer_id, campus_id };
}

// Validate that (officer, campus) is an authorized, active pair.
async function authorize(env, campus_id, officer_id) {
  const campus = await db.getCampus(env, campus_id);
  if (!campus || campus.status !== "active") return { ok: false, reason: "no_campus" };
  const officer = await db.getOfficer(env, officer_id);
  if (!officer || officer.status !== "active") return { ok: false, reason: "no_officer" };
  if (officer.campus_id !== campus_id) return { ok: false, reason: "officer_campus_mismatch" };
  return { ok: true, campus, officer };
}

// LoA-3: an authorized officer attests a citizen's identity in person, by the
// display_id the citizen presents (BRA-XXXXX-XXXXX-C).
export async function verifyInPerson(env, { display_id, campus_id, officer_id, method = "document" } = {}) {
  const auth = await authorize(env, campus_id, officer_id);
  if (!auth.ok) return auth;
  const c = await db.getFullByDisplayId(env, display_id);
  if (!c) return { ok: false, reason: "not_found" };

  const ver_id = uuidv7();
  await db.insertVerification(env, { ver_id, gov_id: c.gov_id, campus_id, officer_id, method, ts: Date.now() });
  await db.setLoa(env, c.gov_id, 3);
  await db.logEvent(env, c.gov_id, "loa_up", `inperson:${campus_id}:${officer_id}`);
  return { ok: true, gov_id: c.gov_id, display_id: c.display_id, loa: 3, ver_id };
}

// In-person recovery — the no-PIN path. An authorized officer rebinds the GovID
// to the phone of the person physically present and raises them to LoA-3. This
// also supersedes any staged number-rebind recovery.
export async function recoverInPerson(env, { display_id, new_msisdn, campus_id, officer_id } = {}) {
  if (!new_msisdn) return { ok: false, reason: "bad_input" };
  const auth = await authorize(env, campus_id, officer_id);
  if (!auth.ok) return auth;
  const c = await db.getFullByDisplayId(env, display_id);
  if (!c) return { ok: false, reason: "not_found" };

  const newHmac = await hmacMsisdn(new_msisdn, env.MSISDN_PEPPER);
  await db.updateMsisdnHmac(env, c.gov_id, newHmac);
  await db.markRecovery(env, c.gov_id, "completed");   // any pending rebind is now moot
  const ver_id = uuidv7();
  await db.insertVerification(env, { ver_id, gov_id: c.gov_id, campus_id, officer_id, method: "recovery", ts: Date.now() });
  await db.setLoa(env, c.gov_id, 3);
  await db.logEvent(env, c.gov_id, "recover", `inperson:${campus_id}:${officer_id}`);
  return { ok: true, gov_id: c.gov_id, display_id: c.display_id, loa: 3, ver_id };
}

// The attestation chain for a citizen (LoA-3 audit readout).
export async function listVerifications(env, govId) {
  return db.getVerificationsByGov(env, govId);
}
