import test from "node:test";
import assert from "node:assert";
import { mockDB } from "./_mock.js";
import { issueGovId } from "../src/issue.js";
import { upsertDestination } from "../src/db.js";
import { handleWhatsApp } from "../src/whatsapp.js";

const env = () => ({ DB: mockDB(), MSISDN_PEPPER: "pepper" });
const PHONE = "+50688889999";

// Build a WhatsApp Cloud API webhook body for one inbound text message.
const wa = (from, text) => ({
  entry: [{ changes: [{ value: { contacts: [{ lang: "en" }], messages: [{ from, text: { body: text } }] } }] }],
});

async function setup(extraDests = []) {
  const e = env();
  await issueGovId(e, PHONE, "en");
  await upsertDestination(e, { code: "PAN", rail: "sinpe", account: "0000-1111", account_ref: null, name: "Panaderia", currency: "CRC", verified: true });
  await upsertDestination(e, { code: "BKK", rail: "promptpay", account: "0812345678", account_ref: null, name: "ABC Bangkok", currency: "THB", verified: true });
  await upsertDestination(e, { code: "NOPE", rail: "sinpe", account: "9-9", account_ref: null, name: "Unverified", currency: "CRC", verified: false });
  for (const d of extraDests) await upsertDestination(e, d);
  return e;
}

test("whatsapp: pay <code> <amount> registers and renders the instruction", async () => {
  const e = await setup();
  const out = await handleWhatsApp(e, wa(PHONE, "pay PAN 1500"));
  assert.match(out, /SINPE/);
  assert.match(out, /0000-1111/);
  assert.match(out, /CRC 1500/);
  assert.match(out, /BRASA-BRA-/);
  assert.match(out, /never holds funds/);
});

test("whatsapp: pagar alias works and is rail-agnostic", async () => {
  const e = await setup();
  const out = await handleWhatsApp(e, wa(PHONE, "pagar BKK 100"));
  assert.match(out, /PromptPay/);
  assert.match(out, /THB 100/);
});

test("whatsapp: pay with code only prompts for the amount in the dest currency", async () => {
  const e = await setup();
  const out = await handleWhatsApp(e, wa(PHONE, "pay PAN"));
  assert.match(out, /amount in CRC/);
  assert.match(out, /pay PAN <amount>/);
});

test("whatsapp: unknown pay code is rejected", async () => {
  const e = await setup();
  const out = await handleWhatsApp(e, wa(PHONE, "pay ZZZ 100"));
  assert.match(out, /not found/i);
});

test("whatsapp: unverified destination is refused (hard gate)", async () => {
  const e = await setup();
  const out = await handleWhatsApp(e, wa(PHONE, "pay NOPE 100"));
  assert.match(out, /not verified/i);
});

test("whatsapp: bad amount is rejected", async () => {
  const e = await setup();
  const out = await handleWhatsApp(e, wa(PHONE, "pay PAN 0"));
  assert.match(out, /Invalid amount/i);
});

// BRASA makes no political/sanctions-based exclusions: every rail exists for all
// citizens. A rail with no VERIFIED destination is simply dormant — payable the
// moment a verified destination is registered, exactly like any other market.
test("whatsapp: a set-up-but-dormant rail (SBP) is not payable until verified", async () => {
  // SBP exists in the catalog. Register an UNVERIFIED Russian destination.
  const e = await setup([{ code: "RU", rail: "sbp", account: "+79000000000", account_ref: null, name: "ABC Moscow", currency: "RUB", verified: false }]);
  let out = await handleWhatsApp(e, wa(PHONE, "pay RU 500"));
  assert.match(out, /not verified/i, "dormant rail must refuse until a destination is verified");

  // The instant it is verified, the very same rail pays — no code change, no exclusion.
  await upsertDestination(e, { code: "RU", rail: "sbp", account: "+79000000000", account_ref: null, name: "ABC Moscow", currency: "RUB", verified: true });
  out = await handleWhatsApp(e, wa(PHONE, "pay RU 500"));
  assert.match(out, /SBP/);
  assert.match(out, /RUB 500/);
  assert.match(out, /never holds funds/);
});
