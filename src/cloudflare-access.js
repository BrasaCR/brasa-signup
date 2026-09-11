import { createRemoteJWKSet, jwtVerify } from 'jose';

const assertionPattern = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export function accessConfigured(env) {
  return env.OPERATOR_ACCESS_REQUIRED === 'true' && env.OPERATOR_ACCESS_ASSURANCE === 'phishing-resistant' && /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/i.test(env.OPERATOR_ACCESS_TEAM_DOMAIN || '') && typeof env.OPERATOR_ACCESS_AUD === 'string' && env.OPERATOR_ACCESS_AUD.length >= 20;
}

export async function verifyOperatorAccess(request, env, dependencies = {}) {
  const required = env.OPERATOR_ACCESS_REQUIRED === 'true';
  const assertion = request.headers.get('cf-access-jwt-assertion') || '';
  if (!assertion && !required) return { assurance: 'invitation', subject: null };
  if (!assertionPattern.test(assertion)) throw new Error('operator_access_required');
  if (!accessConfigured(env)) throw new Error('operator_access_misconfigured');
  const verify = dependencies.jwtVerify || jwtVerify;
  const createKeys = dependencies.createRemoteJWKSet || createRemoteJWKSet;
  const { payload } = await verify(assertion, createKeys(new URL(`${env.OPERATOR_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`)), {
    issuer: env.OPERATOR_ACCESS_TEAM_DOMAIN,
    audience: env.OPERATOR_ACCESS_AUD,
    algorithms: ['RS256']
  });
  if (typeof payload.sub !== 'string' || payload.sub.length < 8 || payload.sub.length > 200) throw new Error('operator_access_invalid_subject');
  return { assurance: 'cloudflare-access-phishing-resistant', subject: payload.sub };
}
