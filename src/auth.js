// auth.js — returning-citizen authentication and PIN management (Phase 2, LoA 2).

import { hmacMsisdn, hashPin, verifyPin } from "./crypto.js";
import * as db from "./db.js";

export const validPin = pin => /^[0-9]{4,6}$/.test(String(pin || ""));

async function byPhone(env, msisdn) {
  const hmac = await hmacMsisdn(msisdn, env.MSISDN_PEPPER);
  return db.findByMsisdnHmac(env, hmac);
}

// Whether a GovID exists on this phone and whether it has a PIN set.
export async function accountState(env, msisdn) {
  const c = await byPhone(env, msisdn);
  return c ? { found: true, hasPin: !!c.pin_hash, loa: c.loa } : { found: false };
}

// Set a PIN for the first time — raises the identity to LoA 2.
export async function setPin(env, msisdn, newPin) {
  if (!validPin(newPin)) return { ok: false, reason: "bad_pin" };
  const c = await byPhone(env, msisdn);
  if (!c) return { ok: false, reason: "no_account" };
  if (c.pin_hash) return { ok: false, reason: "pin_exists" };
  await db.setPinHash(env, c.gov_id, await hashPin(newPin), Math.max(c.loa, 2));
  await db.logEvent(env, c.gov_id, "loa_up", "pin_set");
  return { ok: true, loa: Math.max(c.loa, 2) };
}

// Change an existing PIN — requires the current PIN.
export async function changePin(env, msisdn, currentPin, newPin) {
  if (!validPin(newPin)) return { ok: false, reason: "bad_pin" };
  const c = await byPhone(env, msisdn);
  if (!c) return { ok: false, reason: "no_account" };
  if (!c.pin_hash) return { ok: false, reason: "no_pin" };
  if (!(await verifyPin(currentPin, c.pin_hash))) return { ok: false, reason: "wrong_pin" };
  await db.setPinHash(env, c.gov_id, await hashPin(newPin), Math.max(c.loa, 2));
  await db.logEvent(env, c.gov_id, "pin_change");
  return { ok: true };
}

// Authenticate a returning citizen for an LoA-2 action.
export async function authenticate(env, msisdn, pin) {
  const c = await byPhone(env, msisdn);
  if (!c) return { ok: false, reason: "no_account" };
  if (!c.pin_hash) return { ok: false, reason: "no_pin", gov_id: c.gov_id, loa: c.loa };
  if (!(await verifyPin(pin, c.pin_hash))) return { ok: false, reason: "wrong_pin" };
  await db.logEvent(env, c.gov_id, "auth");
  return { ok: true, gov_id: c.gov_id, loa: c.loa, display_id: c.display_id };
}
