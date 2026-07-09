# Free signup + phone/DOB identity — implementation plan

The business software is **free**. The signup card mints a **BRASA ID = phone + date of birth**,
with no trial and no payment. This package is **Stage 1** (ship now). **Stage 2** unifies the
USSD/WhatsApp rails onto the same phone+DOB anchor and is specified below for you to green-light.

---

## Stage 1 — free web signup (in this package, safe to ship)

**Backend (`brasa-signup`), files included here under `src/`:**

- `src/crypto.js` — adds `hmacAnchor(phone, dob, pepper)` plus `normPhone`/`normDob`. The web
  anchor is `HMAC(normPhone|normDob)`. Existing `hmacMsisdn` (phone-only) is untouched, so the
  USSD/WhatsApp rails keep working exactly as before.
- `src/issue.js` — adds `issueGovIdWeb(env, phone, dob, lang)` and `myGovIdWeb`. New web citizens
  are minted **`active`** (no trial/provisional gate). `name` is never persisted (minimal data).
- `src/index.js` — adds a public **`POST /signup`** route (+ `OPTIONS` preflight) and CORS from a
  new `CONTRIBUTE_ORIGINS` var. Request `{ phone, dob }` → `{ ok, display_id, existing }`.

**Config:** set `CONTRIBUTE_ORIGINS` in `wrangler.toml` (or the dashboard), e.g.
`CONTRIBUTE_ORIGINS = "https://brasa.business,https://www.brasa.business"`. Test on the deployed
site, not a local file/preview URL.

**Front end (`brasa-business`):** `business-how-to-begin.html` is already rewired (single
`joinStart()` → `/signup`, no trial/activate, no SINPE step). For every vertical hero card
(Restaurant, Retail, Delivery, …), drop in `signup-card.snippet.html`: replace the old join-card
markup and swap the old signup `<script>` block for the one in the snippet. They all share the
same block, so it is a single find/replace per page.

**Retired:** `JOIN_CODE`, the `CONTRIB`/`CONTRIB-TEST` gate, and the `/trial/*` calls
(which were never implemented server-side anyway).

---

## Stage 2 — phone+DOB as the ONE anchor across every channel (needs your go)

Today USSD and WhatsApp resolve a citizen by `HMAC(phone)` only. For a web-minted citizen and a
USSD-minted citizen to be the **same** person, DOB must be part of the anchor on every channel.
That means collecting DOB on every identity operation:

- `crypto.js` — callers switch from `hmacMsisdn(phone)` to `hmacAnchor(phone, dob)`.
- `issue.js` / `auth.js` / `recover.js` — thread `dob` through `issueGovId`, `myGovId`,
  `accountState`, `setPin`, `changePin`, `authenticate`, and the recovery rebind/cancel lookups.
- `ussd.js` — add a **DOB prompt** to: Get GovID, My GovID, PIN, Recover, Pay.
- `whatsapp.js` — accept DOB in the one-shot commands (e.g. `start <dob>`, `recover <GovID> <dob> <pin>`).
- `i18n.js` — new "enter date of birth" strings per language.
- `test/` — update the flow/auth/recovery suites to pass DOB.

**Consequence to accept:** every USSD/WhatsApp interaction gains a date-of-birth step, and the
anchor formula changes — so Stage 2 must land **before real citizens exist** (changing the hash
input invalidates any anchors already stored).

**Interim (Stage 1 only):** web mints on phone+DOB; USSD/WhatsApp still mint on phone-only. Until
Stage 2 ships, do not rely on the same person resolving across web and the phone rails.

---

## Before deploy

1. `npm test` (add DOB cases when Stage 2 lands).
2. Set `CONTRIBUTE_ORIGINS`.
3. `npm run deploy`.
4. Smoke test: `curl -X POST https://brasa-signup.<...>.workers.dev/signup -H 'content-type: application/json' -d '{"phone":"+50688889999","dob":"1990-05-01"}'` → `{ ok:true, display_id:"BRA-..." }`.
