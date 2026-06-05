import test from "node:test";
import assert from "node:assert";
import { uuidv7, formatDisplay, parseDisplay } from "../src/govid.js";

test("uuidv7 is a well-formed version-7 UUID", () => {
  for (let i = 0; i < 100; i++) {
    assert.match(uuidv7(),
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  }
});

test("uuidv7 is time-ordered", () => {
  const a = uuidv7();
  const b = uuidv7();
  // first 48 bits encode the ms timestamp; b was minted at or after a
  assert.ok(a.slice(0, 13) <= b.slice(0, 13));
});

test("display handle has the BRA-XXXXX-XXXXX-C shape and validates", () => {
  for (let i = 0; i < 2000; i++) {
    const d = formatDisplay(uuidv7());
    assert.match(d, /^BRA-[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z*~$=U]$/);
    const p = parseDisplay(d);
    assert.ok(p.valid, "should validate: " + d);
    assert.equal(p.normalized, d);
  }
});

test("check symbol rejects a single-character data error", () => {
  let tested = 0;
  for (let i = 0; i < 200; i++) {
    const d = formatDisplay(uuidv7());
    const chars = d.split("");
    const pos = 4; // first data character
    chars[pos] = chars[pos] === "0" ? "1" : "0";
    const bad = chars.join("");
    if (bad !== d) { assert.equal(parseDisplay(bad).valid, false); tested++; }
  }
  assert.ok(tested > 0);
});

test("check symbol rejects a transposition", () => {
  let tested = 0;
  for (let i = 0; i < 500; i++) {
    const d = formatDisplay(uuidv7());
    const c = d.split("");
    if (c[4] !== c[5]) { [c[4], c[5]] = [c[5], c[4]]; assert.equal(parseDisplay(c.join("")).valid, false); tested++; }
  }
  assert.ok(tested > 0);
});

test("Crockford normalization: lowercase and I/L/O aliases", () => {
  const d = formatDisplay(uuidv7());
  assert.equal(parseDisplay(d.toLowerCase()).valid, true);
  // O->0 and I/L->1 must not break a valid handle when present
  const aliased = d.replace(/0/g, "O").replace(/1/g, "I");
  assert.equal(parseDisplay(aliased).valid, true);
});

test("garbage input is rejected", () => {
  for (const bad of ["", "BRA", "XYZ-12345-67890-1", "BRA-12345-67890", "hello"]) {
    assert.equal(parseDisplay(bad).valid, false);
  }
});
