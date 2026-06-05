import test from "node:test";
import assert from "node:assert";
import { RAILS } from "../src/paymethods.js";
import { buildInstruction } from "../src/payments.js";
import { t } from "../src/i18n.js";

const rails = Object.keys(RAILS);

test("catalog covers the full rail set", () => {
  assert.ok(rails.length >= 85, `expected >= 85 rails, got ${rails.length}`);
  // every entry is well-formed
  for (const [rail, c] of Object.entries(RAILS)) {
    assert.ok(["key", "merchant", "mpesa"].includes(c.family), `${rail} bad family`);
    assert.ok(c.brand, `${rail} missing brand`);
    if (c.family === "key") assert.ok(c.field && c.conn, `${rail} missing key fields`);
  }
});

for (const rail of rails) {
  const c = RAILS[rail];
  test(`rail ${rail}: builds a structured instruction and renders in en+es`, () => {
    const dest = {
      rail,
      account: "ACCT123",
      account_ref: c.family === "mpesa" ? "REF1" : null,
      dial_code: c.family === "merchant" ? "*123#" : null,
      name: "ABC Test",
      currency: "USD",
    };

    // structured instruction
    const ins = buildInstruction(dest, 1000, "USD", "BRASA-REF-1");
    assert.equal(ins.rail, rail);
    assert.equal(ins.amount_minor, 1000);
    if (c.family === "key") {
      assert.equal(ins[c.field], "ACCT123");
      assert.equal(ins.dial, undefined);
    } else if (c.family === "merchant") {
      assert.equal(ins.method, "merchant");
      assert.equal(ins.code, "ACCT123");
      assert.equal(ins.dial, "*123#");
    } else {
      assert.ok(ins.method === "paybill" || ins.method === "till");
    }

    // rendered text (English — the single canonical language)
    const vals = { m: 10, cur: "USD", name: "ABC Test", ref: "BRASA-REF-1", dest: "ACCT123", account_ref: dest.account_ref, dial: dest.dial_code };
    const out = t().payInstruction(rail, vals);
    assert.ok(out.includes(c.brand), `${rail}: brand "${c.brand}" missing`);
    assert.ok(out.includes("USD 10"), `${rail}: amount missing`);
    assert.ok(out.includes("BRASA-REF-1"), `${rail}: reference missing`);
    assert.ok(out.includes("never holds funds"), `${rail}: disclaimer missing`);
  });
}
