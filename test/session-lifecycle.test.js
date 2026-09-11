import assert from 'node:assert/strict';
import test from 'node:test';
import { exchangeInvitation, logoutSession, renewSession } from '../src/session-lifecycle.js';

function queuedDb(firsts = [], runs = []) {
  const calls = [];
  return { calls, prepare: (sql) => ({ bind: (...values) => ({
    first: async () => firsts.shift() || null,
    run: async () => runs.shift() || { meta: { changes: 1 } },
    sql, values
  }) }) };
}
const invitation = 'abcdefghijklmnopqrstuvwxyz_ABCD-1234567890';

test('one-time invitation exchange issues an opaque bounded session', async () => {
  const db = queuedDb([{ id: 'invite-1', displayId: 'BRA-DYNAMIC-ADMIN', assuranceLevel: 2 }], [{ meta: { changes: 1 } }, { meta: { changes: 1 } }]);
  const response = await exchangeInvitation(new Request('https://identity/api/session/exchange', { method: 'POST', body: JSON.stringify({ invitation_code: invitation }) }), { IDENTITY_DB: db });
  const result = await response.json();
  assert.equal(response.status, 201); assert.equal(result.display_id, 'BRA-DYNAMIC-ADMIN'); assert.match(result.access_token, /^[A-Za-z0-9_-]{64}$/); assert.ok(result.expires_in <= 900);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('renewal rotates the active token inside its absolute family lifetime', async () => {
  const row = { id: 'session-1', displayId: 'BRA-DYNAMIC-ADMIN', assuranceLevel: 2, familyId: 'family-1', familyExpiresAt: '2099-01-01T00:00:00.000Z' };
  const db = queuedDb([row], [{ meta: { changes: 1 } }, { meta: { changes: 1 } }]);
  const response = await renewSession(new Request('https://identity/api/session/renew', { method: 'POST', headers: { authorization: `Bearer ${invitation}` } }), { IDENTITY_DB: db });
  const result = await response.json(); assert.equal(response.status, 200); assert.match(result.access_token, /^[A-Za-z0-9_-]{64}$/); assert.notEqual(result.access_token, invitation);
});

test('logout is idempotent and reveals no session state', async () => {
  const db = queuedDb([], [{ meta: { changes: 1 } }]);
  const response = await logoutSession(new Request('https://identity/api/session/logout', { method: 'POST', headers: { authorization: `Bearer ${invitation}` } }), { IDENTITY_DB: db });
  assert.deepEqual(await response.json(), { ok: true }); assert.equal(response.headers.get('cache-control'), 'no-store');
});
