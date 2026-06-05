// scripts/keygen.js — Stiftung key ceremony helper (run with: node scripts/keygen.js)
//
// Generates the offline ROOT key and one online intermediate SIGNING key, has
// the root certify the intermediate, and prints exactly what to deploy. The
// ROOT PRIVATE KEY must be moved to offline/air-gapped storage and removed from
// any machine; it is NOT a Worker secret and never signs credentials directly.

import { generateKeyPair, certifyKey } from "../src/sign.js";

function uuidish() {
  const b = crypto.getRandomValues(new Uint8Array(8));
  return "key-" + [...b].map(x => x.toString(16).padStart(2, "0")).join("");
}

const root = await generateKeyPair();
const inter = await generateKeyPair();
const key_id = uuidish();
const created_at = Date.now();
const status = "active";
const cert = await certifyKey(root.privateKey, { key_id, public_key: inter.publicKey, created_at, status });

console.log(`
========================  BRASA GovID key ceremony  ========================

1) PUBLISH as a Worker var (wrangler.toml [vars]):
   ROOT_PUBLIC_KEY = "${root.publicKey}"
   SIGNING_KEY_ID  = "${key_id}"

2) STORE OFFLINE (air-gapped) — the root private key. Do NOT keep on any server:
   ROOT_PRIVATE_KEY = ${root.privateKey}

3) SET as a Worker SECRET (signs credentials):
   wrangler secret put SIGNING_PRIVATE_KEY
   # value: ${inter.privateKey}

4) REGISTER the intermediate in the key log (D1):
   INSERT OR REPLACE INTO signing_keys (key_id, public_key, cert, created_at, status)
   VALUES ('${key_id}', '${inter.publicKey}', '${cert}', ${created_at}, '${status}');

============================================================================
`);
