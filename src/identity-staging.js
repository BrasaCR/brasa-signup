import { introspectEducationSession } from './introspection.js';
import { exchangeInvitation, issueInvitation, logoutSession, renewSession } from './session-lifecycle.js';
const noStore = { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' };
const reply = (body, status) => new Response(JSON.stringify(body), { status, headers: noStore });

export default {
  async fetch(request, env) {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/health' && request.method === 'GET') return reply({ ok: true, service: 'brasa-identity-staging', version: 1 }, 200);
    if (pathname === '/api/education/school-platform') return introspectEducationSession(request, env);
    if (pathname === '/api/session/exchange') return exchangeInvitation(request, env);
    if (pathname === '/api/session/renew') return renewSession(request, env);
    if (pathname === '/api/session/logout') return logoutSession(request, env);
    if (pathname === '/internal/education/invitations') return issueInvitation(request, env);
    return reply({ error: 'not_found' }, 404);
  }
};
