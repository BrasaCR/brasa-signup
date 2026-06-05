import test from "node:test";
import assert from "node:assert";
import { mockDB } from "./_mock.js";
import { issueGovId } from "../src/issue.js";
import { setPin } from "../src/auth.js";
import { issueCredential, listCredentials } from "../src/credentials.js";
import { handleVerify, handleVerifyCredential } from "../src/verify.js";
import { generateKeyPair, certifyKey } from "../src/sign.js";
import * as db from "../src/db.js";

const PHONE = "+50688887777";

// Build an env with a real root + registered intermediate signing key.
async function makeEnv() {
  const root = await generateKeyPair();
  const inter = await generateKeyPair();
  const key_id = "key-test";
  const created_at = 1000, status = "active";
  const cert = await certifyKey(root.privateKey, { key_id, public_key: inter.publicKey, created_at, status });
  const env = {
    DB: mockDB(),
    MSISDN_PEPPER: "test-pepper",
    ROOT_PUBLIC_KEY: root.publicKey,
    SIGNING_KEY_ID: key_id,
    SIGNING_PRIVATE_KEY: inter.privateKey,
  };
  await db.upsertSigningKey(env, { key_id, public_key: inter.publicKey, cert, created_at, status });
  return env;
}

async function citizenWithPin(env) {
  const r = await issueGovId(env, PHONE, "es");
  await setPin(env, PHONE, "4729"); // raise to LoA 2
  return r.display_id;
}

test("issues a signed credential bound to a GovID (LoA 2)", async () => {
  const env = await makeEnv();
  const display = await citizenWithPin(env);
  const r = await issueCredential(env, display, "BRASA BBA", "1.0");
  assert.equal(r.ok, true);
  assert.ok(r.cred_id && r.signature);
  assert.equal(env.DB.credentials.length, 1);
  assert.ok(env.DB.events.some(e => e.event === "credential"));
});

test("refuses to issue below LoA 2", async () => {
  const env = await makeEnv();
  const r0 = await issueGovId(env, PHONE, "es"); // no PIN => LoA 1
  const r = await issueCredential(env, r0.display_id, "BRASA BBA", "1.0");
  assert.equal(r.ok, false);
  assert.equal(r.reason, "loa_too_low");
});

test("verifier returns the credential with a valid chain", async () => {
  const env = await makeEnv();
  const display = await citizenWithPin(env);
  const issued = await issueCredential(env, display, "BRASA Computer Science", "1.0");

  const v = await handleVerify(env, display);
  assert.equal(v.valid, true);
  assert.equal(v.credentials.length, 1);
  assert.equal(v.credentials[0].credential, "BRASA Computer Science");
  assert.equal(v.credentials[0].valid, true);

  const single = await handleVerifyCredential(env, issued.cred_id);
  assert.equal(single.valid, true);
  assert.equal(single.display_id, display);
  assert.equal(single.std_version, "1.0");
});

test("a forged credential row fails chain verification", async () => {
  const env = await makeEnv();
  const display = await citizenWithPin(env);
  await issueCredential(env, display, "BRASA BBA", "1.0");

  // Tamper directly in storage: upgrade the credential after signing.
  env.DB.credentials[0].credential = "BRASA MBA";

  const v = await handleVerify(env, display);
  assert.equal(v.credentials[0].valid, false);
  assert.equal(v.credentials[0].reason, "bad_credential_signature");
});

test("verifier still reports a clean identity with zero credentials", async () => {
  const env = await makeEnv();
  const r0 = await issueGovId(env, PHONE, "es");
  const v = await handleVerify(env, r0.display_id);
  assert.equal(v.valid, true);
  assert.deepEqual(v.credentials, []);
});

test("listCredentials returns issued credentials for a GovID", async () => {
  const env = await makeEnv();
  const display = await citizenWithPin(env);
  const r = await issueCredential(env, display, "BRASA BBA", "1.0");
  const list = await listCredentials(env, r.gov_id);
  assert.equal(list.length, 1);
  assert.equal(list[0].credential, "BRASA BBA");
});
