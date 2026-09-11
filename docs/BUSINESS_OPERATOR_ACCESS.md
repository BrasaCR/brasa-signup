# Business operator Access boundary

BRASA Identity can require a Cloudflare Access assertion in addition to the one-time operator invitation. The assertion is read only from `Cf-Access-Jwt-Assertion`; Identity validates its RS256 signature against the team JWKS, exact issuer, application audience, expiry, and stable subject. The first successful exchange binds that Access subject to one BRASA operator display ID. A subject cannot move to another operator, and another subject cannot take over an existing binding.

Staging currently sets only `OPERATOR_ACCESS_REQUIRED=false`, preserving the tested invitation workflow. It does not claim phishing resistance and production remains blocked.

Before enabling this boundary:

1. Create a dedicated Cloudflare Access self-hosted application for the operator routes.
2. Configure its allow policy to require the approved phishing-resistant authentication method. Ordinary email OTP or generic MFA is insufficient.
3. Test the policy with two authorized operators and confirm recovery cannot bypass the phishing-resistant requirement.
4. Set `OPERATOR_ACCESS_TEAM_DOMAIN` to the exact `https://<team>.cloudflareaccess.com` issuer and `OPERATOR_ACCESS_AUD` to that application's audience tag.
5. Only after an independent policy review, set `OPERATOR_ACCESS_ASSURANCE=phishing-resistant` and `OPERATOR_ACCESS_REQUIRED=true` together.
6. Deploy Identity first, then Business, and repeat the named-operator lifecycle smoke test.

If the assertion is missing, malformed, signed by an unknown key, issued by another team, intended for another application, expired, or has an invalid subject, exchange fails closed. If Access is required but any configuration or assurance attestation is missing, exchange also fails closed.

The Access JWT and email claim are never persisted. Identity stores only the stable Access subject binding and copies that opaque subject into the short-lived session record so later administrative actions can be attributed to the authenticated actor.
