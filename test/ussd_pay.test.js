import test from "node:test";
import assert from "node:assert";
import { mockDB } from "./_mock.js";
import { issueGovId } from "../src/issue.js";
import { registerPaymentByPhone } from "../src/payments.js";
import { upsertDestination } from "../src/db.js";
import { handleUssd } from "../src/ussd.js";

const PHONE = "+50688887777";
const form = obj => new Map(Object.entries(obj));
const newEnv = () => ({ DB: mockDB(), MSISDN_PEPPER: "test-pepper" });

const SINPE = { code: "PANADERIA", rail: "sinpe", country: "CR", account: "0000-1111", account_ref: null, name: "Panaderia Lindora", currency: "CRC", verified: true, vertical: "food", segment: "bakery" };
const PIX = { code: "SAOPAULO", rail: "pix", country: "BR", account: "abc@brasa.world", account_ref: null, name: "ABC Sao Paulo", currency: "BRL", verified: true, vertical: "education", segment: "campus" };
const BREB = { code: "BOGOTA", rail: "breb", country: "CO", account: "@brasa", account_ref: null, name: "ABC Bogota", currency: "COP", verified: true, vertical: "education", segment: "campus" };
const YAPE = { code: "LIMA", rail: "yape", country: "PE", account: "+51987654321", account_ref: null, name: "ABC Lima", currency: "PEN", verified: true, vertical: "education", segment: "campus" };
const T30 = { code: "BSAS", rail: "transfers3", country: "AR", account: "brasa.abc.ar", account_ref: null, name: "ABC Buenos Aires", currency: "ARS", verified: true, vertical: "education", segment: "campus" };
const TOKE = { code: "MVD", rail: "toke", country: "UY", account: "TOKE-ABC-UY", account_ref: null, name: "ABC Montevideo", currency: "UYU", verified: true, vertical: "education", segment: "campus" };
const SPEI = { code: "CDMX", rail: "spei", country: "MX", account: "012180001234567895", account_ref: null, name: "ABC Ciudad de Mexico", currency: "MXN", verified: true, vertical: "education", segment: "campus" };
const UPI = { code: "MUMBAI", rail: "upi", country: "IN", account: "brasa@upi", account_ref: null, name: "ABC Mumbai", currency: "INR", verified: true, vertical: "education", segment: "campus" };
const MPESA = { code: "ABCNAI", rail: "mpesa", country: "KE", account: "400200", account_ref: "BRASA-EDU", name: "ABC Nairobi", currency: "KES", verified: true, vertical: "education", segment: "campus" };
const MOMO = { code: "KIGALI", rail: "momo", country: "RW", account: "123456", account_ref: null, dial_code: "*182*8*1#", name: "ABC Kigali", currency: "RWF", verified: true, vertical: "education", segment: "campus" };
const AIRTEL = { code: "KISUMU", rail: "airtel", country: "KE", account: "556677", account_ref: null, dial_code: "*334#", name: "ABC Kisumu", currency: "KES", verified: true, vertical: "education", segment: "campus" };
const ORANGE = { code: "DAKAR", rail: "orange", country: "SN", account: "778899", account_ref: null, dial_code: "#144#", name: "ABC Dakar", currency: "XOF", verified: true, vertical: "education", segment: "campus" };
const TIGO = { code: "DARES", rail: "tigo", country: "TZ", account: "112233", account_ref: null, dial_code: "*150*01#", name: "ABC Dar", currency: "TZS", verified: true, vertical: "education", segment: "campus" };
const VODAFONE = { code: "CAIRO", rail: "vodafone", country: "EG", account: "445566", account_ref: null, dial_code: "*9#", name: "ABC Cairo", currency: "EGP", verified: true, vertical: "education", segment: "campus" };
const EQUITEL = { code: "EQNBO", rail: "equitel", country: "KE", account: "247247", account_ref: "BRASA-KE", dial_code: "*247#", name: "ABC Nairobi Equity", currency: "KES", verified: true, vertical: "education", segment: "campus" };
const TKASH = { code: "TKMSA", rail: "tkash", country: "KE", account: "303030", account_ref: null, dial_code: "*460#", name: "ABC Mombasa Telkom", currency: "KES", verified: true, vertical: "education", segment: "campus" };
const BKASH = { code: "DHAKA", rail: "bkash", country: "BD", account: "01700000000", account_ref: null, dial_code: "*247#", name: "ABC Dhaka", currency: "BDT", verified: true, vertical: "education", segment: "campus" };
const JAZZCASH = { code: "KARACHI", rail: "jazzcash", country: "PK", account: "03001234567", account_ref: null, dial_code: "*786#", name: "ABC Karachi", currency: "PKR", verified: true, vertical: "education", segment: "campus" };

async function seed(env, dest) {
  await issueGovId(env, PHONE, "es");
  await upsertDestination(env, dest);
}

test("registerPaymentByPhone records a reference to a verified destination", async () => {
  const env = newEnv();
  await seed(env, SINPE);
  const r = await registerPaymentByPhone(env, PHONE, "PANADERIA", 150000, "es");
  assert.equal(r.ok, true);
  assert.equal(r.rail, "sinpe");
  assert.equal(r.instruction.to_sinpe, "0000-1111");
  assert.equal(env.DB.payments.length, 1);
  assert.equal(env.DB.payments[0].amount_minor, 150000);
});

test("registerPaymentByPhone refuses an unverified destination", async () => {
  const env = newEnv();
  await seed(env, { ...SINPE, verified: false });
  const r = await registerPaymentByPhone(env, PHONE, "PANADERIA", 150000, "es");
  assert.equal(r.ok, false);
  assert.equal(r.reason, "unverified_destination");
});

test("registerPaymentByPhone reports an unknown pay code", async () => {
  const env = newEnv();
  await issueGovId(env, PHONE, "es");
  assert.equal((await registerPaymentByPhone(env, PHONE, "NOPE", 150000, "es")).reason, "unknown_destination");
});

test("USSD SINPE flow: code then amount returns SINPE instructions", async () => {
  const env = newEnv();
  await seed(env, SINPE);
  assert.match(await handleUssd(env, form({ phoneNumber: PHONE, text: "5" })), /CON .*pago|CON .*pay code/i);
  assert.match(await handleUssd(env, form({ phoneNumber: PHONE, text: "5*PANADERIA" })), /CON .*CRC/);
  const out = await handleUssd(env, form({ phoneNumber: PHONE, text: "5*PANADERIA*1500" }));
  assert.ok(out.startsWith("END "));
  assert.match(out, /SINPE/);
  assert.match(out, /0000-1111/);
  assert.match(out, /CRC 1500/);
  assert.match(out, /BRASA-BRA-/);
  assert.equal(env.DB.payments[0].amount_minor, 150000);
});

test("USSD M-Pesa flow: prompts in KES and returns a Pay Bill instruction", async () => {
  const env = newEnv();
  await seed(env, MPESA);
  assert.match(await handleUssd(env, form({ phoneNumber: PHONE, text: "5*ABCNAI" })), /CON .*KES/);
  const out = await handleUssd(env, form({ phoneNumber: PHONE, text: "5*ABCNAI*1500" }));
  assert.ok(out.startsWith("END "));
  assert.match(out, /M-PESA/);
  assert.match(out, /Pay Bill 400200/);
  assert.match(out, /BRASA-EDU/);
  assert.match(out, /KES 1500/);
  assert.equal(env.DB.payments[0].rail, "mpesa");
  assert.equal(env.DB.payments[0].currency, "KES");
});

test("USSD MoMo flow: prompts in RWF and returns a merchant instruction", async () => {
  const env = newEnv();
  await seed(env, MOMO);
  assert.match(await handleUssd(env, form({ phoneNumber: PHONE, text: "5*KIGALI" })), /CON .*RWF/);
  const out = await handleUssd(env, form({ phoneNumber: PHONE, text: "5*KIGALI*5000" }));
  assert.ok(out.startsWith("END "));
  assert.match(out, /MoMo/);
  assert.match(out, /123456/);
  assert.match(out, /\*182\*8\*1#/);
  assert.match(out, /RWF 5000/);
  assert.equal(env.DB.payments[0].rail, "momo");
  assert.equal(env.DB.payments[0].currency, "RWF");
});

test("USSD Airtel flow: returns an Airtel Money merchant instruction with dial code", async () => {
  const env = newEnv();
  await seed(env, AIRTEL);
  assert.match(await handleUssd(env, form({ phoneNumber: PHONE, text: "5*KISUMU" })), /CON .*KES/);
  const out = await handleUssd(env, form({ phoneNumber: PHONE, text: "5*KISUMU*1500" }));
  assert.ok(out.startsWith("END "));
  assert.match(out, /Airtel Money/);
  assert.match(out, /556677/);
  assert.match(out, /\*334#/);
  assert.match(out, /KES 1500/);
  assert.equal(env.DB.payments[0].rail, "airtel");
  assert.equal(env.DB.payments[0].currency, "KES");
});

test("USSD Orange flow: returns an Orange Money merchant instruction in XOF", async () => {
  const env = newEnv();
  await seed(env, ORANGE);
  assert.match(await handleUssd(env, form({ phoneNumber: PHONE, text: "5*DAKAR" })), /CON .*XOF/);
  const out = await handleUssd(env, form({ phoneNumber: PHONE, text: "5*DAKAR*5000" }));
  assert.ok(out.startsWith("END "));
  assert.match(out, /Orange Money/);
  assert.match(out, /778899/);
  assert.match(out, /#144#/);
  assert.match(out, /XOF 5000/);
  assert.equal(env.DB.payments[0].rail, "orange");
  assert.equal(env.DB.payments[0].currency, "XOF");
});

test("USSD Tigo Pesa flow: returns a Tigo Pesa merchant instruction in TZS", async () => {
  const env = newEnv();
  await seed(env, TIGO);
  assert.match(await handleUssd(env, form({ phoneNumber: PHONE, text: "5*DARES" })), /CON .*TZS/);
  const out = await handleUssd(env, form({ phoneNumber: PHONE, text: "5*DARES*5000" }));
  assert.ok(out.startsWith("END "));
  assert.match(out, /Tigo Pesa/);
  assert.match(out, /112233/);
  assert.match(out, /\*150\*01#/);
  assert.match(out, /TZS 5000/);
  assert.equal(env.DB.payments[0].rail, "tigo");
  assert.equal(env.DB.payments[0].currency, "TZS");
});

test("USSD Vodafone Cash flow: returns a Vodafone Cash merchant instruction in EGP", async () => {
  const env = newEnv();
  await seed(env, VODAFONE);
  assert.match(await handleUssd(env, form({ phoneNumber: PHONE, text: "5*CAIRO" })), /CON .*EGP/);
  const out = await handleUssd(env, form({ phoneNumber: PHONE, text: "5*CAIRO*200" }));
  assert.ok(out.startsWith("END "));
  assert.match(out, /Vodafone Cash/);
  assert.match(out, /445566/);
  assert.match(out, /\*9#/);
  assert.match(out, /EGP 200/);
  assert.equal(env.DB.payments[0].rail, "vodafone");
  assert.equal(env.DB.payments[0].currency, "EGP");
});

test("USSD Equitel flow: returns an Equitel merchant instruction with paybill account", async () => {
  const env = newEnv();
  await seed(env, EQUITEL);
  assert.match(await handleUssd(env, form({ phoneNumber: PHONE, text: "5*EQNBO" })), /CON .*KES/);
  const out = await handleUssd(env, form({ phoneNumber: PHONE, text: "5*EQNBO*3000" }));
  assert.ok(out.startsWith("END "));
  assert.match(out, /Equitel/);
  assert.match(out, /247247/);
  assert.match(out, /BRASA-KE/);
  assert.match(out, /\*247#/);
  assert.match(out, /KES 3000/);
  assert.equal(env.DB.payments[0].rail, "equitel");
  assert.equal(env.DB.payments[0].currency, "KES");
});

test("USSD T-Kash flow: returns a T-Kash merchant instruction in KES", async () => {
  const env = newEnv();
  await seed(env, TKASH);
  assert.match(await handleUssd(env, form({ phoneNumber: PHONE, text: "5*TKMSA" })), /CON .*KES/);
  const out = await handleUssd(env, form({ phoneNumber: PHONE, text: "5*TKMSA*1200" }));
  assert.ok(out.startsWith("END "));
  assert.match(out, /T-Kash/);
  assert.match(out, /303030/);
  assert.match(out, /\*460#/);
  assert.match(out, /KES 1200/);
  assert.equal(env.DB.payments[0].rail, "tkash");
  assert.equal(env.DB.payments[0].currency, "KES");
});

test("USSD Pix flow: returns a Pix key instruction in BRL (no dial code)", async () => {
  const env = newEnv();
  await seed(env, PIX);
  assert.match(await handleUssd(env, form({ phoneNumber: PHONE, text: "5*SAOPAULO" })), /CON .*BRL/);
  const out = await handleUssd(env, form({ phoneNumber: PHONE, text: "5*SAOPAULO*100" }));
  assert.ok(out.startsWith("END "));
  assert.match(out, /Pix/);
  assert.match(out, /abc@brasa\.world/);
  assert.match(out, /BRL 100/);
  assert.doesNotMatch(out, /#|\*\d/); // no USSD dial code for Pix
  assert.equal(env.DB.payments[0].rail, "pix");
  assert.equal(env.DB.payments[0].currency, "BRL");
});

test("USSD Bre-B flow: returns a Bre-B key instruction in COP (no dial code)", async () => {
  const env = newEnv();
  await seed(env, BREB);
  assert.match(await handleUssd(env, form({ phoneNumber: PHONE, text: "5*BOGOTA" })), /CON .*COP/);
  const out = await handleUssd(env, form({ phoneNumber: PHONE, text: "5*BOGOTA*30000" }));
  assert.ok(out.startsWith("END "));
  assert.match(out, /Bre-B/);
  assert.match(out, /@brasa/);
  assert.match(out, /COP 30000/);
  assert.doesNotMatch(out, /#|\*\d/); // no USSD dial code for Bre-B
  assert.equal(env.DB.payments[0].rail, "breb");
  assert.equal(env.DB.payments[0].currency, "COP");
});

test("USSD Yape flow: returns a Yape number instruction in PEN (no dial code)", async () => {
  const env = newEnv();
  await seed(env, YAPE);
  assert.match(await handleUssd(env, form({ phoneNumber: PHONE, text: "5*LIMA" })), /CON .*PEN/);
  const out = await handleUssd(env, form({ phoneNumber: PHONE, text: "5*LIMA*50" }));
  assert.ok(out.startsWith("END "));
  assert.match(out, /Yape/);
  assert.match(out, /\+51987654321/);
  assert.match(out, /PEN 50/);
  assert.equal(env.DB.payments[0].rail, "yape");
  assert.equal(env.DB.payments[0].currency, "PEN");
  assert.equal(env.DB.payments[0].amount_minor, 5000); // PEN soles -> centimos
});

test("USSD Transferencias 3.0 flow: returns an alias instruction in ARS (no dial code)", async () => {
  const env = newEnv();
  await seed(env, T30);
  assert.match(await handleUssd(env, form({ phoneNumber: PHONE, text: "5*BSAS" })), /CON .*ARS/);
  const out = await handleUssd(env, form({ phoneNumber: PHONE, text: "5*BSAS*4500" }));
  assert.ok(out.startsWith("END "));
  assert.match(out, /Transferencias 3\.0/);
  assert.match(out, /brasa\.abc\.ar/);
  assert.match(out, /ARS 4500/);
  assert.equal(env.DB.payments[0].rail, "transfers3");
  assert.equal(env.DB.payments[0].currency, "ARS");
});

test("USSD Toke flow: returns a Toke code instruction in UYU (no dial code)", async () => {
  const env = newEnv();
  await seed(env, TOKE);
  assert.match(await handleUssd(env, form({ phoneNumber: PHONE, text: "5*MVD" })), /CON .*UYU/);
  const out = await handleUssd(env, form({ phoneNumber: PHONE, text: "5*MVD*900" }));
  assert.ok(out.startsWith("END "));
  assert.match(out, /Toke/);
  assert.match(out, /TOKE-ABC-UY/);
  assert.match(out, /UYU 900/);
  assert.equal(env.DB.payments[0].rail, "toke");
  assert.equal(env.DB.payments[0].currency, "UYU");
});

test("USSD SPEI flow: returns a CLABE instruction in MXN (no dial code)", async () => {
  const env = newEnv();
  await seed(env, SPEI);
  assert.match(await handleUssd(env, form({ phoneNumber: PHONE, text: "5*CDMX" })), /CON .*MXN/);
  const out = await handleUssd(env, form({ phoneNumber: PHONE, text: "5*CDMX*500" }));
  assert.ok(out.startsWith("END "));
  assert.match(out, /SPEI/);
  assert.match(out, /012180001234567895/);
  assert.match(out, /MXN 500/);
  assert.equal(env.DB.payments[0].rail, "spei");
  assert.equal(env.DB.payments[0].currency, "MXN");
  assert.equal(env.DB.payments[0].amount_minor, 50000); // MXN pesos -> centavos
});

test("USSD UPI flow: returns a VPA instruction in INR (no dial code)", async () => {
  const env = newEnv();
  await seed(env, UPI);
  assert.match(await handleUssd(env, form({ phoneNumber: PHONE, text: "5*MUMBAI" })), /CON .*INR/);
  const out = await handleUssd(env, form({ phoneNumber: PHONE, text: "5*MUMBAI*500" }));
  assert.ok(out.startsWith("END "));
  assert.match(out, /UPI/);
  assert.match(out, /brasa@upi/);
  assert.match(out, /INR 500/);
  assert.equal(env.DB.payments[0].rail, "upi");
  assert.equal(env.DB.payments[0].currency, "INR");
  assert.equal(env.DB.payments[0].amount_minor, 50000); // INR rupees -> paise
});

test("USSD bKash flow: returns a bKash merchant instruction in BDT", async () => {
  const env = newEnv();
  await seed(env, BKASH);
  assert.match(await handleUssd(env, form({ phoneNumber: PHONE, text: "5*DHAKA" })), /CON .*BDT/);
  const out = await handleUssd(env, form({ phoneNumber: PHONE, text: "5*DHAKA*800" }));
  assert.ok(out.startsWith("END "));
  assert.match(out, /bKash/);
  assert.match(out, /01700000000/);
  assert.match(out, /\*247#/);
  assert.match(out, /BDT 800/);
  assert.equal(env.DB.payments[0].rail, "bkash");
  assert.equal(env.DB.payments[0].currency, "BDT");
});

test("USSD JazzCash flow: returns a JazzCash merchant instruction in PKR", async () => {
  const env = newEnv();
  await seed(env, JAZZCASH);
  assert.match(await handleUssd(env, form({ phoneNumber: PHONE, text: "5*KARACHI" })), /CON .*PKR/);
  const out = await handleUssd(env, form({ phoneNumber: PHONE, text: "5*KARACHI*1500" }));
  assert.ok(out.startsWith("END "));
  assert.match(out, /JazzCash/);
  assert.match(out, /03001234567/);
  assert.match(out, /\*786#/);
  assert.match(out, /PKR 1500/);
  assert.equal(env.DB.payments[0].rail, "jazzcash");
  assert.equal(env.DB.payments[0].currency, "PKR");
});

test("USSD pay flow: unverified destination is blocked", async () => {
  const env = newEnv();
  await seed(env, { ...MPESA, verified: false });
  const out = await handleUssd(env, form({ phoneNumber: PHONE, text: "5*ABCNAI" }));
  assert.match(out, /END .*no esta verificado|END .*not verified/i);
  assert.equal(env.DB.payments.length, 0);
});

test("USSD pay flow: needs a GovID first", async () => {
  const env = newEnv();
  const out = await handleUssd(env, form({ phoneNumber: PHONE, text: "5" }));
  assert.match(out, /END .*GovID|END .*marca 1|END .*Press 1/i);
});

test("USSD pay flow: invalid amount is rejected", async () => {
  const env = newEnv();
  await seed(env, SINPE);
  const out = await handleUssd(env, form({ phoneNumber: PHONE, text: "5*PANADERIA*abc" }));
  assert.match(out, /END .*invalido|END .*Invalid/i);
  assert.equal(env.DB.payments.length, 0);
});
