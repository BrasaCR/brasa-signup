import test from "node:test";
import assert from "node:assert";
import { mockDB } from "./_mock.js";
import { issueGovId } from "../src/issue.js";
import { setPin, changePin, authenticate, accountState } from "../src/auth.js";

const PHONE = "+50688887777";
const newEnv = () => ({ DB: mockDB(), MSISDN_PEPPER: "test-pepper" });

test("setPin raises the identity to LoA 2 and is logged", async () => {
  const env = newEnv();
  await issueGovId(env, PHONE, "es");
  const r = await setPin(env, PHONE, "4729");
  assert.equal(r.ok, true);
  assert.equal(r.loa, 2);
  assert.equal(env.DB.citizens[0].loa, 2);
  assert.equal(env.DB.citizens[0].status, "active"); // provisional -> active on PIN set
  assert.ok(env.DB.events.some(e => e.event === "loa_up"));
});

test("setPin rejects bad PINs and double-set", async () => {
  const env = newEnv();
  await issueGovId(env, PHONE, "es");
  assert.equal((await setPin(env, PHONE, "12")).reason, "bad_pin");
  assert.equal((await setPin(env, PHONE, "abcd")).reason, "bad_pin");
  await setPin(env, PHONE, "4729");
  assert.equal((await setPin(env, PHONE, "0000")).reason, "pin_exists");
});

test("setPin requires an existing account", async () => {
  const env = newEnv();
  assert.equal((await setPin(env, PHONE, "4729")).reason, "no_account");
});

test("authenticate verifies the right PIN and rejects others", async () => {
  const env = newEnv();
  await issueGovId(env, PHONE, "es");
  await setPin(env, PHONE, "4729");
  assert.equal((await authenticate(env, PHONE, "4729")).ok, true);
  assert.equal((await authenticate(env, PHONE, "0000")).reason, "wrong_pin");
  assert.ok(env.DB.events.some(e => e.event === "auth"));
});

test("authenticate reports no_pin before one is set", async () => {
  const env = newEnv();
  await issueGovId(env, PHONE, "es");
  assert.equal((await authenticate(env, PHONE, "4729")).reason, "no_pin");
});

test("changePin needs the current PIN", async () => {
  const env = newEnv();
  await issueGovId(env, PHONE, "es");
  await setPin(env, PHONE, "4729");
  assert.equal((await changePin(env, PHONE, "0000", "1357")).reason, "wrong_pin");
  assert.equal((await changePin(env, PHONE, "4729", "1357")).ok, true);
  assert.equal((await authenticate(env, PHONE, "1357")).ok, true);
});

test("accountState reflects existence and PIN status", async () => {
  const env = newEnv();
  assert.deepEqual(await accountState(env, PHONE), { found: false });
  await issueGovId(env, PHONE, "es");
  assert.deepEqual(await accountState(env, PHONE), { found: true, hasPin: false, loa: 1 });
  await setPin(env, PHONE, "4729");
  assert.deepEqual(await accountState(env, PHONE), { found: true, hasPin: true, loa: 2 });
});
