// govid.js — GovID identifier primitives (pure, dependency-free)
// Canonical key: UUIDv7 (time-ordered). Display handle: BRA-XXXXX-XXXXX-C
// Crockford Base32 (no I L O U) + ISO-style mod-37 check symbol.

const ENC = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";       // 32 symbols
const CHECK = ENC + "*~$=U";                            // 37 symbols (check alphabet)

// Decode map with Crockford aliases (I->1, L->1, O->0) and lowercase.
const DEC = (() => {
  const m = {};
  for (let i = 0; i < ENC.length; i++) { m[ENC[i]] = i; m[ENC[i].toLowerCase()] = i; }
  m["I"] = 1; m["i"] = 1; m["L"] = 1; m["l"] = 1; m["O"] = 0; m["o"] = 0;
  return m;
})();

// --- UUIDv7 (RFC 9562): 48-bit ms timestamp + version 7 + random ---
export function uuidv7() {
  const ts = BigInt(Date.now());
  const b = new Uint8Array(16);
  for (let i = 0; i < 6; i++) b[i] = Number((ts >> BigInt((5 - i) * 8)) & 0xffn);
  const rnd = new Uint8Array(10);
  globalThis.crypto.getRandomValues(rnd);
  b.set(rnd, 6);
  b[6] = (b[6] & 0x0f) | 0x70; // version 7
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10
  const h = [...b].map(x => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Derive a 50-bit value from the random tail of the canonical key.
function extract50(uuid) {
  const hex = uuid.replace(/-/g, "");
  const v = BigInt("0x" + hex.slice(-14)); // 56 bits
  return v & ((1n << 50n) - 1n);            // mask to 50 bits => 10 base32 chars
}

function encode50(v) {
  let s = "";
  for (let i = 0; i < 10; i++) { s = ENC[Number(v & 31n)] + s; v >>= 5n; }
  return s;
}

function valueOf(str) {
  let v = 0n;
  for (const ch of str) v = (v << 5n) + BigInt(DEC[ch]);
  return v;
}

function checkSymbol(data10) {
  return CHECK[Number(valueOf(data10) % 37n)];
}

function normalizeCheck(ch) {
  if (DEC[ch] !== undefined && DEC[ch] < 32) return ENC[DEC[ch]];
  const i = CHECK.indexOf(ch);
  return i >= 0 ? CHECK[i] : null;
}

// Build the human-facing display handle from a canonical key.
export function formatDisplay(uuid) {
  const data = encode50(extract50(uuid));
  return `BRA-${data.slice(0, 5)}-${data.slice(5)}-${checkSymbol(data)}`;
}

// Validate a display handle offline and return the normalized form for lookup.
export function parseDisplay(input) {
  const s = String(input).toUpperCase().replace(/[\s-]/g, "");
  if (!s.startsWith("BRA") || s.length !== 14) return { valid: false };
  const dataRaw = s.slice(3, 13), checkRaw = s.slice(13);
  let data = "";
  for (const ch of dataRaw) {
    const v = DEC[ch];
    if (v === undefined) return { valid: false };
    data += ENC[v];
  }
  const expected = checkSymbol(data);
  const provided = normalizeCheck(checkRaw);
  if (provided === null) return { valid: false };
  const valid = provided === expected;
  return { valid, normalized: valid ? `BRA-${data.slice(0, 5)}-${data.slice(5)}-${expected}` : undefined };
}
