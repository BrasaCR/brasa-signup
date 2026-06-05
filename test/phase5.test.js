import test from "node:test";
import assert from "node:assert";
import { mockDB } from "./_mock.js";
import { issueGovId } from "../src/issue.js";
import { setPin } from "../src/auth.js";
import { useModule } from "../src/session.js";
import { registerCampus, registerOfficer, verifyInPerson, recoverInPerson, listVerifications } from "../src/campus.js";
import worker from "../src/index.js";

const env = () => ({ DB: mockDB(), MSISDN_PEPPER: "pepper", ADMIN_TOKEN: "secret" });

async function citizenWithPin(e, phone = "+50670000001") {
  const r = await issueGovId(e, phone, "en");
  await setPin(e, phone, "2468");           // -> LoA 2
  return r;                                  // { gov_id, display_id, ... }
}

async function campusAndOfficer(e) {
  await registerCampus(e, { campus_id: "abc-san-jose", name: "ABC San Jose", country: "CR" });
  await registerOfficer(e, { officer_id: "off-1", campus_id: "abc-san-jose", name: "Officer One" });
}

test("officer can only be registered at an existing campus", async () => {
  const e = env();
  const bad = await registerOfficer(e, { officer_id: "x", campus_id: "ghost", name: "X" });
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, "no_campus");
  await registerCampus(e, { campus_id: "abc-nairobi", name: "ABC Nairobi", country: "KE" });
  const ok = await registerOfficer(e, { officer_id: "x", campus_id: "abc-nairobi", name: "X" });
  assert.equal(ok.ok, true);
});

test("LoA-3 module is refused until in-person verification, then served", async () => {
  const e = env();
  const { display_id } = await citizenWithPin(e);
  await campusAndOfficer(e);
  const phone = "+50670000001";

  // succession requires LoA 3; with PIN but no in-person proof -> need_inperson
  let r = await useModule(e, { msisdn: phone, module: "succession", pin: "2468" });
  assert.equal(r.status, "need_inperson");

  // officer attests in person -> LoA 3
  const v = await verifyInPerson(e, { display_id, campus_id: "abc-san-jose", officer_id: "off-1", method: "document" });
  assert.equal(v.ok, true);
  assert.equal(v.loa, 3);

  // now served (still needs the PIN step-up, proving the layers compose)
  r = await useModule(e, { msisdn: phone, module: "succession", pin: "2468" });
  assert.equal(r.status, "ok");
  assert.equal(r.loa, 3);

  // ...but without the PIN it still fails the LoA-2 step-up
  r = await useModule(e, { msisdn: phone, module: "succession", pin: "" });
  assert.equal(r.status, "need_auth");
});

test("verification requires an active, authorized officer at the named campus", async () => {
  const e = env();
  const { display_id } = await citizenWithPin(e);
  await registerCampus(e, { campus_id: "abc-san-jose", name: "ABC San Jose", country: "CR" });
  await registerCampus(e, { campus_id: "abc-nairobi", name: "ABC Nairobi", country: "KE" });
  await registerOfficer(e, { officer_id: "off-1", campus_id: "abc-san-jose", name: "Officer One" });

  // unknown officer
  assert.equal((await verifyInPerson(e, { display_id, campus_id: "abc-san-jose", officer_id: "ghost" })).reason, "no_officer");
  // unknown campus
  assert.equal((await verifyInPerson(e, { display_id, campus_id: "ghost", officer_id: "off-1" })).reason, "no_campus");
  // officer attached to a different campus than the one named
  assert.equal((await verifyInPerson(e, { display_id, campus_id: "abc-nairobi", officer_id: "off-1" })).reason, "officer_campus_mismatch");
  // unknown citizen at a valid campus/officer
  assert.equal((await verifyInPerson(e, { display_id: "BRA-00000-00000-0", campus_id: "abc-san-jose", officer_id: "off-1" })).reason, "not_found");
});

test("the attestation chain is recorded (who/where/how)", async () => {
  const e = env();
  const { gov_id, display_id } = await citizenWithPin(e);
  await campusAndOfficer(e);
  await verifyInPerson(e, { display_id, campus_id: "abc-san-jose", officer_id: "off-1", method: "biometric" });
  const chain = await listVerifications(e, gov_id);
  assert.equal(chain.length, 1);
  assert.equal(chain[0].campus_id, "abc-san-jose");
  assert.equal(chain[0].officer_id, "off-1");
  assert.equal(chain[0].method, "biometric");
});

test("in-person recovery rebinds the anchor (the no-PIN path) and grants LoA-3", async () => {
  const e = env();
  // a citizen with NO PIN — the recover.js gap (cannot self-recover)
  const { display_id } = await issueGovId(e, "+50670000009", "en");
  await campusAndOfficer(e);

  const r = await recoverInPerson(e, { display_id, new_msisdn: "+50671111111", campus_id: "abc-san-jose", officer_id: "off-1" });
  assert.equal(r.ok, true);
  assert.equal(r.loa, 3);

  // the new number now resolves to this GovID; the old one no longer does
  const fromNew = await useModule(e, { msisdn: "+50671111111", module: "education" });
  assert.equal(fromNew.status, "ok");
  assert.equal(fromNew.gov_id, r.gov_id);
  const fromOld = await useModule(e, { msisdn: "+50670000009", module: "education" });
  assert.equal(fromOld.status, "need_govid");
});

test("Worker routes are admin-gated", async () => {
  const e = env();
  const body = JSON.stringify({ campus_id: "abc-x", name: "ABC X" });
  const noAuth = await worker.fetch(new Request("https://x/campuses", { method: "POST", body }), e);
  assert.equal(noAuth.status, 401);

  const withAuth = await worker.fetch(new Request("https://x/campuses", {
    method: "POST", headers: { authorization: "Bearer secret" }, body,
  }), e);
  const j = await withAuth.json();
  assert.equal(j.ok, true);
  assert.equal(j.campus_id, "abc-x");
});
