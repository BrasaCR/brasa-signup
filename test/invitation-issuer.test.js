import assert from 'node:assert/strict';
import test from 'node:test';
import { issueInvitation } from '../src/session-lifecycle.js';

function database(observed) { return { prepare: sql => ({ bind: (...values) => ({ run: async () => { observed.push({ sql, values }); return { meta: { changes: 1 } }; } }) }) }; }
const request = (secret, body = {}) => new Request('https://identity/internal/education/invitations', { method: 'POST', headers: { 'content-type': 'application/json', 'x-brasa-service-authorization': secret }, body: JSON.stringify(body) });

test('trusted Education service receives a one-time invitation', async () => {
  const secret = 's'.repeat(64), observed = [], response = await issueInvitation(request(secret, { display_id: 'BRA-TEACHER-12345', assurance_level: 2 }), { IDENTITY_DB: database(observed), EDUCATION_ISSUER_SECRET: secret });
  const result = await response.json(); assert.equal(response.status, 201); assert.equal(result.display_id, 'BRA-TEACHER-12345'); assert.equal(result.invitation_code.length, 64);
  assert.notEqual(observed[0].values[1], result.invitation_code); assert.equal(observed[0].values[1].length, 64);
});

test('invitation issuance fails closed without the service secret', async () => {
  for (const secret of ['', 'wrong'.repeat(16)]) {
    const response = await issueInvitation(request(secret, { display_id: 'BRA-TEACHER-12345' }), { IDENTITY_DB: database([]), EDUCATION_ISSUER_SECRET: 'right'.repeat(16) });
    assert.equal(response.status, 401); assert.deepEqual(await response.json(), { error: 'service_authorization_required' });
  }
});
