# Education session boundary

`GET /api/education/school-platform` accepts a bearer session and returns only its BRASA display ID, assurance level, expiry, and fixed Education audience. Tokens are stored only as SHA-256 hashes. Sessions are audience-bound, expiring, and revocable; every failure returns the same non-disclosing error. Responses are never cacheable.

The narrow staging surface also provides the lifecycle used by the school administrator page:

- `POST /api/session/exchange` consumes a one-time invitation and issues an opaque access token.
- `POST /api/session/renew` rotates a valid access token and revokes its predecessor.
- `POST /api/session/logout` revokes the presented access token and is safe to repeat.

Access tokens expire after 15 minutes and cannot be renewed beyond their eight-hour session-family lifetime. Invitation and access-token secrets are generated with cryptographic randomness, shown only to their intended holder, and stored only as SHA-256 hashes. Request bodies are size-limited and database inputs are bound parameters.

The staging Worker and D1 database are independent from production GovID. No production identity rows, phone anchors, dates of birth, credentials, activity, or recovery records are copied. Education consumes this endpoint through a Worker service binding and performs school-role authorization in its own database.

Invitation provisioning remains an operator action: create a random one-time code, store only its hash with the Education audience and expiry, and separately grant the matching display ID a school role in Education. The administrator receives the raw code once. The browser keeps the resulting access token in page memory only; explicit logout revokes it.

The staging entry point intentionally exposes only `/health`, the three session lifecycle routes, and `/api/education/school-platform`; all broader Signup, verification, payment, credential, and messaging routes return 404.
