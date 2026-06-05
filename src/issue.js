// issue.js — channel-independent issuance + lookup (Phase 1)
// The carrier session / webhook supplies msisdn and language; this layer
// never detects language and never persists the plaintext number.

import { uuidv7, formatDisplay } from "./govid.js";
import { hmacMsisdn } from "./crypto.js";
import * as db from "./db.js";

async function anchor(env, msisdn) {
  const hmac = await hmacMsisdn(msisdn, env.MSISDN_PEPPER);
  return { hmac, citizen: await db.findByMsisdnHmac(env, hmac) };
}

// Mint a new GovID, or return the existing one for this phone anchor.
export async function issueGovId(env, msisdn, lang) {
  const { hmac, citizen } = await anchor(env, msisdn);
  if (citizen) return { existing: true, display_id: citizen.display_id, gov_id: citizen.gov_id };

  for (let attempt = 0; attempt < 5; attempt++) {
    const gov_id = uuidv7();
    const display_id = formatDisplay(gov_id);
    const now = Date.now();
    try {
      await db.insertCitizen(env, {
        gov_id, display_id, msisdn_hmac: hmac, created_at: now,
        status: "provisional", loa: 1, language: lang, updated_at: now,
      });
      await db.logEvent(env, gov_id, "issued");
      return { existing: false, display_id, gov_id };
    } catch (e) {
      if (String(e).includes("UNIQUE")) {
        const c2 = await db.findByMsisdnHmac(env, hmac); // lost an issuance race?
        if (c2) return { existing: true, display_id: c2.display_id, gov_id: c2.gov_id };
        continue; // display-handle collision (astronomically rare): retry
      }
      throw e;
    }
  }
  throw new Error("issue_failed");
}

export async function myGovId(env, msisdn) {
  const { citizen } = await anchor(env, msisdn);
  return citizen
    ? { found: true, display_id: citizen.display_id, status: citizen.status }
    : { found: false };
}
