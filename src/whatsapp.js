// whatsapp.js — WhatsApp Business (Cloud API) adapter (Phases 1-2).
// Keyword commands (language from the webhook payload via the session layer):
//   1 | govid | empezar | start          -> get / show GovID
//   2 | mi govid | my govid              -> my GovID
//   pin <new>                            -> set PIN (LoA 2)
//   pin <current> <new>                  -> change PIN
//   recover|recuperar <GovID> <pin>      -> start recovery from this (new) number
//   complete|completar                   -> finish recovery after the cool-down
//   cancel|cancelar                      -> cancel a pending recovery
//   pay|pagar <code> <amount>            -> register a payment to a verified destination

import { issueGovId, myGovId } from "./issue.js";
import { setPin, changePin } from "./auth.js";
import { initiateRecovery, completeRecovery, cancelRecovery, cancelByNew } from "./recover.js";
import { registerPaymentByPhone } from "./payments.js";
import { createShareByPhone } from "./report.js";
import { getDestination } from "./db.js";
import { toMinor } from "./money.js";
import { t } from "./i18n.js";

export async function handleWhatsApp(env, body) {
  const value = body?.entry?.[0]?.changes?.[0]?.value;
  const msg = value?.messages?.[0];
  if (!msg) return; // delivery/status callback

  const from = msg.from;
  const raw = (msg.text?.body || "").trim();
  const lang = value?.contacts?.[0]?.lang || "en";
  const tr = t(lang);
  const reply = await route(env, from, raw, tr, lang);
  await sendWhatsApp(env, from, reply);
  return reply;
}

async function route(env, from, raw, tr, lang) {
  const toks = raw.split(/\s+/);
  const cmd = (toks[0] || "").toLowerCase();

  if (["1", "govid", "empezar", "start"].includes(cmd)) {
    const r = await issueGovId(env, from, lang);
    return r.existing ? tr.already(r.display_id) : tr.issued(r.display_id);
  }
  if (["2"].includes(cmd) || raw.toLowerCase() === "mi govid" || raw.toLowerCase() === "my govid") {
    const r = await myGovId(env, from);
    return r.found ? tr.already(r.display_id) : tr.none;
  }
  if (cmd === "pin") {
    if (toks.length === 2) {
      const r = await setPin(env, from, toks[1]);
      if (r.ok) return tr.pinSet;
      if (r.reason === "pin_exists") return "PIN already set. Send: pin <current> <new>";
      if (r.reason === "no_account") return tr.none;
      return tr.pinInvalid;
    }
    if (toks.length === 3) {
      const r = await changePin(env, from, toks[1], toks[2]);
      return r.ok ? tr.pinChanged : (r.reason === "wrong_pin" ? tr.pinWrong : tr.pinInvalid);
    }
    return tr.enterNewPin;
  }
  if (cmd === "recover" || cmd === "recuperar") {
    if (toks.length < 3) return `${tr.enterGovId} ${tr.enterPin}`;
    const r = await initiateRecovery(env, from, toks[1], toks[2]);
    if (r.ok) return tr.recRequested;
    const map = { bad_govid: tr.recBadGovId, not_found: tr.recNotFound, no_pin: tr.recNoPin,
      wrong_pin: tr.pinWrong, number_in_use: tr.recNumberInUse };
    return map[r.reason] || tr.cancelled;
  }
  if (cmd === "complete" || cmd === "completar") {
    const r = await completeRecovery(env, from);
    return r.ok ? tr.recDone(r.display_id) : tr.recPending;
  }
  if (cmd === "cancel" || cmd === "cancelar") {
    let r = await cancelRecovery(env, from);          // as the old-number holder
    if (!r.ok) r = await cancelByNew(env, from);        // or as the requester
    return r.ok ? tr.recCancelled : tr.cancelled;
  }
  // pay|pagar|5 <code> <amount>  — one-shot (WhatsApp is stateless per message).
  if (["pay", "pagar", "5"].includes(cmd)) {
    if (toks.length < 2) return `${tr.enterPayCode}\nSend: pay <code> <amount>`;
    const code = toks[1];
    const dest = await getDestination(env, code);          // fail fast, same as USSD
    if (!dest) return tr.payUnknownDest;
    if (!(dest.verified === 1 || dest.verified === true)) return tr.payUnverified;
    if (toks.length < 3) return `${tr.enterAmount(dest.currency)}\nSend: pay ${code} <amount>`;
    const major = parseInt(toks[2], 10);
    if (!Number.isInteger(major) || major <= 0) return tr.payBadAmount;
    const r = await registerPaymentByPhone(env, from, code, toMinor(major, dest.currency), lang);
    if (!r.ok) {
      const map = { unknown_destination: tr.payUnknownDest, unverified_destination: tr.payUnverified,
        bad_amount: tr.payBadAmount, no_account: tr.none, not_found: tr.none };
      return map[r.reason] || tr.cancelled;
    }
    return tr.payInstruction(dest.rail, {
      m: major, cur: dest.currency, name: dest.name, ref: r.pay_ref,
      dest: dest.account, account_ref: dest.account_ref, dial: dest.dial_code,
    });
  }
  // report|portfolio — the citizen self-issues a shareable Education Report Card.
  if (["report", "portfolio", "cv"].includes(cmd)) {
    const s = await createShareByPhone(env, from, /* default TTL */ undefined);
    if (!s.ok) return tr.none;
    const base = env.PUBLIC_BASE_URL || "https://brasa.world";
    const exp = new Date(s.expires_at).toISOString().slice(0, 10);
    return `Your BRASA Education Report is ready to share (valid until ${exp}).\n` +
      `Show this to view & scan:\n${base}/report/view?token=${s.token}\n` +
      `QR code:\n${base}/report/qr?token=${s.token}`;
  }
  return tr.menu;
}

async function sendWhatsApp(env, to, body) {
  if (!env.WA_TOKEN || !env.WA_PHONE_ID) return; // not configured in this environment
  await fetch(`https://graph.facebook.com/v19.0/${env.WA_PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.WA_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
  });
}
