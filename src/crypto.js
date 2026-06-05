// crypto.js — privacy + auth primitives using Web Crypto (Workers + Node 22)
// MSISDN is never stored in plaintext: only its keyed HMAC is persisted.
// PIN uses PBKDF2-HMAC-SHA256 (natively available). Argon2id is the hardening
// upgrade once a WASM module is added; the stored-format prefix allows migration.

const te = new TextEncoder();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");

export async function hmacMsisdn(msisdn, pepper) {
  const key = await crypto.subtle.importKey(
    "raw", te.encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return hex(await crypto.subtle.sign("HMAC", key, te.encode(String(msisdn))));
}

const PIN_ITER = 210000;

export async function hashPin(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const km = await crypto.subtle.importKey("raw", te.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PIN_ITER, hash: "SHA-256" }, km, 256
  );
  return `pbkdf2$sha256$${PIN_ITER}$${b64(salt)}$${b64(bits)}`;
}

export async function verifyPin(pin, stored) {
  try {
    const [scheme, , iterStr, saltB64, hashB64] = stored.split("$");
    if (scheme !== "pbkdf2") return false;
    const salt = unb64(saltB64);
    const km = await crypto.subtle.importKey("raw", te.encode(pin), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: Number(iterStr), hash: "SHA-256" }, km, 256
    );
    return timingSafeEqual(b64(bits), hashB64);
  } catch { return false; }
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
