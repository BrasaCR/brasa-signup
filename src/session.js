// session.js — the integration entry point. Resolves an inbound channel event
// to a GovID, enforces the module's Level of Assurance, and writes one
// content-free CDR row keyed on the GovID. This is how "every activity record
// is keyed on the GovID" and "exercising any right is authenticated by the
// GovID at the appropriate LoA" are realised. Intended to be called by the
// trusted brasa-ai Worker (which supplies the session language).

import { hmacMsisdn } from "./crypto.js";
import { authenticate } from "./auth.js";
import { moduleLoA } from "./rights.js";
import * as db from "./db.js";

export async function useModule(env, { msisdn, module, language = "en", pin = null }) {
  const required = moduleLoA(module);

  const hmac = await hmacMsisdn(msisdn, env.MSISDN_PEPPER);
  const citizen = await db.findByMsisdnHmac(env, hmac);
  if (!citizen) return { status: "need_govid", module }; // no subject => no CDR

  if (required === null) {
    await db.recordCdr(env, citizen.gov_id, module, language, "unknown_module");
    return { status: "unknown_module", module, gov_id: citizen.gov_id };
  }

  if (required >= 2) {
    const auth = await authenticate(env, msisdn, pin || "");
    if (!auth.ok) {
      await db.recordCdr(env, citizen.gov_id, module, language, "need_auth");
      return { status: "need_auth", module, gov_id: citizen.gov_id, reason: auth.reason, required };
    }
  }

  if (required >= 3 && (citizen.loa || 1) < 3) {
    await db.recordCdr(env, citizen.gov_id, module, language, "need_inperson");
    return { status: "need_inperson", module, gov_id: citizen.gov_id, required, loa: citizen.loa };
  }

  await db.recordCdr(env, citizen.gov_id, module, language, "served");
  return { status: "ok", module, gov_id: citizen.gov_id, required, loa: citizen.loa };
}
