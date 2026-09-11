const baseUrl = String(process.env.STAGING_BASE_URL || '').replace(/\/$/, '');
if (!/^https:\/\//.test(baseUrl)) throw new Error('STAGING_BASE_URL must be an https URL');
const health = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(10000) });
if (!health.ok || (await health.json()).service !== 'brasa-identity-staging') throw new Error('identity staging health failed');
const missing = await fetch(`${baseUrl}/api/education/school-platform`, { signal: AbortSignal.timeout(10000) });
if (missing.status !== 401 || missing.headers.get('cache-control') !== 'no-store') throw new Error('missing-session boundary failed');
for (const path of ['/verify', '/metrics', '/signup', '/credentials/issue']) {
  const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(10000) });
  if (response.status !== 404) throw new Error(`${path} must not exist in identity staging`);
}
console.log(JSON.stringify({ health: 200, missingSession: 401, broaderGovIdRoutes: 404 }));
