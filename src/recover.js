// recover.js — number-rebind recovery with a SIM-swap cool-down (Phase 2).
//
// Model: a citizen who lost their old SIM initiates recovery FROM the new SIM
// (possession of the new number is proven by the inbound session) and supplies
// their GovID + PIN (knowledge). The rebind is staged with a cool-down window.
// During the window the legitimate holder still on the OLD number can cancel,
// which defeats a SIM-swap attacker. LoA-3 holders recover in person instead.

import { hmacMsisdn, verifyPin } from "./crypto.js";
import { parseDisplay } from "./govid.js";
import * as db from "./db.js";

const DEFAULT_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24h
const cooldownMs = env => Number(env.RECOVERY_COOLDOWN_MS || DEFAULT_COOLDOWN_MS);

// Step 1 — from the NEW number: prove GovID + PIN, stage the rebind.
export async function initiateRecovery(env, newMsisdn, displayId, pin) {
  const p = parseDisplay(displayId);
  if (!p.valid) return { ok: false, reason: "bad_govid" };

  const c = await db.getFullByDisplayId(env, p.normalized);
  if (!c) return { ok: false, reason: "not_found" };
  if (!c.pin_hash) return { ok: false, reason: "no_pin" };          // must recover in person
  if (!(await verifyPin(pin, c.pin_hash))) return { ok: false, reason: "wrong_pin" };

  const newHmac = await hmacMsisdn(newMsisdn, env.MSISDN_PEPPER);
  if (newHmac === c.msisdn_hmac) return { ok: false, reason: "same_number" };

  const other = await db.findByMsisdnHmac(env, newHmac);
  if (other && other.gov_id !== c.gov_id) return { ok: false, reason: "number_in_use" };

  const now = Date.now();
  const until = now + cooldownMs(env);
  await db.putRecovery(env, {
    gov_id: c.gov_id, new_msisdn_hmac: newHmac,
    requested_at: now, cooldown_until: until, status: "pending",
  });
  await db.logEvent(env, c.gov_id, "recover", "initiated");
  return { ok: true, cooldown_until: until, display_id: c.display_id };
}

// From the NEW number: is a rebind pending / ready?
export async function recoveryStatus(env, newMsisdn) {
  const newHmac = await hmacMsisdn(newMsisdn, env.MSISDN_PEPPER);
  const r = await db.getRecoveryByNewHmac(env, newHmac);
  if (!r) return { pending: false };
  return { pending: true, ready: Date.now() >= r.cooldown_until, cooldown_until: r.cooldown_until };
}

// Step 2 — from the NEW number, after the cool-down: complete the rebind.
export async function completeRecovery(env, newMsisdn) {
  const newHmac = await hmacMsisdn(newMsisdn, env.MSISDN_PEPPER);
  const r = await db.getRecoveryByNewHmac(env, newHmac);
  if (!r) return { ok: false, reason: "no_pending" };
  if (Date.now() < r.cooldown_until) return { ok: false, reason: "cooldown", cooldown_until: r.cooldown_until };

  await db.updateMsisdnHmac(env, r.gov_id, newHmac);
  await db.markRecovery(env, r.gov_id, "completed");
  await db.logEvent(env, r.gov_id, "recover", "completed");
  const c = await db.findByMsisdnHmac(env, newHmac);
  return { ok: true, display_id: c?.display_id };
}

// From the OLD number: cancel a fraudulent recovery against my identity.
export async function cancelRecovery(env, oldMsisdn) {
  const oldHmac = await hmacMsisdn(oldMsisdn, env.MSISDN_PEPPER);
  const c = await db.findByMsisdnHmac(env, oldHmac);
  if (!c) return { ok: false, reason: "no_account" };
  const r = await db.getRecoveryByGov(env, c.gov_id);
  if (!r) return { ok: false, reason: "no_pending" };
  await db.markRecovery(env, c.gov_id, "cancelled");
  await db.logEvent(env, c.gov_id, "recover", "cancelled");
  return { ok: true };
}

// From the NEW number: abandon my own pending request.
export async function cancelByNew(env, newMsisdn) {
  const newHmac = await hmacMsisdn(newMsisdn, env.MSISDN_PEPPER);
  const r = await db.getRecoveryByNewHmac(env, newHmac);
  if (!r) return { ok: false, reason: "no_pending" };
  await db.markRecovery(env, r.gov_id, "cancelled");
  await db.logEvent(env, r.gov_id, "recover", "cancelled_by_requester");
  return { ok: true };
}
