import { bearerToken, reply, tokenHash, tokenPattern } from './introspection.js';
const ACCESS_SECONDS = 900, FAMILY_SECONDS = 28800, MAX_BODY = 2048;

async function body(request) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BODY) return null;
  const text = await request.text(); if (text.length > MAX_BODY) return null;
  try { return JSON.parse(text); } catch { return null; }
}
export function opaqueToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(48));
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function serviceAuthorized(request, env) {
  const supplied = request.headers.get('x-brasa-service-authorization') || '', expected = env.EDUCATION_ISSUER_SECRET || '';
  if (supplied.length < 32 || expected.length < 32 || supplied.length !== expected.length) return false;
  const encoder = new TextEncoder(), left = encoder.encode(supplied), right = encoder.encode(expected);
  if (typeof crypto.subtle.timingSafeEqual === 'function') return crypto.subtle.timingSafeEqual(left, right);
  let difference = 0; for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function issueInvitation(request, env) {
  if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
  if (!env.IDENTITY_DB) return reply({ error: 'identity_database_unavailable' }, 503);
  if (!(await serviceAuthorized(request, env))) return reply({ error: 'service_authorization_required' }, 401);
  const input = await body(request), displayId = String(input?.display_id || '').trim().toUpperCase(), assuranceLevel = Number(input?.assurance_level || 1);
  const lifetime = Math.min(604800, Math.max(900, Number(input?.expires_in || 86400)));
  if (!/^BRA-[A-Z0-9-]{5,40}$/.test(displayId) || !Number.isInteger(assuranceLevel) || assuranceLevel < 1 || assuranceLevel > 3) return reply({ error: 'invalid_invitation' }, 400);
  const code = opaqueToken(), now = new Date(), expiresAt = new Date(now.getTime() + lifetime * 1000).toISOString();
  await env.IDENTITY_DB.prepare('INSERT INTO session_invitations (id, code_hash, display_id, audience, assurance_level, expires_at, consumed_at, created_at) VALUES (?,?,?,?,?,?,NULL,?)').bind(crypto.randomUUID(), await tokenHash(code), displayId, 'brasa-education', assuranceLevel, expiresAt, now.toISOString()).run();
  return reply({ invitation_code: code, display_id: displayId, audience: 'brasa-education', expires_at: expiresAt }, 201);
}
async function insertSession(env, profile, familyId, familyExpiresAt, rotatedFrom = null) {
  const token = opaqueToken(), now = new Date(), expires = new Date(Math.min(now.getTime() + ACCESS_SECONDS * 1000, Date.parse(familyExpiresAt)));
  await env.IDENTITY_DB.prepare('INSERT INTO service_sessions (id, token_hash, display_id, audience, assurance_level, expires_at, revoked_at, created_at, family_id, family_expires_at, rotated_from) VALUES (?,?,?,?,?,?,NULL,?,?,?,?)').bind(crypto.randomUUID(), await tokenHash(token), profile.displayId, 'brasa-education', profile.assuranceLevel, expires.toISOString(), now.toISOString(), familyId, familyExpiresAt, rotatedFrom).run();
  return { access_token: token, token_type: 'Bearer', expires_in: Math.max(0, Math.floor((expires.getTime() - now.getTime()) / 1000)), expires_at: expires.toISOString() };
}

export async function exchangeInvitation(request, env) {
  if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
  if (!env.IDENTITY_DB) return reply({ error: 'identity_database_unavailable' }, 503);
  const input = await body(request), code = String(input?.invitation_code || '');
  if (!tokenPattern.test(code)) return reply({ error: 'invalid_or_expired_invitation' }, 401);
  const hash = await tokenHash(code), now = new Date(), row = await env.IDENTITY_DB.prepare("SELECT id, display_id AS displayId, assurance_level AS assuranceLevel FROM session_invitations WHERE code_hash=? AND audience='brasa-education' AND consumed_at IS NULL AND expires_at>?").bind(hash, now.toISOString()).first();
  if (!row) return reply({ error: 'invalid_or_expired_invitation' }, 401);
  const claimed = await env.IDENTITY_DB.prepare('UPDATE session_invitations SET consumed_at=? WHERE id=? AND consumed_at IS NULL').bind(now.toISOString(), row.id).run();
  if (!claimed.meta?.changes) return reply({ error: 'invalid_or_expired_invitation' }, 401);
  const familyId = crypto.randomUUID(), familyExpiresAt = new Date(now.getTime() + FAMILY_SECONDS * 1000).toISOString();
  return reply({ ...(await insertSession(env, row, familyId, familyExpiresAt)), display_id: row.displayId, assurance_level: row.assuranceLevel }, 201);
}

async function activeSession(request, env) {
  const token = bearerToken(request); if (!token) return null;
  const hash = await tokenHash(token), now = new Date().toISOString();
  const row = await env.IDENTITY_DB.prepare("SELECT id, display_id AS displayId, assurance_level AS assuranceLevel, family_id AS familyId, family_expires_at AS familyExpiresAt FROM service_sessions WHERE token_hash=? AND audience='brasa-education' AND revoked_at IS NULL AND expires_at>? AND family_expires_at>?").bind(hash, now, now).first();
  return row ? { row, hash } : null;
}
export async function renewSession(request, env) {
  if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
  if (!env.IDENTITY_DB) return reply({ error: 'identity_database_unavailable' }, 503);
  const current = await activeSession(request, env); if (!current) return reply({ error: 'invalid_or_expired_session' }, 401);
  const revokedAt = new Date().toISOString(), revoked = await env.IDENTITY_DB.prepare('UPDATE service_sessions SET revoked_at=? WHERE id=? AND revoked_at IS NULL').bind(revokedAt, current.row.id).run();
  if (!revoked.meta?.changes) return reply({ error: 'invalid_or_expired_session' }, 401);
  return reply(await insertSession(env, current.row, current.row.familyId, current.row.familyExpiresAt, current.row.id), 200);
}
export async function logoutSession(request, env) {
  if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
  if (!env.IDENTITY_DB) return reply({ error: 'identity_database_unavailable' }, 503);
  const token = bearerToken(request); if (token) await env.IDENTITY_DB.prepare("UPDATE service_sessions SET revoked_at=? WHERE token_hash=? AND audience='brasa-education' AND revoked_at IS NULL").bind(new Date().toISOString(), await tokenHash(token)).run();
  return reply({ ok: true }, 200);
}
