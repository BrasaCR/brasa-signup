import test from "node:test";
import assert from "node:assert";
import { mockDB } from "./_mock.js";
import { RIGHTS, listRights, moduleLoA } from "../src/rights.js";
import { issueGovId } from "../src/issue.js";
import { setPin } from "../src/auth.js";
import { useModule } from "../src/session.js";

const PHONE = "+50688887777";
const newEnv = () => ({ DB: mockDB(), MSISDN_PEPPER: "test-pepper" });

test("there are 21 rights across 4 clusters", () => {
  assert.equal(RIGHTS.length, 21);
  const byCluster = c => RIGHTS.filter(r => r.cluster === c).length;
  assert.equal(byCluster("substrate"), 8);
  assert.equal(byCluster("survival"), 7);
  assert.equal(byCluster("development"), 3);
  assert.equal(byCluster("participation"), 3);
  assert.ok(listRights().some(r => r.slug === "identity"));
});

test("moduleLoA reports known and unknown modules", () => {
  assert.equal(moduleLoA("education"), 1);
  assert.equal(moduleLoA("business"), 2);
  assert.equal(moduleLoA("pay"), 1);
  assert.equal(moduleLoA("nope"), null);
});

test("useModule asks for a GovID when the phone is unknown", async () => {
  const env = newEnv();
  const r = await useModule(env, { msisdn: PHONE, module: "education" });
  assert.equal(r.status, "need_govid");
  assert.equal(env.DB.cdr.length, 0); // no subject => no CDR
});

test("LoA-1 module is served and writes a content-free CDR keyed on GovID", async () => {
  const env = newEnv();
  const c = await issueGovId(env, PHONE, "es");
  const r = await useModule(env, { msisdn: PHONE, module: "education", language: "es" });
  assert.equal(r.status, "ok");
  assert.equal(r.gov_id, c.gov_id);
  assert.equal(env.DB.cdr.length, 1);
  const row = env.DB.cdr[0];
  assert.equal(row.gov_id, c.gov_id);
  assert.equal(row.module, "education");
  assert.equal(row.outcome, "served");
  assert.deepEqual(Object.keys(row).sort(), ["gov_id", "language", "module", "outcome", "ts"]); // no content fields
});

test("LoA-2 module requires authentication", async () => {
  const env = newEnv();
  await issueGovId(env, PHONE, "es");           // LoA 1, no PIN
  const blocked = await useModule(env, { msisdn: PHONE, module: "business" });
  assert.equal(blocked.status, "need_auth");
  assert.equal(env.DB.cdr.at(-1).outcome, "need_auth");

  await setPin(env, PHONE, "4729");             // raise to LoA 2
  const denied = await useModule(env, { msisdn: PHONE, module: "business", pin: "0000" });
  assert.equal(denied.status, "need_auth");

  const ok = await useModule(env, { msisdn: PHONE, module: "business", pin: "4729" });
  assert.equal(ok.status, "ok");
  assert.equal(env.DB.cdr.at(-1).outcome, "served");
});

test("unknown module is recorded as such", async () => {
  const env = newEnv();
  await issueGovId(env, PHONE, "es");
  const r = await useModule(env, { msisdn: PHONE, module: "teleport" });
  assert.equal(r.status, "unknown_module");
  assert.equal(env.DB.cdr.at(-1).outcome, "unknown_module");
});
