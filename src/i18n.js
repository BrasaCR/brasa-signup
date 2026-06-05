// i18n.js — canonical message strings, English only.
//
// BRASA serves 7,100+ languages, but translation happens at the SESSION layer:
// Africa's Talking detects the language before the AI sees anything, and
// WhatsApp sends locale in the webhook. The AI receives language as a parameter
// and renders the citizen's tongue. These strings are the single canonical
// (English) source; the session language still flows through for the CDR.

import { railConfig } from "./paymethods.js";

const T = {
  menu: "Welcome to BRASA.\n1. Get your GovID\n2. My GovID\n3. PIN\n4. Recover GovID\n5. Pay",
  consent: "Your GovID is your identity for life. We keep only minimal data.\n1. I agree\n2. Cancel",
  issued: id => `Your GovID: ${id}\nKeep it safe. It is your identity.`,
  already: id => `You already have a GovID: ${id}`,
  cancelled: "Cancelled.",
  none: "You do not have a GovID yet. Press 1 to get one.",
  enterNewPin: "Create a 4-6 digit PIN:",
  enterCurrentPin: "Enter your current PIN:",
  pinSet: "PIN saved. Your identity is now protected (LoA 2).",
  pinChanged: "PIN updated.",
  pinInvalid: "Invalid PIN. It must be 4 to 6 digits.",
  pinWrong: "Wrong PIN.",
  enterGovId: "Enter your GovID (BRA-...):",
  enterPin: "Enter your PIN:",
  recRequested: "Recovery requested. For your security there is a waiting period. Come back later to complete it. We notified your old number.",
  recPending: "Your recovery is still in its security wait. Try again later.",
  recReadyMenu: "Recovery ready.\n1. Complete\n2. Cancel",
  recDone: id => `Done. Your GovID ${id} is now bound to this number.`,
  recCancelled: "Recovery cancelled.",
  recNoPin: "This identity has no PIN. Recover it in person at an ABC campus.",
  recBadGovId: "Invalid GovID.",
  recNotFound: "We could not find that GovID.",
  recNumberInUse: "That number already belongs to another identity.",
  recWarn: "NOTICE: a recovery is pending on your identity.\n9. Cancel recovery",
  enterPayCode: "Enter the pay code:",
  enterAmount: (cur) => `Enter the amount in ${cur}:`,
  payBadAmount: "Invalid amount.",
  payUnknownDest: "Pay code not found.",
  payUnverified: "That destination is not verified. Cannot pay.",
  payInstruction: (rail, v) => {
    const c = railConfig(rail), disc = "BRASA only records; it never holds funds.";
    if (c.family === "key")
      return `Pay ${v.cur} ${v.m} via ${c.brand} ${c.conn} ${v.dest} (${v.name}). Ref: ${v.ref}. ${disc}`;
    if (c.family === "mpesa")
      return v.account_ref
        ? `Pay ${v.cur} ${v.m} on M-PESA: Pay Bill ${v.dest}, account ${v.account_ref} (${v.name}). Ref: ${v.ref}. ${disc}`
        : `Pay ${v.cur} ${v.m} on M-PESA: Buy Goods Till ${v.dest} (${v.name}). Ref: ${v.ref}. ${disc}`;
    const acct = v.account_ref ? `, account ${v.account_ref}` : "", dial = v.dial ? ` (${v.dial})` : "";
    return `Pay ${v.cur} ${v.m} on ${c.brand}${dial}: merchant ${v.dest}${acct} (${v.name}). Ref: ${v.ref}. ${disc}`;
  },
};

// Language is handled at the session layer; the canonical strings are English.
export const t = () => T;
