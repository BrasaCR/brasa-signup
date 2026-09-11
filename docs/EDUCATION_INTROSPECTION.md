# Education session introspection

`GET /api/education/school-platform` accepts a bearer session and returns only its BRASA display ID, assurance level, expiry, and fixed Education audience. Tokens are stored only as SHA-256 hashes. Sessions are audience-bound, expiring, and revocable; every failure returns the same non-disclosing error. Responses are never cacheable.

The staging Worker and D1 database are independent from production GovID. No production identity rows, phone anchors, dates of birth, credentials, activity, or recovery records are copied. Education consumes this endpoint through a Worker service binding and performs school-role authorization in its own database.

The staging entry point intentionally exposes only `/health` and `/api/education/school-platform`; all broader Signup, verification, payment, credential, and messaging routes return 404.
