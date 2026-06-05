// _mock.js — in-memory stand-in for the D1 binding (not a test file).
// Recognizes the exact statements used by src/db.js.

export function mockDB() {
  const citizens = [];
  const events = [];
  const recoveries = [];
  const credentials = [];
  const signing_keys = [];
  const cdr = [];
  const payments = [];
  const learning_thread = [];
  const pay_destinations = [];
  const campuses = [];
  const officers = [];
  const verifications = [];
  const report_shares = [];

  return {
    citizens, events, recoveries, credentials, signing_keys, cdr, payments, learning_thread, pay_destinations,
    campuses, officers, verifications, report_shares,
    prepare(sql) {
      return {
        bind(...a) {
          return {
            async first() {
              if (sql.includes("FROM citizens WHERE msisdn_hmac")) {
                const r = citizens.find(c => c.msisdn_hmac === a[0]);
                return r ? { gov_id: r.gov_id, display_id: r.display_id, status: r.status, loa: r.loa, pin_hash: r.pin_hash ?? null } : null;
              }
              if (sql.includes("FROM citizens WHERE gov_id")) {
                const r = citizens.find(c => c.gov_id === a[0]);
                return r ? { gov_id: r.gov_id, display_id: r.display_id, status: r.status, loa: r.loa } : null;
              }
              if (sql.includes("FROM citizens WHERE display_id")) {
                const r = citizens.find(c => c.display_id === a[0]);
                if (!r) return null;
                if (sql.includes("msisdn_hmac"))
                  return { gov_id: r.gov_id, display_id: r.display_id, msisdn_hmac: r.msisdn_hmac, status: r.status, loa: r.loa, pin_hash: r.pin_hash ?? null };
                return { display_id: r.display_id, status: r.status, loa: r.loa, created_at: r.created_at };
              }
              if (sql.includes("FROM recoveries WHERE new_msisdn_hmac")) {
                return recoveries.find(r => r.new_msisdn_hmac === a[0] && r.status === "pending") || null;
              }
              if (sql.includes("FROM recoveries WHERE gov_id")) {
                return recoveries.find(r => r.gov_id === a[0] && r.status === "pending") || null;
              }
              if (sql.includes("FROM credentials cr JOIN citizens")) {
                const cr = credentials.find(c => c.cred_id === a[0]);
                if (!cr) return null;
                const ci = citizens.find(c => c.gov_id === cr.gov_id);
                return { ...cr, display_id: ci ? ci.display_id : null };
              }
              if (sql.includes("FROM signing_keys WHERE key_id")) {
                return signing_keys.find(k => k.key_id === a[0]) || null;
              }
              if (sql.includes("FROM pay_destinations WHERE code")) {
                return pay_destinations.find(d => d.code === a[0]) || null;
              }
              if (sql.includes("FROM campuses WHERE campus_id")) {
                return campuses.find(c => c.campus_id === a[0]) || null;
              }
              if (sql.includes("FROM officers WHERE officer_id")) {
                return officers.find(o => o.officer_id === a[0]) || null;
              }
              if (sql.includes("FROM report_shares WHERE token")) {
                return report_shares.find(s => s.token === a[0]) || null;
              }
              // Phase 6 aggregate counts (content-free)
              if (sql.includes("COUNT(*) AS n FROM credentials")) return { n: credentials.length };
              if (sql.includes("COUNT(*) AS n FROM verifications")) return { n: verifications.length };
              if (sql.includes("COUNT(*) AS n FROM cdr")) return { n: cdr.length };
              return null;
            },
            async all() {
              if (sql.includes("FROM credentials WHERE gov_id")) {
                return { results: credentials.filter(c => c.gov_id === a[0]).sort((x, y) => x.issued_at - y.issued_at) };
              }
              if (sql.includes("FROM signing_keys")) {
                return { results: [...signing_keys].sort((x, y) => x.created_at - y.created_at) };
              }
              if (sql.includes("FROM payments WHERE gov_id")) {
                return { results: payments.filter(p => p.gov_id === a[0]).sort((x, y) => x.created_at - y.created_at) };
              }
              if (sql.includes("FROM learning_thread WHERE gov_id")) {
                return { results: learning_thread.filter(e => e.gov_id === a[0]).sort((x, y) => x.ts - y.ts) };
              }
              if (sql.includes("FROM verifications WHERE gov_id")) {
                return { results: verifications.filter(v => v.gov_id === a[0]).sort((x, y) => x.ts - y.ts) };
              }
              // Phase 6 aggregate metrics (GROUP BY counts; content-free)
              const groupCount = (arr, key) => {
                const m = new Map();
                for (const row of arr) m.set(row[key], (m.get(row[key]) || 0) + 1);
                return { results: [...m].map(([k, n]) => ({ [key]: k, n })) };
              };
              if (sql.includes("FROM citizens GROUP BY status")) return groupCount(citizens, "status");
              if (sql.includes("FROM citizens GROUP BY loa")) return groupCount(citizens, "loa");
              if (sql.includes("FROM citizens GROUP BY language")) return groupCount(citizens, "language");
              if (sql.includes("FROM recoveries GROUP BY status")) return groupCount(recoveries, "status");
              return { results: [] };
            },
            async run() {
              if (sql.startsWith("INSERT INTO citizens")) {
                const [gov_id, display_id, msisdn_hmac, created_at, status, loa, language, updated_at] = a;
                if (citizens.some(c => c.display_id === display_id || c.msisdn_hmac === msisdn_hmac))
                  throw new Error("UNIQUE constraint failed");
                citizens.push({ gov_id, display_id, msisdn_hmac, created_at, status, loa, language, updated_at, pin_hash: null, heir_gov_id: null });
              } else if (sql.startsWith("INSERT INTO id_events")) {
                events.push({ gov_id: a[0], ts: a[1], event: a[2], detail: a[3] });
              } else if (sql.includes("UPDATE citizens SET pin_hash")) {
                const c = citizens.find(c => c.gov_id === a[3]);
                if (c) { c.pin_hash = a[0]; c.loa = a[1]; if (c.status === "provisional") c.status = "active"; c.updated_at = a[2]; }
              } else if (sql.includes("UPDATE citizens SET msisdn_hmac")) {
                const c = citizens.find(c => c.gov_id === a[2]);
                if (c) { c.msisdn_hmac = a[0]; c.updated_at = a[1]; }
              } else if (sql.includes("UPDATE citizens SET loa")) {
                const c = citizens.find(c => c.gov_id === a[2]);
                if (c) { c.loa = a[0]; c.updated_at = a[1]; }
              } else if (sql.includes("UPDATE citizens SET status='active'")) {
                const c = citizens.find(c => c.gov_id === a[1]);
                if (c && c.status === "provisional") c.status = "active";
              } else if (sql.startsWith("INSERT OR REPLACE INTO recoveries")) {
                const [gov_id, new_msisdn_hmac, requested_at, cooldown_until, status] = a;
                const i = recoveries.findIndex(r => r.gov_id === gov_id);
                const row = { gov_id, new_msisdn_hmac, requested_at, cooldown_until, status };
                if (i >= 0) recoveries[i] = row; else recoveries.push(row);
              } else if (sql.startsWith("UPDATE recoveries SET status")) {
                const r = recoveries.find(r => r.gov_id === a[1]);
                if (r) r.status = a[0];
              } else if (sql.startsWith("INSERT INTO credentials")) {
                const [cred_id, gov_id, credential, std_version, issued_at, key_id, signature, status] = a;
                credentials.push({ cred_id, gov_id, credential, std_version, issued_at, key_id, signature, status });
              } else if (sql.startsWith("INSERT OR REPLACE INTO signing_keys")) {
                const [key_id, public_key, cert, created_at, status] = a;
                const i = signing_keys.findIndex(k => k.key_id === key_id);
                const row = { key_id, public_key, cert, created_at, status };
                if (i >= 0) signing_keys[i] = row; else signing_keys.push(row);
              } else if (sql.startsWith("INSERT INTO cdr")) {
                cdr.push({ gov_id: a[0], ts: a[1], module: a[2], language: a[3], outcome: a[4] });
              } else if (sql.startsWith("INSERT INTO payments")) {
                const [pay_id, gov_id, rail, vertical, segment, amount_minor, currency, pay_ref, status, created_at] = a;
                payments.push({ pay_id, gov_id, rail, vertical, segment, amount_minor, currency, pay_ref, status, created_at });
              } else if (sql.startsWith("INSERT INTO learning_thread")) {
                const [entry_id, gov_id, ts, kind, provider, subject, detail] = a;
                learning_thread.push({ entry_id, gov_id, ts, kind, provider, subject, detail });
              } else if (sql.startsWith("INSERT OR REPLACE INTO pay_destinations")) {
                const [code, rail, country, account, account_ref, dial_code, name, currency, verified, vertical, segment] = a;
                const i = pay_destinations.findIndex(d => d.code === code);
                const row = { code, rail, country, account, account_ref, dial_code, name, currency, verified, vertical, segment };
                if (i >= 0) pay_destinations[i] = row; else pay_destinations.push(row);
              } else if (sql.startsWith("INSERT OR REPLACE INTO campuses")) {
                const [campus_id, name, country, location, status, created_at] = a;
                const i = campuses.findIndex(c => c.campus_id === campus_id);
                const row = { campus_id, name, country, location, status, created_at };
                if (i >= 0) campuses[i] = row; else campuses.push(row);
              } else if (sql.startsWith("INSERT OR REPLACE INTO officers")) {
                const [officer_id, campus_id, name, status, created_at] = a;
                const i = officers.findIndex(o => o.officer_id === officer_id);
                const row = { officer_id, campus_id, name, status, created_at };
                if (i >= 0) officers[i] = row; else officers.push(row);
              } else if (sql.startsWith("INSERT INTO verifications")) {
                const [ver_id, gov_id, campus_id, officer_id, method, ts] = a;
                verifications.push({ ver_id, gov_id, campus_id, officer_id, method, ts });
              } else if (sql.startsWith("INSERT INTO report_shares")) {
                const [token, gov_id, created_at, expires_at, status] = a;
                report_shares.push({ token, gov_id, created_at, expires_at, status });
              } else if (sql.startsWith("UPDATE report_shares SET status")) {
                const s = report_shares.find(s => s.token === a[0]);
                if (s) s.status = "revoked";
              }
            },
          };
        },
      };
    },
  };
}
