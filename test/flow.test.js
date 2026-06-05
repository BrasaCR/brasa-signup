import test from "node:test";
import assert from "node:assert";
import { mockDB } from "./_mock.js";
import { issueGovId, myGovId } from "../src/issue.js";
import { handleVerify } from "../src/verify.js";
import { parseDisplay } from "../src/govid.js";

const PHONE_A = "+50688887777";
const PHONE_B = "+50611112222";

test("issues a new GovID, then dedupes on the same phone", async () => {
  const env = { DB: mockDB(), MSISDN_PEPPER: "test-pepper" };

  const first = await issueGovId(env, PHONE_A, "es");
  assert.equal(first.existing, false);
  assert.ok(parseDisplay(first.display_id).valid);
  assert.equal(env.DB.events.filter(e => e.event === "issued").length, 1);

  const again = await issueGovId(env, PHONE_A, "es");
  assert.equal(again.existing, true);
  assert.equal(again.display_id, first.display_id);          // same identity
  assert.equal(env.DB.citizens.length, 1);                    // no duplicate row
});

test("different phones get different GovIDs", async () => {
  const env = { DB: mockDB(), MSISDN_PEPPER: "test-pepper" };
  const a = await issueGovId(env, PHONE_A, "es");
  const b = await issueGovId(env, PHONE_B, "en");
  assert.notEqual(a.display_id, b.display_id);
  assert.equal(env.DB.citizens.length, 2);
});

test("myGovId finds an issued identity and misses an unknown phone", async () => {
  const env = { DB: mockDB(), MSISDN_PEPPER: "test-pepper" };
  await issueGovId(env, PHONE_A, "es");
  assert.equal((await myGovId(env, PHONE_A)).found, true);
  assert.equal((await myGovId(env, PHONE_B)).found, false);
});

test("verifier confirms a real GovID and rejects a tampered one", async () => {
  const env = { DB: mockDB(), MSISDN_PEPPER: "test-pepper" };
  const r = await issueGovId(env, PHONE_A, "es");

  const ok = await handleVerify(env, r.display_id);
  assert.equal(ok.valid, true);
  assert.equal(ok.status, "provisional");

  const chars = r.display_id.split("");
  chars[4] = chars[4] === "0" ? "1" : "0";
  const bad = await handleVerify(env, chars.join(""));
  assert.equal(bad.valid, false);
  assert.equal(bad.reason, "bad_check_symbol");

  const unknown = await handleVerify(env, "BRA-00000-00000-0");
  assert.ok(unknown.valid === false);
});

test("MSISDN is never stored in plaintext", async () => {
  const env = { DB: mockDB(), MSISDN_PEPPER: "test-pepper" };
  await issueGovId(env, PHONE_A, "es");
  const dump = JSON.stringify(env.DB.citizens);
  assert.ok(!dump.includes("88887777"));
});
