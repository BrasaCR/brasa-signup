// report.js — the citizen's verifiable Education Report Card and its QR share.
//
// The old model: an employer phones the school to confirm a single degree. The
// BRASA model: the citizen presents a QR code. Scanning it opens a report that
// shows — cryptographically verified against the published Stiftung root key —
// the citizen's identity and assurance level, every credential they hold, their
// full learning history (what they have completed and what they are doing now),
// and calculated next steps. Verification needs no call to anyone.
//
// Privacy is citizen-controlled: a report is only reachable through a capability
// token the citizen issues (it expires and is revocable). The token cannot be
// guessed and does not let anyone enumerate citizens by handle. The minimal
// public check (/verify by handle) still exists; the full portfolio does not
// leave the citizen's hands without their share.

import { verifyChain } from "./sign.js";
import { hmacMsisdn } from "./crypto.js";
import qrcode from "./vendor/qrcode.cjs";
import * as db from "./db.js";

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;   // a share lasts a week by default

// --- QR ---------------------------------------------------------------------

export function qrSvg(text, { cellSize = 4, margin = 2 } = {}) {
  const qr = qrcode(0, "M");          // type 0 = auto-size, error correction M
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize, margin, scalable: true });
}

// --- Calculated next steps --------------------------------------------------
// A transparent, rule-based progression map over BRASA subjects. Not a black
// box: every suggestion carries the reason it was produced.

const PROGRESSION = {
  mathematics: ["Statistics", "Physics", "Data Science"],
  statistics: ["Data Science", "Machine Learning"],
  "data science": ["Machine Learning", "Artificial Intelligence"],
  programming: ["Computer Science", "Algorithms", "Web Development"],
  "computer science": ["Algorithms", "Artificial Intelligence"],
  "artificial intelligence": ["Machine Learning", "Robotics"],
  biology: ["Chemistry", "Health Sciences"],
  chemistry: ["Biology", "Medicine"],
  physics: ["Engineering", "Mathematics"],
  engineering: ["Physics", "Robotics"],
  english: ["Literature", "Communication"],
  economics: ["Finance", "Statistics"],
  finance: ["Economics", "Accounting"],
  history: ["Political Science", "Philosophy"],
  health: ["Health Sciences", "Medicine"],
};
const FOUNDATIONS = ["Mathematics", "English", "Programming"];

const norm = s => (s || "").trim().toLowerCase();

export function recommendNext(thread) {
  const completed = new Set();   // certified/attested subjects (lowercased)
  const active = new Set();      // subjects with lessons/referrals
  for (const e of thread) {
    if (!e.subject) continue;
    if (e.kind === "certification" || e.kind === "attestation") completed.add(norm(e.subject));
    else active.add(norm(e.subject));
  }

  const out = [];
  const seen = new Set();
  const push = (subject, reason) => {
    const k = norm(subject);
    if (!k || completed.has(k) || seen.has(k)) return;
    seen.add(k);
    out.push({ subject, reason });
  };

  // 1) Finish what you started: active subjects not yet certified.
  for (const s of active) {
    if (!completed.has(s)) push(titleCase(s), "in progress — earn the certification to complete it");
  }
  // 2) Advance from what you have mastered.
  for (const s of completed) {
    for (const next of PROGRESSION[s] || []) push(next, `builds on your completed ${titleCase(s)}`);
  }
  // 3) If there is nothing yet, suggest foundations.
  if (out.length === 0) for (const f of FOUNDATIONS) push(f, "a strong place to begin");

  return out.slice(0, 5);
}

const titleCase = s => (s || "").replace(/\b\w/g, c => c.toUpperCase());

// --- Report assembly --------------------------------------------------------

export async function buildReport(env, govId) {
  const c = await db.getCitizenByGovId(env, govId);          // gov_id, display_id, status, loa
  if (!c) return null;

  // Credentials, each verified against the chain (the "degrees").
  const creds = await db.getCredentialsByGov(env, govId);
  const credentials = [];
  for (const cr of creds) {
    const key = await db.getSigningKey(env, cr.key_id);
    const chk = await verifyChain(env.ROOT_PUBLIC_KEY, key, cr);
    credentials.push({
      credential: cr.credential, std_version: cr.std_version, issued_at: cr.issued_at,
      verified: chk.valid, ...(chk.valid ? {} : { reason: chk.reason }),
    });
  }

  // Learning history, split into completed vs. currently in progress.
  const thread = await db.getThreadByGov(env, govId);
  const completedSubjects = new Set(
    thread.filter(e => e.kind === "certification" || e.kind === "attestation").map(e => norm(e.subject)),
  );
  const completed = thread
    .filter(e => e.kind === "certification" || e.kind === "attestation")
    .map(e => ({ kind: e.kind, subject: e.subject, provider: e.provider, detail: e.detail, at: e.ts }));
  const in_progress = thread
    .filter(e => (e.kind === "native_lesson" || e.kind === "referral") && !completedSubjects.has(norm(e.subject)))
    .map(e => ({ kind: e.kind, subject: e.subject, provider: e.provider, detail: e.detail, at: e.ts }));

  return {
    identity: {
      display_id: c.display_id,
      status: c.status,
      loa: c.loa,
      identity_verified_in_person: (c.loa || 1) >= 3,   // attested at an ABC campus
    },
    credentials,
    education: { completed, in_progress },
    next_steps: recommendNext(thread),
    note: "Verified against the BRASA Stiftung root key. No call to any school is required.",
  };
}

// --- Capability shares (the QR token) ---------------------------------------

function randomToken() {
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  return [...b].map(x => x.toString(16).padStart(2, "0")).join("");
}

async function createShare(env, govId, ttl_ms = DEFAULT_TTL_MS) {
  const now = Date.now();
  const token = randomToken();
  await db.insertShare(env, { token, gov_id: govId, created_at: now, expires_at: now + ttl_ms, status: "active" });
  return { ok: true, token, expires_at: now + ttl_ms };
}

export async function createShareByDisplayId(env, displayId, ttl_ms) {
  const c = await db.getFullByDisplayId(env, displayId);
  if (!c) return { ok: false, reason: "not_found" };
  return createShare(env, c.gov_id, ttl_ms);
}

export async function createShareByPhone(env, msisdn, ttl_ms) {
  const hmac = await hmacMsisdn(msisdn, env.MSISDN_PEPPER);
  const c = await db.findByMsisdnHmac(env, hmac);
  if (!c) return { ok: false, reason: "no_account" };
  return createShare(env, c.gov_id, ttl_ms);
}

export async function revokeShare(env, token) {
  const s = await db.getShare(env, token);
  if (!s) return { ok: false, reason: "not_found" };
  await db.revokeShare(env, token);
  return { ok: true };
}

// Resolve a token to a live report, enforcing expiry/revocation.
export async function getReportByToken(env, token) {
  const s = await db.getShare(env, token);
  if (!s) return { ok: false, reason: "not_found" };
  if (s.status !== "active") return { ok: false, reason: "revoked" };
  if (s.expires_at < Date.now()) return { ok: false, reason: "expired" };
  const report = await buildReport(env, s.gov_id);
  if (!report) return { ok: false, reason: "not_found" };
  return { ok: true, expires_at: s.expires_at, report };
}

// --- Employer-facing HTML view ----------------------------------------------

export function renderReportHtml(report, { expires_at } = {}) {
  const r = report;
  const esc = s => String(s ?? "").replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  const verifiedBadge = r.identity.identity_verified_in_person
    ? `<span class="badge ok">Identity verified in person at an ABC campus (LoA 3)</span>`
    : `<span class="badge">Assurance level ${esc(r.identity.loa)}</span>`;
  const creds = r.credentials.length
    ? r.credentials.map(c => `<li>${esc(c.credential)} <small>(${esc(c.std_version)})</small> ${c.verified ? '<span class="ok">✓ cryptographically verified</span>' : '<span class="bad">✗ not verified</span>'}</li>`).join("")
    : "<li class=muted>No credentials yet.</li>";
  const done = r.education.completed.length
    ? r.education.completed.map(e => `<li><b>${esc(e.subject || e.kind)}</b> <small>${esc(e.provider || "")}</small> — ${esc(e.detail || e.kind)}</li>`).join("")
    : "<li class=muted>None recorded.</li>";
  const doing = r.education.in_progress.length
    ? r.education.in_progress.map(e => `<li><b>${esc(e.subject || e.kind)}</b> <small>${esc(e.provider || "")}</small> — ${esc(e.detail || e.kind)}</li>`).join("")
    : "<li class=muted>Nothing in progress.</li>";
  const steps = r.next_steps.length
    ? r.next_steps.map(s => `<li><b>${esc(s.subject)}</b> — <span class=muted>${esc(s.reason)}</span></li>`).join("")
    : "<li class=muted>—</li>";
  const exp = expires_at ? `<p class=muted>This shared report expires ${new Date(expires_at).toISOString().slice(0, 10)}.</p>` : "";

  return `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>BRASA Education Report — ${esc(r.identity.display_id)}</title>
<style>
:root{--ink:#1B1A17;--cream:#FAF6EF;--accent:#8C3A1F;--line:#E6DECF}
*{box-sizing:border-box}body{margin:0;background:var(--cream);color:var(--ink);font:16px/1.5 Geist,system-ui,sans-serif}
.wrap{max-width:760px;margin:0 auto;padding:32px 20px}
h1{font-family:Fraunces,Georgia,serif;font-size:28px;margin:.2em 0}
h2{font-family:Fraunces,Georgia,serif;font-size:18px;margin:1.4em 0 .4em;border-bottom:1px solid var(--line);padding-bottom:.2em}
ul{margin:.3em 0;padding-left:1.1em}li{margin:.25em 0}
small{color:#6b6357}.muted{color:#6b6357}.ok{color:#2e7d32;font-weight:600}.bad{color:#b3261e;font-weight:600}
.badge{display:inline-block;background:#efe7d8;border:1px solid var(--line);border-radius:999px;padding:.2em .7em;font-size:13px}
.badge.ok{background:#e7f3e8;border-color:#bcdcbd;color:#2e7d32}
.id{font-family:ui-monospace,monospace;font-size:15px}
header{border-bottom:2px solid var(--accent);padding-bottom:12px}
footer{margin-top:28px;border-top:1px solid var(--line);padding-top:12px;color:#6b6357;font-size:13px}
</style>
<div class=wrap>
<header>
<h1>BRASA Education Report</h1>
<div class=id>${esc(r.identity.display_id)} · ${esc(r.identity.status)}</div>
<div style="margin-top:8px">${verifiedBadge}</div>
</header>
<h2>Credentials</h2><ul>${creds}</ul>
<h2>Completed</h2><ul>${done}</ul>
<h2>Currently studying</h2><ul>${doing}</ul>
<h2>Calculated next steps</h2><ul>${steps}</ul>
${exp}
<footer>${esc(r.note)}</footer>
</div>`;
}
