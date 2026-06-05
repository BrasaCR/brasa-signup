import test from "node:test";
import assert from "node:assert";
import { mockDB } from "./_mock.js";
import { issueGovId } from "../src/issue.js";
import { registerPayment, getPayments } from "../src/payments.js";
import { appendThread, getThread } from "../src/education.js";

const PHONE = "+50688887777";
const VERIFIED = { rail: "sinpe", account: "0000-0000", name: "Owner Account (placeholder)", currency: "CRC", verified: true };
const UNVERIFIED = { rail: "sinpe", account: "0000-0000", name: "Owner Account", currency: "CRC", verified: false };

async function citizen(env) {
  return (await issueGovId(env, PHONE, "es")).gov_id;
}

test("payment to an unverified destination is refused (hard gate)", async () => {
  const env = { DB: mockDB(), MSISDN_PEPPER: "p" };
  const gov = await citizen(env);
  const r = await registerPayment(env, gov, { amount_minor: 150000, destination: UNVERIFIED });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "unverified_destination");
  assert.equal(env.DB.payments.length, 0);
});

test("payment rejects a non-integer or non-positive amount", async () => {
  const env = { DB: mockDB(), MSISDN_PEPPER: "p" };
  const gov = await citizen(env);
  assert.equal((await registerPayment(env, gov, { amount_minor: 0, destination: VERIFIED })).reason, "bad_amount");
  assert.equal((await registerPayment(env, gov, { amount_minor: 12.5, destination: VERIFIED })).reason, "bad_amount");
});

test("verified SINPE payment registers a reference keyed on the GovID (no funds moved)", async () => {
  const env = { DB: mockDB(), MSISDN_PEPPER: "p" };
  const gov = await citizen(env);
  const r = await registerPayment(env, gov, { vertical: "food", amount_minor: 250000, destination: VERIFIED });
  assert.equal(r.ok, true);
  assert.equal(r.rail, "sinpe");
  assert.equal(r.currency, "CRC");
  assert.equal(r.amount_minor, 250000);
  assert.match(r.pay_ref, /^BRASA-BRA-/);                 // reference embeds the display handle
  assert.equal(r.instruction.to_sinpe, VERIFIED.account);
  assert.equal(env.DB.payments.length, 1);
  assert.equal(env.DB.payments[0].gov_id, gov);
  assert.equal(env.DB.payments[0].status, "registered");  // never "settled" by BRASA
  assert.ok(env.DB.cdr.some(c => c.module === "pay" && c.outcome === "registered:sinpe"));
  const list = await getPayments(env, gov);
  assert.equal(list.length, 1);
});

test("Pix (Brazil) produces a key-based instruction in BRL (no dial code)", async () => {
  const env = { DB: mockDB(), MSISDN_PEPPER: "p" };
  const gov = await citizen(env);
  const dest = { rail: "pix", account: "abc@brasa.world", account_ref: null, name: "ABC Sao Paulo", currency: "BRL", verified: true };
  const r = await registerPayment(env, gov, { amount_minor: 5000, destination: dest });
  assert.equal(r.ok, true);
  assert.equal(r.rail, "pix");
  assert.equal(r.currency, "BRL");
  assert.equal(r.instruction.to_pix, "abc@brasa.world");
  assert.equal(r.instruction.dial, undefined);
  assert.equal(env.DB.payments[0].rail, "pix");
  assert.ok(env.DB.cdr.some(c => c.outcome === "registered:pix"));
});

test("Bre-B (Colombia) produces a key-based instruction in COP (no dial code)", async () => {
  const env = { DB: mockDB(), MSISDN_PEPPER: "p" };
  const gov = await citizen(env);
  const dest = { rail: "breb", account: "@brasa", account_ref: null, name: "ABC Bogota", currency: "COP", verified: true };
  const r = await registerPayment(env, gov, { amount_minor: 50000, destination: dest });
  assert.equal(r.ok, true);
  assert.equal(r.rail, "breb");
  assert.equal(r.currency, "COP");
  assert.equal(r.instruction.to_breb, "@brasa");
  assert.equal(r.instruction.dial, undefined);
  assert.equal(env.DB.payments[0].rail, "breb");
  assert.ok(env.DB.cdr.some(c => c.outcome === "registered:breb"));
});

test("Yape (Peru) produces a number-based instruction in PEN (no dial code)", async () => {
  const env = { DB: mockDB(), MSISDN_PEPPER: "p" };
  const gov = await citizen(env);
  const dest = { rail: "yape", account: "+51987654321", account_ref: null, name: "ABC Lima", currency: "PEN", verified: true };
  const r = await registerPayment(env, gov, { amount_minor: 5000, destination: dest });
  assert.equal(r.ok, true);
  assert.equal(r.rail, "yape");
  assert.equal(r.currency, "PEN");
  assert.equal(r.instruction.to_yape, "+51987654321");
  assert.equal(r.instruction.dial, undefined);
  assert.equal(env.DB.payments[0].rail, "yape");
  assert.ok(env.DB.cdr.some(c => c.outcome === "registered:yape"));
});

test("Transferencias 3.0 (Argentina) produces an alias-based instruction in ARS (no dial code)", async () => {
  const env = { DB: mockDB(), MSISDN_PEPPER: "p" };
  const gov = await citizen(env);
  const dest = { rail: "transfers3", account: "brasa.abc.ar", account_ref: null, name: "ABC Buenos Aires", currency: "ARS", verified: true };
  const r = await registerPayment(env, gov, { amount_minor: 5000, destination: dest });
  assert.equal(r.ok, true);
  assert.equal(r.rail, "transfers3");
  assert.equal(r.currency, "ARS");
  assert.equal(r.instruction.to_alias, "brasa.abc.ar");
  assert.equal(r.instruction.dial, undefined);
  assert.equal(env.DB.payments[0].rail, "transfers3");
  assert.ok(env.DB.cdr.some(c => c.outcome === "registered:transfers3"));
});

test("Toke (Uruguay) produces a code-based instruction in UYU (no dial code)", async () => {
  const env = { DB: mockDB(), MSISDN_PEPPER: "p" };
  const gov = await citizen(env);
  const dest = { rail: "toke", account: "TOKE-ABC-UY", account_ref: null, name: "ABC Montevideo", currency: "UYU", verified: true };
  const r = await registerPayment(env, gov, { amount_minor: 5000, destination: dest });
  assert.equal(r.ok, true);
  assert.equal(r.rail, "toke");
  assert.equal(r.currency, "UYU");
  assert.equal(r.instruction.to_toke, "TOKE-ABC-UY");
  assert.equal(r.instruction.dial, undefined);
  assert.equal(env.DB.payments[0].rail, "toke");
  assert.ok(env.DB.cdr.some(c => c.outcome === "registered:toke"));
});

test("SPEI (Mexico) produces a CLABE-based instruction in MXN (no dial code)", async () => {
  const env = { DB: mockDB(), MSISDN_PEPPER: "p" };
  const gov = await citizen(env);
  const dest = { rail: "spei", account: "012180001234567895", account_ref: null, name: "ABC Ciudad de Mexico", currency: "MXN", verified: true };
  const r = await registerPayment(env, gov, { amount_minor: 50000, destination: dest });
  assert.equal(r.ok, true);
  assert.equal(r.rail, "spei");
  assert.equal(r.currency, "MXN");
  assert.equal(r.instruction.to_clabe, "012180001234567895");
  assert.equal(r.instruction.dial, undefined);
  assert.equal(env.DB.payments[0].rail, "spei");
  assert.ok(env.DB.cdr.some(c => c.outcome === "registered:spei"));
});

test("UPI (India) produces a VPA-based instruction in INR (no dial code)", async () => {
  const env = { DB: mockDB(), MSISDN_PEPPER: "p" };
  const gov = await citizen(env);
  const dest = { rail: "upi", account: "brasa@upi", account_ref: null, name: "ABC Mumbai", currency: "INR", verified: true };
  const r = await registerPayment(env, gov, { amount_minor: 50000, destination: dest });
  assert.equal(r.ok, true);
  assert.equal(r.rail, "upi");
  assert.equal(r.currency, "INR");
  assert.equal(r.instruction.to_vpa, "brasa@upi");
  assert.equal(r.instruction.dial, undefined);
  assert.equal(env.DB.payments[0].rail, "upi");
  assert.ok(env.DB.cdr.some(c => c.outcome === "registered:upi"));
});

test("verified M-Pesa Paybill payment produces an M-Pesa instruction", async () => {
  const env = { DB: mockDB(), MSISDN_PEPPER: "p" };
  const gov = await citizen(env);
  const dest = { rail: "mpesa", account: "400200", account_ref: "BRASA-EDU", name: "ABC Nairobi", currency: "KES", verified: true };
  const r = await registerPayment(env, gov, { amount_minor: 50000, destination: dest });
  assert.equal(r.ok, true);
  assert.equal(r.rail, "mpesa");
  assert.equal(r.currency, "KES");
  assert.equal(r.instruction.method, "paybill");
  assert.equal(r.instruction.paybill, "400200");
  assert.equal(r.instruction.account, "BRASA-EDU");
  assert.equal(env.DB.payments[0].rail, "mpesa");
  assert.ok(env.DB.cdr.some(c => c.outcome === "registered:mpesa"));
});

test("M-Pesa Till (no account ref) produces a Buy-Goods instruction", async () => {
  const env = { DB: mockDB(), MSISDN_PEPPER: "p" };
  const gov = await citizen(env);
  const dest = { rail: "mpesa", account: "832909", account_ref: null, name: "Watamu Kiosk", currency: "KES", verified: true };
  const r = await registerPayment(env, gov, { amount_minor: 20000, destination: dest });
  assert.equal(r.ok, true);
  assert.equal(r.instruction.method, "till");
  assert.equal(r.instruction.till, "832909");
});

test("MTN MoMo (Rwanda) produces a merchant instruction in RWF with dial code", async () => {
  const env = { DB: mockDB(), MSISDN_PEPPER: "p" };
  const gov = await citizen(env);
  const dest = { rail: "momo", account: "123456", account_ref: null, dial_code: "*182*8*1#", name: "ABC Kigali", currency: "RWF", verified: true };
  const r = await registerPayment(env, gov, { amount_minor: 5000, destination: dest });
  assert.equal(r.ok, true);
  assert.equal(r.rail, "momo");
  assert.equal(r.currency, "RWF");
  assert.equal(r.instruction.method, "merchant");
  assert.equal(r.instruction.code, "123456");
  assert.equal(r.instruction.dial, "*182*8*1#");
  assert.equal(env.DB.payments[0].rail, "momo");
  assert.ok(env.DB.cdr.some(c => c.outcome === "registered:momo"));
});

test("Airtel Money produces a merchant instruction carrying the country dial code", async () => {
  const env = { DB: mockDB(), MSISDN_PEPPER: "p" };
  const gov = await citizen(env);
  const dest = { rail: "airtel", account: "556677", account_ref: null, dial_code: "*334#", name: "ABC Kisumu", currency: "KES", verified: true };
  const r = await registerPayment(env, gov, { amount_minor: 80000, destination: dest });
  assert.equal(r.ok, true);
  assert.equal(r.rail, "airtel");
  assert.equal(r.currency, "KES");
  assert.equal(r.instruction.method, "merchant");
  assert.equal(r.instruction.code, "556677");
  assert.equal(r.instruction.dial, "*334#");
  assert.equal(env.DB.payments[0].rail, "airtel");
  assert.ok(env.DB.cdr.some(c => c.outcome === "registered:airtel"));
});

test("Orange Money produces a merchant instruction in XOF with dial code", async () => {
  const env = { DB: mockDB(), MSISDN_PEPPER: "p" };
  const gov = await citizen(env);
  const dest = { rail: "orange", account: "778899", account_ref: null, dial_code: "#144#", name: "ABC Dakar", currency: "XOF", verified: true };
  const r = await registerPayment(env, gov, { amount_minor: 10000, destination: dest });
  assert.equal(r.ok, true);
  assert.equal(r.rail, "orange");
  assert.equal(r.currency, "XOF");
  assert.equal(r.instruction.method, "merchant");
  assert.equal(r.instruction.code, "778899");
  assert.equal(r.instruction.dial, "#144#");
  assert.equal(env.DB.payments[0].rail, "orange");
  assert.ok(env.DB.cdr.some(c => c.outcome === "registered:orange"));
});

test("Tigo Pesa produces a merchant instruction in TZS with dial code", async () => {
  const env = { DB: mockDB(), MSISDN_PEPPER: "p" };
  const gov = await citizen(env);
  const dest = { rail: "tigo", account: "112233", account_ref: null, dial_code: "*150*01#", name: "ABC Dar", currency: "TZS", verified: true };
  const r = await registerPayment(env, gov, { amount_minor: 5000, destination: dest });
  assert.equal(r.ok, true);
  assert.equal(r.rail, "tigo");
  assert.equal(r.currency, "TZS");
  assert.equal(r.instruction.method, "merchant");
  assert.equal(r.instruction.code, "112233");
  assert.equal(r.instruction.dial, "*150*01#");
  assert.equal(env.DB.payments[0].rail, "tigo");
  assert.ok(env.DB.cdr.some(c => c.outcome === "registered:tigo"));
});

test("Vodafone Cash produces a merchant instruction in EGP with dial code", async () => {
  const env = { DB: mockDB(), MSISDN_PEPPER: "p" };
  const gov = await citizen(env);
  const dest = { rail: "vodafone", account: "445566", account_ref: null, dial_code: "*9#", name: "ABC Cairo", currency: "EGP", verified: true };
  const r = await registerPayment(env, gov, { amount_minor: 25000, destination: dest });
  assert.equal(r.ok, true);
  assert.equal(r.rail, "vodafone");
  assert.equal(r.currency, "EGP");
  assert.equal(r.instruction.method, "merchant");
  assert.equal(r.instruction.code, "445566");
  assert.equal(r.instruction.dial, "*9#");
  assert.equal(env.DB.payments[0].rail, "vodafone");
  assert.ok(env.DB.cdr.some(c => c.outcome === "registered:vodafone"));
});

test("Equitel produces a merchant instruction in KES with paybill account", async () => {
  const env = { DB: mockDB(), MSISDN_PEPPER: "p" };
  const gov = await citizen(env);
  const dest = { rail: "equitel", account: "247247", account_ref: "BRASA-KE", dial_code: "*247#", name: "ABC Nairobi Equity", currency: "KES", verified: true };
  const r = await registerPayment(env, gov, { amount_minor: 90000, destination: dest });
  assert.equal(r.ok, true);
  assert.equal(r.rail, "equitel");
  assert.equal(r.currency, "KES");
  assert.equal(r.instruction.method, "merchant");
  assert.equal(r.instruction.code, "247247");
  assert.equal(r.instruction.account, "BRASA-KE");
  assert.equal(r.instruction.dial, "*247#");
  assert.equal(env.DB.payments[0].rail, "equitel");
  assert.ok(env.DB.cdr.some(c => c.outcome === "registered:equitel"));
});

test("T-Kash produces a merchant instruction in KES with dial code", async () => {
  const env = { DB: mockDB(), MSISDN_PEPPER: "p" };
  const gov = await citizen(env);
  const dest = { rail: "tkash", account: "303030", account_ref: null, dial_code: "*460#", name: "ABC Mombasa Telkom", currency: "KES", verified: true };
  const r = await registerPayment(env, gov, { amount_minor: 40000, destination: dest });
  assert.equal(r.ok, true);
  assert.equal(r.rail, "tkash");
  assert.equal(r.currency, "KES");
  assert.equal(r.instruction.method, "merchant");
  assert.equal(r.instruction.code, "303030");
  assert.equal(r.instruction.dial, "*460#");
  assert.equal(env.DB.payments[0].rail, "tkash");
  assert.ok(env.DB.cdr.some(c => c.outcome === "registered:tkash"));
});

test("bKash (Bangladesh) produces a merchant instruction in BDT with dial code", async () => {
  const env = { DB: mockDB(), MSISDN_PEPPER: "p" };
  const gov = await citizen(env);
  const dest = { rail: "bkash", account: "01700000000", account_ref: null, dial_code: "*247#", name: "ABC Dhaka", currency: "BDT", verified: true };
  const r = await registerPayment(env, gov, { amount_minor: 50000, destination: dest });
  assert.equal(r.ok, true);
  assert.equal(r.rail, "bkash");
  assert.equal(r.currency, "BDT");
  assert.equal(r.instruction.method, "merchant");
  assert.equal(r.instruction.code, "01700000000");
  assert.equal(r.instruction.dial, "*247#");
  assert.equal(env.DB.payments[0].rail, "bkash");
  assert.ok(env.DB.cdr.some(c => c.outcome === "registered:bkash"));
});

test("JazzCash (Pakistan) produces a merchant instruction in PKR with dial code", async () => {
  const env = { DB: mockDB(), MSISDN_PEPPER: "p" };
  const gov = await citizen(env);
  const dest = { rail: "jazzcash", account: "03001234567", account_ref: null, dial_code: "*786#", name: "ABC Karachi", currency: "PKR", verified: true };
  const r = await registerPayment(env, gov, { amount_minor: 50000, destination: dest });
  assert.equal(r.ok, true);
  assert.equal(r.rail, "jazzcash");
  assert.equal(r.currency, "PKR");
  assert.equal(r.instruction.method, "merchant");
  assert.equal(r.instruction.code, "03001234567");
  assert.equal(r.instruction.dial, "*786#");
  assert.equal(env.DB.payments[0].rail, "jazzcash");
  assert.ok(env.DB.cdr.some(c => c.outcome === "registered:jazzcash"));
});

test("education thread appends entries and reads them in order", async () => {
  const env = { DB: mockDB(), MSISDN_PEPPER: "p" };
  const gov = await citizen(env);
  assert.equal((await appendThread(env, gov, { kind: "referral", provider: "Khan Academy", subject: "algebra" })).ok, true);
  assert.equal((await appendThread(env, gov, { kind: "native_lesson", subject: "SINPE basics" })).ok, true);
  assert.equal((await appendThread(env, gov, { kind: "bogus" })).reason, "bad_kind");

  const thread = await getThread(env, gov);
  assert.equal(thread.length, 2);
  assert.equal(thread[0].kind, "referral");
  assert.equal(thread[1].kind, "native_lesson");
  assert.ok(env.DB.cdr.some(c => c.module === "learning" && c.outcome === "referral"));
});

test("thread append requires an existing GovID", async () => {
  const env = { DB: mockDB(), MSISDN_PEPPER: "p" };
  const r = await appendThread(env, "no-such-gov", { kind: "referral" });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "not_found");
});
