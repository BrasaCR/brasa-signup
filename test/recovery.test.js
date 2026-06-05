import test from "node:test";
import assert from "node:assert";
import { mockDB } from "./_mock.js";
import { issueGovId, myGovId } from "../src/issue.js";
import { setPin } from "../src/auth.js";
import {
  initiateRecovery, recoveryStatus, completeRecovery, cancelRecovery, cancelByNew,
} from "../src/recover.js";

const OLD = "+50688887777";
const NEW = "+50644443333";
const OTHER = "+50611112222";

// Short cool-down so tests can cross it deterministically.
const env0 = () => ({ DB: mockDB(), MSISDN_PEPPER: "test-pepper", RECOVERY_COOLDOWN_MS: 50 });

async function setup(env) {
  const r = await issueGovId(env, OLD, "es");
  await setPin(env, OLD, "4729");
  return r.display_id;
}

test("recovery requires a correct GovID + PIN", async () => {
  const env = env0();
  const id = await setup(env);
  assert.equal((await initiateRecovery(env, NEW, "BRA-00000-00000-1", "4729")).reason, "bad_govid");
  assert.equal((await initiateRecovery(env, NEW, id, "0000")).reason, "wrong_pin");
  const ok = await initiateRecovery(env, NEW, id, "4729");
  assert.equal(ok.ok, true);
  assert.ok(ok.cooldown_until > Date.now() - 1);
});

test("rebind is blocked during the cool-down, then completes", async () => {
  const env = env0();
  const id = await setup(env);
  await initiateRecovery(env, NEW, id, "4729");

  const early = await completeRecovery(env, NEW);
  assert.equal(early.ok, false);
  assert.equal(early.reason, "cooldown");

  await new Promise(r => setTimeout(r, 70)); // wait out the 50ms cool-down
  const done = await completeRecovery(env, NEW);
  assert.equal(done.ok, true);
  assert.equal(done.display_id, id);

  // identity now answers on the NEW number, not the OLD one
  assert.equal((await myGovId(env, NEW)).found, true);
  assert.equal((await myGovId(env, OLD)).found, false);
});

test("the legitimate holder on the OLD number can cancel a SIM-swap attempt", async () => {
  const env = env0();
  const id = await setup(env);
  await initiateRecovery(env, NEW, id, "4729"); // attacker on NEW number

  const c = await cancelRecovery(env, OLD);     // victim cancels from OLD number
  assert.equal(c.ok, true);

  await new Promise(r => setTimeout(r, 70));
  const blocked = await completeRecovery(env, NEW);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, "no_pending");

  // identity still on the OLD number
  assert.equal((await myGovId(env, OLD)).found, true);
});

test("recovery status reports pending then ready", async () => {
  const env = env0();
  const id = await setup(env);
  assert.equal((await recoveryStatus(env, NEW)).pending, false);
  await initiateRecovery(env, NEW, id, "4729");
  assert.equal((await recoveryStatus(env, NEW)).ready, false);
  await new Promise(r => setTimeout(r, 70));
  assert.equal((await recoveryStatus(env, NEW)).ready, true);
});

test("cannot rebind to a number already used by another identity", async () => {
  const env = env0();
  const id = await setup(env);
  await issueGovId(env, OTHER, "es"); // OTHER number belongs to someone else
  assert.equal((await initiateRecovery(env, OTHER, id, "4729")).reason, "number_in_use");
});

test("an identity without a PIN must recover in person", async () => {
  const env = env0();
  const r = await issueGovId(env, OLD, "es"); // no PIN set
  assert.equal((await initiateRecovery(env, NEW, r.display_id, "4729")).reason, "no_pin");
});

test("the requester can abandon their own pending recovery", async () => {
  const env = env0();
  const id = await setup(env);
  await initiateRecovery(env, NEW, id, "4729");
  assert.equal((await cancelByNew(env, NEW)).ok, true);
  assert.equal((await recoveryStatus(env, NEW)).pending, false);
});
