import test from "node:test";
import assert from "node:assert";
import {
  generateKeyPair, sign, verify, certifyKey, verifyChain,
  canonicalCredential, canonicalKeyCert,
} from "../src/sign.js";

test("sign/verify round-trips and rejects tampering", async () => {
  const k = await generateKeyPair();
  const sig = await sign(k.privateKey, "payload-A");
  assert.equal(await verify(k.publicKey, sig, "payload-A"), true);
  assert.equal(await verify(k.publicKey, sig, "payload-B"), false);
});

test("a different key cannot verify the signature", async () => {
  const a = await generateKeyPair();
  const b = await generateKeyPair();
  const sig = await sign(a.privateKey, "x");
  assert.equal(await verify(b.publicKey, sig, "x"), false);
});

async function setupChain() {
  const root = await generateKeyPair();
  const inter = await generateKeyPair();
  const keyRecord = { key_id: "key-test", public_key: inter.publicKey, created_at: 1000, status: "active" };
  keyRecord.cert = await certifyKey(root.privateKey, keyRecord);
  return { root, inter, keyRecord };
}

test("full chain verifies a properly issued credential", async () => {
  const { root, inter, keyRecord } = await setupChain();
  const cred = { cred_id: "c1", gov_id: "g1", credential: "BRASA BBA", std_version: "1.0", issued_at: 2000, key_id: "key-test" };
  cred.signature = await sign(inter.privateKey, canonicalCredential(cred));

  const r = await verifyChain(root.publicKey, keyRecord, cred);
  assert.equal(r.valid, true);
});

test("chain rejects a tampered credential field", async () => {
  const { root, inter, keyRecord } = await setupChain();
  const cred = { cred_id: "c1", gov_id: "g1", credential: "BRASA BBA", std_version: "1.0", issued_at: 2000, key_id: "key-test" };
  cred.signature = await sign(inter.privateKey, canonicalCredential(cred));
  cred.credential = "BRASA MBA"; // forge an upgrade after signing
  const r = await verifyChain(root.publicKey, keyRecord, cred);
  assert.equal(r.valid, false);
  assert.equal(r.reason, "bad_credential_signature");
});

test("chain rejects a forged key certificate (wrong root)", async () => {
  const { inter, keyRecord } = await setupChain();
  const attackerRoot = await generateKeyPair();
  const cred = { cred_id: "c1", gov_id: "g1", credential: "BRASA BBA", std_version: "1.0", issued_at: 2000, key_id: "key-test" };
  cred.signature = await sign(inter.privateKey, canonicalCredential(cred));
  const r = await verifyChain(attackerRoot.publicKey, keyRecord, cred);
  assert.equal(r.valid, false);
  assert.equal(r.reason, "bad_key_certificate");
});

test("chain rejects a revoked signing key", async () => {
  const { root, inter, keyRecord } = await setupChain();
  const cred = { cred_id: "c1", gov_id: "g1", credential: "BRASA BBA", std_version: "1.0", issued_at: 2000, key_id: "key-test" };
  cred.signature = await sign(inter.privateKey, canonicalCredential(cred));
  const revoked = { ...keyRecord, status: "revoked" };
  const r = await verifyChain(root.publicKey, revoked, cred);
  assert.equal(r.valid, false);
});

test("canonical serializers are deterministic", () => {
  const c = { cred_id: "c", gov_id: "g", credential: "X", std_version: "1.0", issued_at: 1, key_id: "k" };
  assert.equal(canonicalCredential(c), canonicalCredential({ ...c }));
  const k = { key_id: "k", public_key: "p", created_at: 1, status: "active" };
  assert.equal(canonicalKeyCert(k), canonicalKeyCert({ ...k }));
});
