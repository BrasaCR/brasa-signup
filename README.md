# BRASA GovID System — `brasa-signup`

Sovereign citizen identity for BRASA, on Cloudflare Workers + the `brasa-citizens` D1 database, delivered over Africa's Talking USSD and WhatsApp Business.

This repo is **all six phases (0–6)** of the design spec *How to Build the BRASA GovID System*: foundations, issuance, authentication & recovery, credential binding, platform integration, and **in-person LoA-3 verification at ABC campuses**. It mints a GovID, prevents duplicates, lets a citizen retrieve their own, set/change a PIN (LoA 2), recover onto a new phone with a SIM-swap cool-down, issues BRASA Standard credentials cryptographically bound to a GovID, lets anyone verify a GovID and its credentials offline against the published Stiftung root key, and ties the rest of the platform — the content-free CDR, the 21-rights menu, the non-custodial SINPE payment registry, and the education thread — to the GovID as the single join key.

## What a GovID is

- **Canonical key** — a time-ordered UUIDv7, the join key across every BRASA system. Never shown.
- **Display handle** — `BRA-XXXXX-XXXXX-C` in Crockford Base32 with a mod-37 check symbol. Readable aloud over a phone; the check symbol catches typos and transpositions offline, before any lookup.
- The GovID is an **identifier, not a secret** — safe to share. It is the operational form of the constitutional right to Identity.

## Design guarantees (enforced in code)

- **No plaintext phone numbers.** Only `HMAC-SHA256(phone, pepper)` is stored; the live number exists only in the carrier/webhook event.
- **Minimal data.** No name or email required. Activity (CDR) is content-free and keyed on the GovID.
- **One human, one identity** by phone anchor (LoA 1), upgradeable to PIN (LoA 2) and in-person (LoA 3).
- **Language is a session parameter** — the USSD/WhatsApp layer supplies it; the Worker never detects language.
- **Inbound-only** — an identity is minted when a citizen reaches in.

## Layout

```
src/
  index.js       Worker entry — routes /ussd, /whatsapp, /verify, /credential, /keys, /credentials/issue, /health
  govid.js       UUIDv7, Base32 display handle, mod-37 check symbol  (pure)
  crypto.js      MSISDN HMAC, PIN hashing/verify (Web Crypto)
  sign.js        Ed25519 keys, signing, and credential chain verification
  db.js          D1 access for brasa-citizens
  issue.js       channel-independent issuance + lookup
  auth.js        PIN set/change + returning-citizen authentication (LoA 2)
  recover.js     number-rebind recovery with SIM-swap cool-down
  credentials.js issue + list BRASA Standard credentials bound to a GovID
  rights.js      the 21 constitutional rights (4 clusters) + module LoA map
  session.js     module router — resolve GovID, enforce LoA, write the CDR
  payments.js    non-custodial multi-rail registry (85 rails worldwide; catalog in paymethods.js)
  education.js   persistent learning thread keyed on the GovID
  ussd.js        Africa's Talking USSD adapter
  whatsapp.js    WhatsApp Business (Cloud API) adapter
  verify.js      public verifier (identity + credential chain)
  campus.js      Phase 5 — ABC-campus registry + in-person LoA-3 verification & recovery
  metrics.js     Phase 6 — aggregate, content-free OpenLedger metrics
  report.js      Education Report Card — verifiable portfolio + QR capability sharing
  vendor/qrcode.cjs  vendored QR generator (kazuhikoarase, MIT) — dependency-free
  paymethods.js  rail catalog (one entry per rail; drives rendering + instructions)
  i18n.js        canonical message strings (English) + the pay renderer
scripts/
  keygen.js      Stiftung key ceremony — root + intermediate keys, cert, deploy output
schema.sql       D1 migration (citizens, cdr, id_events, recoveries, signing_keys, credentials, payments, learning_thread, pay_destinations, campuses, officers, verifications, report_shares)
wrangler.toml    Worker + D1 binding + vars/secrets
test/            node:test suites (govid, crypto, flow, auth, recovery, sign, credentials, integration, platform, ussd_pay, catalog, whatsapp_pay, phase5, phase6, report)
```

USSD menu: 1 Get GovID · 2 My GovID · 3 PIN · 4 Recover · **5 Pay** ·
9 Cancel recovery (shown only when a recovery is pending).

### Payments are multi-rail and non-custodial

BRASA never holds or moves money. Paying over USSD resolves a **verified
destination** by pay code and returns instructions on its rail; the citizen
authorises the transfer in their own wallet/bank.

| Rail | Region | Destination | Instruction |
|------|--------|-------------|-------------|
| `sinpe` | Costa Rica / Latam | SINPE code | Pay by SINPE; BCCR settles to the owner |
| `pix`   | Brazil | Pix key (phone/email/CPF/random) | Pay by Pix; Central Bank of Brazil settles to the owner (key-based, no dial code) |
| `breb`  | Colombia | Bre-B key (llave) | Pay by Bre-B; Banco de la República settles to the owner (key-based, no dial code) |
| `yape`  | Peru | Yape number (phone) | Pay by Yape; BCP settles to the owner (number-based, no dial code) |
| `transfers3` | Argentina | Transferencias 3.0 alias (CVU/CBU) | Pay by Transferencias 3.0; BCRA-interoperable settlement to the owner (alias-based, no dial code) |
| `toke`  | Uruguay | Toke code (QR) | Pay by Toke; settles to the owner (code/QR-based, no dial code) |
| `spei`  | Mexico | CLABE (18-digit) | Pay by SPEI; Banco de México settles to the owner (CLABE-based, no dial code) |
| `upi`   | India | UPI ID / VPA (name@bank) | Pay by UPI; NPCI settles to the owner (VPA-based; feature-phone access via `*99#`) |
| `mpesa` | Kenya | Paybill (+account) or Till | Pay Bill / Buy Goods over M-Pesa via the AT rail |
| `momo`  | Rwanda, Uganda, Ghana, Côte d'Ivoire, … | MTN MoMo merchant code (+optional account) | Pay merchant over MTN Mobile Money; per-country dial code (`*182*8*1#`, `*165#`, …) |
| `airtel`| Kenya, Rwanda, Uganda, Tanzania, Zambia, … | Airtel Money merchant code (+optional account) | Pay merchant over Airtel Money; per-country dial code (`*334#`, `*185#`, …) |
| `orange`| Senegal, Côte d'Ivoire, Mali, Cameroon, … | Orange Money merchant code (+optional account) | Pay merchant over Orange Money; per-country dial code (`#144#`, `#150#`, …) |
| `tigo`  | Tanzania | Tigo Pesa (Mixx by Yas) merchant code (+optional account) | Pay merchant over Tigo Pesa; dial code (`*150*01#`) |
| `vodafone`| Egypt, Ghana | Vodafone Cash merchant code (+optional account) | Pay merchant over Vodafone Cash; per-country dial code (`*9#`, `*110#`, …) |
| `equitel`| Kenya | Equitel (Equity Bank) merchant/paybill code (+optional account) | Pay merchant over Equitel; dial code (`*247#`) |
| `tkash` | Kenya | T-Kash (Telkom Kenya) merchant code (+optional account) | Pay merchant over T-Kash; dial code (`*460#`) |
| `bkash` | Bangladesh | bKash merchant code (+optional account) | Pay merchant over bKash; dial code (`*247#`) |
| `jazzcash` | Pakistan | JazzCash merchant code (+optional account) | Pay merchant over JazzCash; dial code (`*786#`) |

Amounts are stored in integer minor units; currency comes from the destination
(`CRC`, `BRL`, `COP`, `PEN`, `ARS`, `UYU`, `MXN`, `INR`, `BDT`, `PKR`, `KES`, `RWF`, `UGX`, `TZS`, `XOF`, `XAF`, `EGP`, `GHS`, …). Register
destinations with `POST /destinations` (fields: `code, rail, country, account,
account_ref, dial_code, name, currency, verified`). The `dial_code` is optional
and lets one rail carry the correct country-specific USSD string. The `verified`
flag is the hard gate — an unverified destination is refused on every rail.

BRASA is owned by the citizens of the world and makes **no political or
sanctions-based exclusions** — every rail exists for every people. A rail with
no verified destination is simply dormant: it is fully set up and becomes
payable the moment a verified destination is registered, identically to any
other market. (Russia's SBP, for example, ships in the catalog but is dormant
until and unless destinations are verified — set up, not switched on.)

Both channels carry the pay flow. USSD: menu option 5 → pay code → amount.
WhatsApp: one-shot `pay <code> <amount>` (`pagar` also works), since WhatsApp is
stateless per message. Both resolve the destination, fail fast on unknown or
unverified codes, and render the identical instruction via the single
`payInstruction` call.

**85 rails** ship in the catalog, spanning every inhabited region — the
high-volume A2A rails (Pix, UPI, SINPE, SPEI, PromptPay, DuitNow, PayNow, QRIS,
SEPA Instant covering the eurozone, Faster Payments UK), the national instant
rails and wallets of the Americas, non-euro Europe, the Middle East, Asia-
Pacific and Oceania (PayShap, Raast, PayID/Osko, Interac, PayPay, Kakao Pay,
BLIK, Swish, TWINT, Vipps, MobilePay, Aani, Fawran, CliQ, BenefitPay, Kaspi,
Yappy, Pago Movil, Transfer365, and more), plus the African mobile-money
networks (M-Pesa, MTN MoMo, Airtel, Orange, Wave, telebirr, EcoCash, EVC Plus,
OPay, PalmPay, …). `src/paymethods.js` is the single source of truth; the rail
families and renderers are generic, so coverage scales by adding catalog rows.

Three-decimal currencies (BHD, JOD, KWD, OMR → 1000 minor units) and
no-subunit currencies (JPY, KRW, VND, etc. → 1) are handled by `src/money.js`.

### Adding a rail

Every rail is one entry in the catalog (`src/paymethods.js`) plus destinations
in the registry — no changes to `payments.js`, `i18n.js`, or `ussd.js`:

- **key family** (account-to-account, no dial code): `{ family: "key", brand,
  conn_en, conn_es, field }` — `conn_*` is the connector phrase ("to key" /
  "a la clave"), `field` is the structured-instruction key (kept stable for
  verifiers). Add the currency to `src/money.js` if new.
- **merchant family** (mobile-money, per-destination dial code): `{ family:
  "merchant", brand }`.
- **mpesa**: the Paybill/Till special case.

Two parameterized renderers in `i18n.js` (one per family) plus a
catalog-driven `buildInstruction` produce every rail's text and structured
instruction — the families are not hand-written per rail.

The recovery cool-down defaults to 24h; override per-environment with the
`RECOVERY_COOLDOWN_MS` var.

## Setup

```bash
npm install                 # dev dependency: wrangler
npm test                    # runs all unit + flow tests (no cloud needed)

# Phase 0 — create the tables
npm run db:init             # or db:init:local for a local D1

# Secrets (never commit)
wrangler secret put MSISDN_PEPPER
wrangler secret put WA_TOKEN
wrangler secret put WA_PHONE_ID
# and set WA_VERIFY_TOKEN in wrangler.toml or the dashboard

npm run dev                 # local
npm run deploy              # to Cloudflare
```

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/ussd` | Africa's Talking USSD (returns `CON`/`END` text) |
| GET/POST | `/whatsapp` | WhatsApp webhook verify (GET) + messages (POST) |
| GET | `/verify?id=BRA-XXXXX-XXXXX-C` | Identity status + bound credentials with chain validity |
| GET | `/credential?id=<cred_id>` | Verify one credential's signature chain |
| GET | `/keys` | Public key log — root public key + intermediate certs |
| POST | `/credentials/issue` | Admin (Bearer `ADMIN_TOKEN`) — issue a signed credential |
| GET | `/rights` | The 21 constitutional rights across 4 clusters |
| POST | `/module` | Trusted/admin — exercise a right/module; resolves GovID, enforces LoA, writes the CDR |
| POST | `/payments/register` | Admin — register a non-custodial SINPE payment reference |
| GET | `/payments?gov=<gov_id>` | Admin — list a citizen's payment references |
| POST | `/destinations` | Admin — register a verified SINPE pay-code destination |
| POST/GET | `/thread` | Admin — append to / read the education thread |
| POST | `/campuses` | Admin — register an ABC campus (verification point) |
| POST | `/officers` | Admin — register an authorized verifying officer at a campus |
| POST | `/verify-in-person` | Admin/officer — attest a citizen in person; raises them to LoA-3 |
| POST | `/recover-in-person` | Admin/officer — the no-PIN recovery path; rebind anchor + LoA-3 |
| GET | `/verifications?display_id=BRA-…` | Admin — a citizen's LoA-3 attestation chain |
| GET | `/metrics` | Public — aggregate, content-free GovID metrics for the OpenLedger |
| POST | `/report/share` | Admin/ABC kiosk — issue a capability share for a report; returns token + URLs |
| DELETE | `/report/share?token=…` | Admin — revoke a share |
| GET | `/report?token=…` | Public — the report card as JSON (capability-gated) |
| GET | `/report/view?token=…` | Public — the employer-facing HTML report card |
| GET | `/report/qr?token=…` | Public — SVG QR encoding the report view URL |
| GET | `/health` | Liveness |

## Credential chain & key ceremony

Trust runs **Stiftung root → intermediate signing key → credential**. Run the
ceremony once:

```bash
npm run keygen   # prints: ROOT_PUBLIC_KEY + SIGNING_KEY_ID (vars),
                 # the offline ROOT_PRIVATE_KEY (store air-gapped),
                 # the SIGNING_PRIVATE_KEY (wrangler secret put),
                 # and the signing_keys INSERT for the key log
```

The root private key never touches the Worker. Intermediates sign credentials;
anyone can verify a credential offline by checking the intermediate's root
certificate (`/keys`) and then the credential signature — no trust in the
database required.

## Tests

`npm test` covers: UUIDv7 well-formedness and time-ordering; display-handle round-trip over thousands of samples; check-symbol rejection of single-character errors and transpositions; Crockford alias/case normalization; HMAC determinism, pepper-dependence, and non-disclosure of the number; salted PIN hashing/verification; and the full issuance → dedupe → lookup → verify flow against an in-memory D1 mock (including a check that the plaintext number never lands in storage).

## LoA-3 in-person verification (Phase 5)

LoA ladder: **1** phone anchor → **2** PIN (knowledge) → **3** in-person proofed
at an ABC campus. An authorized officer at an active campus attests a citizen
face to face via `/verify-in-person`, which raises the GovID to LoA-3 and writes
an append-only attestation (who/where/how/when) to the `verifications` log. The
session router enforces it: a module declaring LoA-3 (e.g. `succession` — naming
an heir under the Generational law) returns `need_inperson` until the citizen is
verified, and the LoA-2 PIN step-up still composes on top. `/recover-in-person`
closes the no-PIN recovery gap: an officer rebinds the GovID to the phone of the
person physically present and grants LoA-3 in one step.

## OpenLedger metrics (Phase 6)

`GET /metrics` (public) returns the aggregate GovID metrics the OpenLedger
publishes via brasa-monitor: citizens issued and by status, the LoA-1/2/3
distribution, recoveries by status, credentials issued, in-person verifications,
total interactions, and languages served (distinct count + per-language). It is
computed entirely with `COUNT`/`GROUP BY` — **no GovID, phone number, or message
is read or exposed**, consistent with the content-free CDR. brasa-monitor polls
this endpoint and folds it into the public ledger alongside revenue.

## Education Report Card (verifiable QR portfolio)

Replaces the old "employer phones the school to confirm a degree" model. A
citizen issues a **QR code** (over WhatsApp with `report`, or printed at an ABC
campus). Scanning it opens a report — verified against the published Stiftung
root key — showing the citizen's identity and assurance level (including the
*verified in person at an ABC campus* badge), every credential they hold, their
full learning history split into **completed** and **currently studying**, and
**calculated next steps** (a transparent, rule-based progression over BRASA
subjects; each suggestion carries its reason). The employer verifies everything
by scanning — no call to any school.

Privacy is citizen-controlled: the report is reachable only through a capability
token the citizen issues. The token is opaque (unguessable), **expires** (a week
by default), and is **revocable**; it cannot be used to enumerate citizens by
handle. The minimal public check (`/verify` by handle) still returns only
identity + credentials; the full portfolio never leaves the citizen's hands
without their share. `GET /report/view?token=…` renders the employer-facing card;
`GET /report/qr?token=…` returns the SVG QR. QR generation is dependency-free
(vendored, MIT-licensed, in `src/vendor/`).

## Phases

All six phases of *How to Build the BRASA GovID System* are implemented:
foundations (0), issuance (1), authentication & recovery (2), credential binding
(3), platform integration (4), in-person LoA-3 verification at ABC campuses (5),
and aggregate OpenLedger metrics (6).

*Done: Phase 0 foundations, Phase 1 issuance, Phase 2 authentication & recovery, Phase 3 credential binding, Phase 4 platform integration (CDR, 21 rights, SINPE registry, education thread).*
*PIN hashing currently uses PBKDF2 (native to Workers); the stored-format prefix allows a clean migration to Argon2id once a WASM module is added.*

---
*BRASA CR Stiftung — The First Free World School.*
