import test from "node:test";
import assert from "node:assert";
import { mockDB } from "./_mock.js";
import { issueGovId } from "../src/issue.js";
import { appendThread } from "../src/education.js";
import { registerCampus, registerOfficer, verifyInPerson } from "../src/campus.js";
import {
  buildReport, recommendNext, qrSvg, createShareByDisplayId, getReportByToken, revokeShare,
} from "../src/report.js";
import { handleWhatsApp } from "../src/whatsapp.js";
import worker from "../src/index.js";

const env = () => ({ DB: mockDB(), MSISDN_PEPPER: "pepper", ADMIN_TOKEN: "secret", PUBLIC_BASE_URL: "https://brasa.world" });

async function learner(e, phone = "+50670000001") {
  const c = await issueGovId(e, phone, "en");
  await appendThread(e, c.gov_id, { kind: "certification", subject: "Mathematics", provider: "BRASA", detail: "BRASA Math Certificate" });
  await appendThread(e, c.gov_id, { kind: "native_lesson", subject: "Data Science", provider: "BRASA Native", detail: "Module 3 of 8" });
  await appendThread(e, c.gov_id, { kind: "referral", subject: "Programming", provider: "Khan Academy", detail: "Intro to Python" });
  return c;
}

test("recommendNext: finishes in-progress subjects and advances from completed ones", () => {
  const thread = [
    { kind: "certification", subject: "Mathematics" },
    { kind: "native_lesson", subject: "Data Science" },
    { kind: "referral", subject: "Programming" },
  ];
  const recs = recommendNext(thread);
  const subjects = recs.map(r => r.subject.toLowerCase());
  assert.ok(subjects.includes("data science"), "should suggest finishing Data Science");
  assert.ok(subjects.includes("statistics") || subjects.includes("physics"), "should advance from completed Mathematics");
  assert.ok(!subjects.includes("mathematics"), "should not re-suggest a completed subject");
  assert.ok(recs.every(r => r.reason), "every suggestion carries a reason");
});

test("recommendNext: empty history suggests foundations", () => {
  const recs = recommendNext([]);
  assert.ok(recs.length > 0);
  assert.ok(recs.some(r => /Mathematics|English|Programming/.test(r.subject)));
});

test("buildReport splits completed vs in-progress and reflects in-person assurance", async () => {
  const e = env();
  const c = await learner(e);
  let report = await buildReport(e, c.gov_id);

  assert.equal(report.identity.display_id, c.display_id);
  assert.equal(report.identity.identity_verified_in_person, false);
  assert.equal(report.education.completed.length, 1);
  assert.equal(report.education.completed[0].subject, "Mathematics");
  assert.equal(report.education.in_progress.length, 2);              // Data Science + Programming
  assert.ok(report.next_steps.length > 0);
  assert.match(report.note, /root key/i);

  // after in-person verification the badge flips to true
  await registerCampus(e, { campus_id: "abc-sj", name: "ABC SJ" });
  await registerOfficer(e, { officer_id: "o1", campus_id: "abc-sj", name: "Off" });
  await verifyInPerson(e, { display_id: c.display_id, campus_id: "abc-sj", officer_id: "o1" });
  report = await buildReport(e, c.gov_id);
  assert.equal(report.identity.identity_verified_in_person, true);
  assert.equal(report.identity.loa, 3);
});

test("qrSvg produces a scalable SVG for the share URL", () => {
  const svg = qrSvg("https://brasa.world/report/view?token=abc123");
  assert.match(svg, /^<svg/);
  assert.match(svg, /viewBox/);
});

test("capability share: create -> read -> expire -> revoke", async () => {
  const e = env();
  const c = await learner(e);

  const s = await createShareByDisplayId(e, c.display_id);
  assert.equal(s.ok, true);
  const live = await getReportByToken(e, s.token);
  assert.equal(live.ok, true);
  assert.equal(live.report.identity.display_id, c.display_id);

  // unknown token
  assert.equal((await getReportByToken(e, "deadbeef")).reason, "not_found");

  // expired share
  const ex = await createShareByDisplayId(e, c.display_id, -1);  // already expired
  assert.equal((await getReportByToken(e, ex.token)).reason, "expired");

  // revoked share
  await revokeShare(e, s.token);
  assert.equal((await getReportByToken(e, s.token)).reason, "revoked");
});

test("Worker: admin issues a share; public reaches JSON, HTML and QR; revoke locks it", async () => {
  const e = env();
  const c = await learner(e);
  const A = { authorization: "Bearer secret", "content-type": "application/json" };

  const shareRes = await worker.fetch(new Request("https://x/report/share", {
    method: "POST", headers: A, body: JSON.stringify({ display_id: c.display_id }),
  }), e);
  const share = await shareRes.json();
  assert.equal(share.ok, true);
  assert.match(share.view_url, /\/report\/view\?token=/);

  const token = share.token;
  const json = await (await worker.fetch(new Request(`https://x/report?token=${token}`), e)).json();
  assert.equal(json.ok, true);
  assert.equal(json.report.identity.display_id, c.display_id);

  const viewRes = await worker.fetch(new Request(`https://x/report/view?token=${token}`), e);
  assert.equal(viewRes.headers.get("content-type"), "text/html; charset=utf-8");
  const html = await viewRes.text();
  assert.match(html, /Education Report/);
  assert.match(html, /Calculated next steps/);
  assert.ok(html.includes(c.display_id));

  const qrRes = await worker.fetch(new Request(`https://x/report/qr?token=${token}`), e);
  assert.equal(qrRes.headers.get("content-type"), "image/svg+xml; charset=utf-8");
  assert.match(await qrRes.text(), /^<svg/);

  // share creation is admin-gated
  const noAuth = await worker.fetch(new Request("https://x/report/share", {
    method: "POST", body: JSON.stringify({ display_id: c.display_id }),
  }), e);
  assert.equal(noAuth.status, 401);

  // revoke -> public view now 404
  await worker.fetch(new Request(`https://x/report/share?token=${token}`, { method: "DELETE", headers: A }), e);
  const after = await worker.fetch(new Request(`https://x/report/view?token=${token}`), e);
  assert.equal(after.status, 404);
});

test("WhatsApp: a citizen self-issues their report link", async () => {
  const e = env();
  await learner(e, "+50677777777");
  const out = await handleWhatsApp(e, {
    entry: [{ changes: [{ value: { contacts: [{ lang: "en" }], messages: [{ from: "+50677777777", text: { body: "report" } }] } }] }],
  });
  assert.match(out, /report\/view\?token=/);
  assert.match(out, /report\/qr\?token=/);
});
