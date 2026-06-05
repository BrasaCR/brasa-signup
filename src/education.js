// education.js — the persistent learning thread, keyed on the GovID. This binds
// the BRASA Education Architecture (native lessons, external referrals,
// attestations, certifications) to the identity. One thread per citizen.

import { uuidv7 } from "./govid.js";
import * as db from "./db.js";

const KINDS = ["native_lesson", "referral", "attestation", "certification"];

export async function appendThread(env, govId, entry = {}) {
  const { kind, provider = null, subject = null, detail = null, language = "en" } = entry;
  if (!KINDS.includes(kind)) return { ok: false, reason: "bad_kind" };

  const citizen = await db.getCitizenByGovId(env, govId);
  if (!citizen) return { ok: false, reason: "not_found" };

  const entry_id = uuidv7();
  await db.appendThread(env, { entry_id, gov_id: govId, ts: Date.now(), kind, provider, subject, detail });
  await db.recordCdr(env, govId, "learning", language, kind);
  return { ok: true, entry_id };
}

export async function getThread(env, govId) {
  return db.getThreadByGov(env, govId);
}
