// ussd.js — Africa's Talking USSD adapter (Phases 1-2).
// AT posts: sessionId, serviceCode, phoneNumber, text (+ language via the
// session layer). Replies start with "CON " (continue) or "END " (final).

import { issueGovId, myGovId } from "./issue.js";
import { accountState, setPin, changePin } from "./auth.js";
import { initiateRecovery, recoveryStatus, completeRecovery, cancelRecovery, cancelByNew } from "./recover.js";
import { registerPaymentByPhone } from "./payments.js";
import { getDestination } from "./db.js";
import { toMinor } from "./money.js";
import { t } from "./i18n.js";

export async function handleUssd(env, form) {
  const phone = form.get("phoneNumber");
  const lang = form.get("language") || "en";
  const tr = t(lang);
  const text = (form.get("text") || "").trim();
  const parts = text === "" ? [] : text.split("*");

  // Main menu (with a cancel-recovery option if one is pending on this identity).
  if (parts.length === 0) {
    let menu = tr.menu;
    if (await pendingOnMyAccount(env, phone)) menu += "\n" + tr.recWarn;
    return `CON ${menu}`;
  }

  // 1 — Get your GovID
  if (parts[0] === "1") {
    if (parts.length === 1) return `CON ${tr.consent}`;
    if (parts[1] === "1") {
      const r = await issueGovId(env, phone, lang);
      return `END ${r.existing ? tr.already(r.display_id) : tr.issued(r.display_id)}`;
    }
    return `END ${tr.cancelled}`;
  }

  // 2 — My GovID
  if (parts[0] === "2") {
    const r = await myGovId(env, phone);
    return `END ${r.found ? tr.already(r.display_id) : tr.none}`;
  }

  // 3 — PIN (set if none, otherwise change)
  if (parts[0] === "3") {
    const st = await accountState(env, phone);
    if (!st.found) return `END ${tr.none}`;
    if (!st.hasPin) {
      if (parts.length === 1) return `CON ${tr.enterNewPin}`;
      const r = await setPin(env, phone, parts[1]);
      return `END ${r.ok ? tr.pinSet : tr.pinInvalid}`;
    } else {
      if (parts.length === 1) return `CON ${tr.enterCurrentPin}`;
      if (parts.length === 2) return `CON ${tr.enterNewPin}`;
      const r = await changePin(env, phone, parts[1], parts[2]);
      if (r.ok) return `END ${tr.pinChanged}`;
      return `END ${r.reason === "wrong_pin" ? tr.pinWrong : tr.pinInvalid}`;
    }
  }

  // 4 — Recover GovID (used from the NEW phone)
  if (parts[0] === "4") {
    const status = await recoveryStatus(env, phone);
    if (status.pending) {
      if (!status.ready) return `END ${tr.recPending}`;
      if (parts.length === 1) return `CON ${tr.recReadyMenu}`;
      if (parts[1] === "1") {
        const r = await completeRecovery(env, phone);
        return r.ok ? `END ${tr.recDone(r.display_id)}` : `END ${tr.recPending}`;
      }
      await cancelByNew(env, phone);
      return `END ${tr.recCancelled}`;
    }
    // start a new recovery
    if (parts.length === 1) return `CON ${tr.enterGovId}`;
    if (parts.length === 2) return `CON ${tr.enterPin}`;
    const r = await initiateRecovery(env, phone, parts[1], parts[2]);
    if (r.ok) return `END ${tr.recRequested}`;
    const map = { bad_govid: tr.recBadGovId, not_found: tr.recNotFound, no_pin: tr.recNoPin,
      wrong_pin: tr.pinWrong, number_in_use: tr.recNumberInUse, same_number: tr.already("") };
    return `END ${map[r.reason] || tr.cancelled}`;
  }

  // 5 — Pay (SINPE / M-Pesa): non-custodial. BRASA records the reference only.
  if (parts[0] === "5") {
    const me = await myGovId(env, phone);
    if (!me.found) return `END ${tr.none}`;
    if (parts.length === 1) return `CON ${tr.enterPayCode}`;

    // resolve + validate the destination as soon as the code is entered
    const dest = await getDestination(env, parts[1]);
    if (!dest) return `END ${tr.payUnknownDest}`;
    if (!(dest.verified === 1 || dest.verified === true)) return `END ${tr.payUnverified}`;
    if (parts.length === 2) return `CON ${tr.enterAmount(dest.currency)}`;

    const major = parseInt(parts[2], 10);
    if (!Number.isInteger(major) || major <= 0) return `END ${tr.payBadAmount}`;

    const r = await registerPaymentByPhone(env, phone, parts[1], toMinor(major, dest.currency), lang);
    if (!r.ok) {
      const map = { unknown_destination: tr.payUnknownDest, unverified_destination: tr.payUnverified,
        bad_amount: tr.payBadAmount, no_account: tr.none, not_found: tr.none };
      return `END ${map[r.reason] || tr.cancelled}`;
    }
    return `END ${tr.payInstruction(dest.rail, {
      m: major, cur: dest.currency, name: dest.name, ref: r.pay_ref,
      dest: dest.account, account_ref: dest.account_ref, dial: dest.dial_code,
    })}`;
  }

  // 9 — Cancel a pending recovery (from the OLD number)
  if (parts[0] === "9") {
    const r = await cancelRecovery(env, phone);
    return `END ${r.ok ? tr.recCancelled : tr.cancelled}`;
  }

  return `END ${tr.cancelled}`;
}

async function pendingOnMyAccount(env, phone) {
  // lightweight check used only to surface the cancel option on the menu
  const { getRecoveryByGov, findByMsisdnHmac } = await import("./db.js");
  const { hmacMsisdn } = await import("./crypto.js");
  const hmac = await hmacMsisdn(phone, env.MSISDN_PEPPER);
  const c = await findByMsisdnHmac(env, hmac);
  if (!c) return false;
  return !!(await getRecoveryByGov(env, c.gov_id));
}
