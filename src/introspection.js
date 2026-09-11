export const tokenPattern = /^[A-Za-z0-9_-]{32,256}$/;
export const noStore = { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' };
export const reply = (body, status) => new Response(JSON.stringify(body), { status, headers: noStore });

export async function tokenHash(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function bearerToken(request) {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  return tokenPattern.test(token) ? token : '';
}

export async function introspectEducationSession(request, env) {
  if (request.method !== 'GET') return reply({ error: 'method_not_allowed' }, 405);
  if (!env.IDENTITY_DB) return reply({ error: 'identity_database_unavailable' }, 503);
  const token = bearerToken(request);
  if (!token) return reply({ error: 'invalid_or_expired_session' }, 401);
  const row = await env.IDENTITY_DB.prepare("SELECT display_id AS displayId, assurance_level AS assuranceLevel, expires_at AS expiresAt FROM service_sessions WHERE token_hash = ? AND audience = 'brasa-education' AND revoked_at IS NULL AND expires_at > ? LIMIT 1").bind(await tokenHash(token), new Date().toISOString()).first();
  if (!row) return reply({ error: 'invalid_or_expired_session' }, 401);
  return reply({ display_id: row.displayId, assurance_level: row.assuranceLevel, expires_at: row.expiresAt, audience: 'brasa-education' }, 200);
}
