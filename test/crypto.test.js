import test from "node:test";
import assert from "node:assert";
import { hmacMsisdn, hashPin, verifyPin } from "../src/crypto.js";

test("MSISDN HMAC is deterministic and pepper-dependent", async () => {
  const a = await hmacMsisdn("+50688887777", "pepper-A");
  const b = await hmacMsisdn("+50688887777", "pepper-A");
  const c = await hmacMsisdn("+50688887777", "pepper-B");
  const d = await hmacMsisdn("+50611112222", "pepper-A");
  assert.equal(a, b);                 // same input + pepper => same hash
  assert.notEqual(a, c);              // different pepper => different hash
  assert.notEqual(a, d);              // different number => different hash
  assert.match(a, /^[0-9a-f]{64}$/);  // 256-bit hex
});

test("HMAC does not reveal the plaintext number", async () => {
  const h = await hmacMsisdn("+50688887777", "secret-pepper");
  assert.ok(!h.includes("88887777"));
});

test("PIN hashing verifies the correct PIN and rejects others", async () => {
  const stored = await hashPin("4729");
  assert.ok(stored.startsWith("pbkdf2$sha256$"));
  assert.equal(await verifyPin("4729", stored), true);
  assert.equal(await verifyPin("0000", stored), false);
  assert.equal(await verifyPin("47290", stored), false);
});

test("PIN hashes are salted (two hashes of same PIN differ)", async () => {
  const a = await hashPin("1234");
  const b = await hashPin("1234");
  assert.notEqual(a, b);
});
