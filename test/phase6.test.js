import test from "node:test";
import assert from "node:assert";
import { mockDB } from "./_mock.js";
import { issueGovId } from "../src/issue.js";
import { setPin } from "../src/auth.js";
import { useModule } from "../src/session.js";
import { initiateRecovery } from "../src/recover.js";
import { registerCampus, registerOfficer, verifyInPerson } from "../src/campus.js";
import { insertCredential } from "../src/db.js";
import { snapshot } from "../src/metrics.js";
import worker from "../src/index.js";

const env = () => ({ DB: mockDB(), MSISDN_PEPPER: "pepper", ADMIN_TOKEN: "secret", RECOVERY_COOLDOWN_MS: 86400000 });

// Build a known population so the aggregate counts are deterministic.
async function populate(e) {
  const a = await issueGovId(e, "+50670000001", "en");   // LoA1 -> LoA2 (pin) -> LoA3 (in person)
  const b = await issueGovId(e, "+50670000002", "es");   // LoA1 -> LoA2 (pin)
  await issueGovId(e, "+254700000003", "sw");            // LoA1 only
  await issueGovId(e, "+8801700000004", "bn");           // LoA1 only

  await setPin(e, "+50670000001", "1111");
  await setPin(e, "+50670000002", "2222");

  await registerCampus(e, { campus_id: "abc-san-jose", name: "ABC San Jose", country: "CR" });
  await registerOfficer(e, { officer_id: "off-1", campus_id: "abc-san-jose", name: "Officer One" });
  await verifyInPerson(e, { display_id: a.display_id, campus_id: "abc-san-jose", officer_id: "off-1" });

  // a credential bound to citizen a (count only; signing chain covered elsewhere)
  await insertCredential(e, {
    cred_id: "cred-1", gov_id: a.gov_id, credential: "BRASA BBA", std_version: "v1",
    issued_at: Date.now(), key_id: "k1", signature: "sig", status: "active",
  });

  // a pending recovery onto a new number
  await initiateRecovery(e, "+50679999999", b.display_id, "2222");

  // some content-free interactions
  await useModule(e, { msisdn: "+50670000001", module: "education" });
  await useModule(e, { msisdn: "+254700000003", module: "education" });
  return { a, b };
}

test("snapshot reports correct aggregate counts", async () => {
  const e = env();
  await populate(e);
  const m = await snapshot(e);

  assert.equal(m.citizens.issued, 4);
  assert.equal(m.citizens.active, 2);        // a and b activated via setPin
  assert.equal(m.citizens.provisional, 2);   // the two LoA1-only

  assert.deepEqual(m.loa_distribution, { 1: 2, 2: 1, 3: 1 });
  assert.equal(m.recoveries.pending, 1);
  assert.equal(m.credentials_issued, 1);
  assert.equal(m.in_person_verifications, 1);
  assert.ok(m.interactions >= 2);            // CDRs from useModule (+ auth rows)

  assert.equal(m.languages.distinct, 4);
  assert.equal(m.languages.served.en, 1);
  assert.equal(m.languages.served.sw, 1);
});

test("the metrics snapshot is content-free (no GovID, number, or message)", async () => {
  const e = env();
  const { a } = await populate(e);
  const m = await snapshot(e);
  const blob = JSON.stringify(m);
  assert.ok(!blob.includes(a.gov_id), "must not contain a gov_id");
  assert.ok(!blob.includes(a.display_id), "must not contain a display_id");
  assert.ok(!blob.includes("+506"), "must not contain a phone number");
});

test("GET /metrics is public and returns the snapshot", async () => {
  const e = env();
  await populate(e);
  const res = await worker.fetch(new Request("https://x/metrics"), e);  // no auth header
  assert.equal(res.status, 200);
  const m = await res.json();
  assert.equal(m.citizens.issued, 4);
  assert.equal(m.loa_distribution[3], 1);
  assert.match(m.note, /content-free/i);
});

test("empty system yields all-zero metrics without errors", async () => {
  const m = await snapshot(env());
  assert.equal(m.citizens.issued, 0);
  assert.deepEqual(m.loa_distribution, { 1: 0, 2: 0, 3: 0 });
  assert.equal(m.credentials_issued, 0);
  assert.equal(m.in_person_verifications, 0);
  assert.equal(m.languages.distinct, 0);
});
