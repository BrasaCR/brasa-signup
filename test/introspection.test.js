import assert from 'node:assert/strict';
import test from 'node:test';
import { introspectEducationSession } from '../src/introspection.js';
import stagingWorker from '../src/identity-staging.js';

const token = 'abcdefghijklmnopqrstuvwxyz_ABCD-1234567890';
function database(row, observed) {
  return { prepare: (sql) => ({ bind: (...values) => ({ first: async () => { observed.push({ sql, values }); return row; } }) }) };
}

test('returns a minimal Education-scoped identity profile', async () => {
  const observed = [], row = { displayId: 'BRA-STAGING-TEACHER', assuranceLevel: 2, expiresAt: '2099-01-01T00:00:00.000Z' };
  const response = await introspectEducationSession(new Request('https://identity/api/education/school-platform', { headers: { authorization: `Bearer ${token}` } }), { IDENTITY_DB: database(row, observed) });
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { display_id: row.displayId, assurance_level: 2, expires_at: row.expiresAt, audience: 'brasa-education' });
  assert.match(observed[0].sql, /audience = 'brasa-education'/); assert.equal(observed[0].values[0].length, 64); assert.notEqual(observed[0].values[0], token);
});

test('rejects malformed, missing, expired, or revoked sessions without details', async () => {
  for (const authorization of ['', 'Bearer short', `Basic ${token}`]) {
    const response = await introspectEducationSession(new Request('https://identity/api/education/school-platform', { headers: { authorization } }), { IDENTITY_DB: database(null, []) });
    assert.equal(response.status, 401); assert.deepEqual(await response.json(), { error: 'invalid_or_expired_session' });
  }
  const response = await introspectEducationSession(new Request('https://identity/api/education/school-platform', { headers: { authorization: `Bearer ${token}` } }), { IDENTITY_DB: database(null, []) });
  assert.equal(response.status, 401); assert.deepEqual(await response.json(), { error: 'invalid_or_expired_session' });
});

test('fails closed without the isolated identity database', async () => {
  const response = await introspectEducationSession(new Request('https://identity/api/education/school-platform', { headers: { authorization: `Bearer ${token}` } }), {});
  assert.equal(response.status, 503);
});

test('staging Worker limits its surface to health and Education sessions', async () => {
  const health = await stagingWorker.fetch(new Request('https://identity/health'), {});
  assert.equal(health.status, 200); assert.equal((await health.json()).service, 'brasa-identity-staging');
  for (const path of ['/metrics', '/verify', '/signup', '/session', '/credentials/issue']) {
    const response = await stagingWorker.fetch(new Request(`https://identity${path}`), {});
    assert.equal(response.status, 404, path);
  }
});
