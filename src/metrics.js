// metrics.js — Phase 6: the aggregate GovID metrics the OpenLedger publishes
// (via brasa-monitor). Privacy is structural: this returns only counts and
// distributions computed with COUNT/GROUP BY. No GovID, phone number, message,
// or any per-citizen row is read or exposed — consistent with the content-free
// CDR (one row per interaction, under 2KB, no content).

import * as db from "./db.js";

const toMap = (rows, key) => Object.fromEntries(rows.map(r => [String(r[key]), r.n]));
const sum = rows => rows.reduce((a, r) => a + r.n, 0);

export async function snapshot(env) {
  const [byStatus, byLoa, byLang, byRecovery] = await Promise.all([
    db.metricCitizensByStatus(env),
    db.metricCitizensByLoa(env),
    db.metricCitizensByLanguage(env),
    db.metricRecoveriesByStatus(env),
  ]);
  const [credentials, verifications, interactions] = await Promise.all([
    db.metricCredentialCount(env),
    db.metricVerificationCount(env),
    db.metricCdrCount(env),
  ]);

  const status = toMap(byStatus, "status");
  const loa = toMap(byLoa, "loa");
  const recovery = toMap(byRecovery, "status");
  const langServed = toMap(byLang, "language");

  return {
    generated_at: Date.now(),
    citizens: {
      issued: sum(byStatus),
      active: status.active || 0,
      provisional: status.provisional || 0,
      dormant: status.dormant || 0,
      closed: status.closed || 0,
    },
    loa_distribution: { 1: loa["1"] || 0, 2: loa["2"] || 0, 3: loa["3"] || 0 },
    recoveries: {
      pending: recovery.pending || 0,
      completed: recovery.completed || 0,
      cancelled: recovery.cancelled || 0,
    },
    credentials_issued: credentials,
    in_person_verifications: verifications,
    interactions,                                   // total content-free CDR rows
    languages: { distinct: byLang.length, served: langServed },
    note: "Aggregate and content-free. No GovID, phone number, or message is exposed.",
  };
}
