// payments.js — multi-rail payment registry (non-custodial).
//
// BRASA NEVER handles, holds, custodies, or settles money. This records a
// payment INTENT referencing the GovID and returns instructions to a VERIFIED
// destination on its rail (see src/paymethods.js for the rail catalog). In
// every case the citizen authorises the transfer in their own wallet/bank;
// BRASA only keeps the reference (and, elsewhere, issues the fiscal receipt).
// Amounts are integer minor units (céntimos / cents).

import { uuidv7 } from "./govid.js";
import { hmacMsisdn } from "./crypto.js";
import { railConfig } from "./paymethods.js";
import * as db from "./db.js";

export async function registerPayment(env, govId, opts = {}) {
  const { vertical = null, segment = null, amount_minor, destination, language = "en" } = opts;

  if (!Number.isInteger(amount_minor) || amount_minor <= 0) return { ok: false, reason: "bad_amount" };
  // Hard gate: never generate instructions to an unverified destination.
  if (!destination || destination.verified !== true) return { ok: false, reason: "unverified_destination" };
  if (!destination.rail) return { ok: false, reason: "no_rail" };

  const citizen = await db.getCitizenByGovId(env, govId);
  if (!citizen) return { ok: false, reason: "not_found" };

  const pay_id = uuidv7();
  const pay_ref = `BRASA-${citizen.display_id}-${pay_id.slice(0, 8)}`;
  const currency = destination.currency || "CRC";

  await db.insertPayment(env, {
    pay_id, gov_id: govId, rail: destination.rail, vertical, segment,
    amount_minor, currency, pay_ref, status: "registered", created_at: Date.now(),
  });
  await db.recordCdr(env, govId, "pay", language, `registered:${destination.rail}`);

  return {
    ok: true, pay_id, pay_ref, rail: destination.rail, amount_minor, currency,
    instruction: buildInstruction(destination, amount_minor, currency, pay_ref),
    note: "BRASA records this reference only. The citizen pays on their own wallet/bank; BRASA never holds funds.",
  };
}

// Structured, rail-specific instruction (the channel renders the text). Driven
// by the rail catalog: key rails emit their stable identifier field; merchant
// rails emit merchant/account/dial; M-Pesa emits Paybill or Till.
export function buildInstruction(dest, amount_minor, currency, ref) {
  const c = railConfig(dest.rail);
  const base = { rail: dest.rail, name: dest.name, amount_minor, currency, reference: ref };
  if (c.family === "key") return { ...base, [c.field]: dest.account };
  if (c.family === "mpesa")
    return dest.account_ref
      ? { ...base, method: "paybill", paybill: dest.account, account: dest.account_ref }
      : { ...base, method: "till", till: dest.account };
  return { ...base, method: "merchant", code: dest.account, account: dest.account_ref || null, dial: dest.dial_code || null };
}

export async function getPayments(env, govId) {
  return db.getPaymentsByGov(env, govId);
}

// Channel entry point (USSD/WhatsApp): resolve citizen by phone anchor, resolve
// a VERIFIED destination by pay code, then register the intent on its rail.
export async function registerPaymentByPhone(env, msisdn, code, amount_minor, language = "en") {
  const hmac = await hmacMsisdn(msisdn, env.MSISDN_PEPPER);
  const citizen = await db.findByMsisdnHmac(env, hmac);
  if (!citizen) return { ok: false, reason: "no_account" };

  const dest = await db.getDestination(env, code);
  if (!dest) return { ok: false, reason: "unknown_destination" };

  return registerPayment(env, citizen.gov_id, {
    amount_minor,
    destination: {
      rail: dest.rail, account: dest.account, account_ref: dest.account_ref, dial_code: dest.dial_code,
      name: dest.name, currency: dest.currency,
      verified: dest.verified === 1 || dest.verified === true,
    },
    vertical: dest.vertical, segment: dest.segment, language,
  });
}
