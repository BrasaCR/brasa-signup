// sign.js — Ed25519 signing for the credential chain (Phase 3).
//
// Trust chain:  Stiftung ROOT key  --certifies-->  intermediate SIGNING key
//               intermediate key   --signs-------->  each credential
// Anyone with the published ROOT public key can verify a credential offline:
// verify the key certificate with the root, then the credential with the
// intermediate. The root private key stays offline; only intermediates sign.

const te = new TextEncoder();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const ALG = { name: "Ed25519" };

// --- key handling ---
export async function generateKeyPair() {
  const kp = await crypto.subtle.generateKey(ALG, true, ["sign", "verify"]);
  return {
    publicKey: b64(await crypto.subtle.exportKey("raw", kp.publicKey)),   // 32 bytes
    privateKey: b64(await crypto.subtle.exportKey("pkcs8", kp.privateKey)),
  };
}
export const importPrivate = b => crypto.subtle.importKey("pkcs8", unb64(b), ALG, false, ["sign"]);
export const importPublic  = b => crypto.subtle.importKey("raw",  unb64(b), ALG, false, ["verify"]);

// --- raw sign / verify over a string payload ---
export async function sign(privateKeyB64, payload) {
  const key = await importPrivate(privateKeyB64);
  return b64(await crypto.subtle.sign(ALG, key, te.encode(payload)));
}
export async function verify(publicKeyB64, sigB64, payload) {
  try {
    const key = await importPublic(publicKeyB64);
    return await crypto.subtle.verify(ALG, key, unb64(sigB64), te.encode(payload));
  } catch { return false; }
}

// --- canonical, deterministic payloads (pipe-delimited; inputs forbid '|') ---
export function canonicalCredential(c) {
  return `cred.v1|${c.cred_id}|${c.gov_id}|${c.credential}|${c.std_version}|${c.issued_at}|${c.key_id}`;
}
export function canonicalKeyCert(k) {
  return `keycert.v1|${k.key_id}|${k.public_key}|${k.created_at}|${k.status}`;
}

// --- root certifies an intermediate signing key ---
export async function certifyKey(rootPrivateB64, keyRecord) {
  return sign(rootPrivateB64, canonicalKeyCert(keyRecord));
}

// --- full-chain verification of one credential ---
// rootPublicB64: published Stiftung root public key
// keyRecord:    { key_id, public_key, cert, created_at, status }
// cred:         { cred_id, gov_id, credential, std_version, issued_at, key_id, signature }
export async function verifyChain(rootPublicB64, keyRecord, cred) {
  if (!keyRecord || keyRecord.status === "revoked") return { valid: false, reason: "key_revoked_or_missing" };
  const keyOk = await verify(rootPublicB64, keyRecord.cert, canonicalKeyCert(keyRecord));
  if (!keyOk) return { valid: false, reason: "bad_key_certificate" };
  const credOk = await verify(keyRecord.public_key, cred.signature, canonicalCredential(cred));
  if (!credOk) return { valid: false, reason: "bad_credential_signature" };
  return { valid: true };
}
