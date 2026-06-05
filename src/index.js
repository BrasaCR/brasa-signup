// index.js — brasa-signup Worker entry point.

import { handleUssd } from "./ussd.js";
import { handleWhatsApp } from "./whatsapp.js";
import { handleVerify, handleVerifyCredential } from "./verify.js";
import { issueCredential } from "./credentials.js";
import { listSigningKeys, upsertDestination } from "./db.js";
import { listRights, CLUSTERS } from "./rights.js";
import { useModule } from "./session.js";
import { registerPayment, getPayments } from "./payments.js";
import { appendThread, getThread } from "./education.js";
import { registerCampus, registerOfficer, verifyInPerson, recoverInPerson, listVerifications } from "./campus.js";
import { snapshot } from "./metrics.js";
import { createShareByDisplayId, revokeShare, getReportByToken, qrSvg, renderReportHtml } from "./report.js";
import { getFullByDisplayId } from "./db.js";

const isAdmin = (req, env) =>
  env.ADMIN_TOKEN && req.headers.get("authorization") === `Bearer ${env.ADMIN_TOKEN}`;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname === "/health") return new Response("ok");

    // Phase 6 — aggregate, content-free metrics for the OpenLedger (public).
    if (url.pathname === "/metrics" && req.method === "GET") {
      return Response.json(await snapshot(env));
    }

    // Africa's Talking USSD
    if (url.pathname === "/ussd" && req.method === "POST") {
      const form = await req.formData();
      const out = await handleUssd(env, form);
      return new Response(out, { headers: { "Content-Type": "text/plain" } });
    }

    // WhatsApp Business webhook
    if (url.pathname === "/whatsapp") {
      if (req.method === "GET") {
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        if (mode === "subscribe" && token === env.WA_VERIFY_TOKEN) return new Response(challenge);
        return new Response("forbidden", { status: 403 });
      }
      if (req.method === "POST") {
        await handleWhatsApp(env, await req.json());
        return new Response("EVENT_RECEIVED");
      }
    }

    // Public verifier — identity + bound credentials
    if (url.pathname === "/verify" && req.method === "GET") {
      return Response.json(await handleVerify(env, url.searchParams.get("id") || ""));
    }

    // Public verifier — single credential signature chain
    if (url.pathname === "/credential" && req.method === "GET") {
      return Response.json(await handleVerifyCredential(env, url.searchParams.get("id") || ""));
    }

    // Public key log (intermediates + their root certificates)
    if (url.pathname === "/keys" && req.method === "GET") {
      return Response.json({ root_public_key: env.ROOT_PUBLIC_KEY, keys: await listSigningKeys(env) });
    }

    // Admin: issue a credential (BRASA Standards only)
    if (url.pathname === "/credentials/issue" && req.method === "POST") {
      if (!isAdmin(req, env)) return new Response("unauthorized", { status: 401 });
      const { ref, credential, std_version } = await req.json();
      const r = await issueCredential(env, ref, credential, std_version);
      return Response.json(r, { status: r.ok ? 200 : 400 });
    }

    // Public: the 21 constitutional rights
    if (url.pathname === "/rights" && req.method === "GET") {
      return Response.json({ clusters: CLUSTERS, rights: listRights() });
    }

    // Trusted (brasa-ai): exercise a module / right — resolves GovID, enforces
    // LoA, writes the content-free CDR. Admin-gated for HTTP callers.
    if (url.pathname === "/module" && req.method === "POST") {
      if (!isAdmin(req, env)) return new Response("unauthorized", { status: 401 });
      const { msisdn, module, pin, language } = await req.json();
      return Response.json(await useModule(env, { msisdn, module, pin, language }));
    }

    // Admin: SINPE payment registry (non-custodial — records reference only)
    if (url.pathname === "/payments/register" && req.method === "POST") {
      if (!isAdmin(req, env)) return new Response("unauthorized", { status: 401 });
      const { gov_id, ...opts } = await req.json();
      const r = await registerPayment(env, gov_id, opts);
      return Response.json(r, { status: r.ok ? 200 : 400 });
    }
    if (url.pathname === "/payments" && req.method === "GET") {
      if (!isAdmin(req, env)) return new Response("unauthorized", { status: 401 });
      return Response.json({ payments: await getPayments(env, url.searchParams.get("gov") || "") });
    }

    // Admin: education thread
    if (url.pathname === "/thread" && req.method === "POST") {
      if (!isAdmin(req, env)) return new Response("unauthorized", { status: 401 });
      const { gov_id, ...entry } = await req.json();
      const r = await appendThread(env, gov_id, entry);
      return Response.json(r, { status: r.ok ? 200 : 400 });
    }
    if (url.pathname === "/thread" && req.method === "GET") {
      if (!isAdmin(req, env)) return new Response("unauthorized", { status: 401 });
      return Response.json({ thread: await getThread(env, url.searchParams.get("gov") || "") });
    }

    // Admin: register a verified SINPE destination (the pay-code registry)
    if (url.pathname === "/destinations" && req.method === "POST") {
      if (!isAdmin(req, env)) return new Response("unauthorized", { status: 401 });
      await upsertDestination(env, await req.json());
      return Response.json({ ok: true });
    }

    // --- Phase 5: LoA-3 in-person verification at ABC campuses ---
    if (url.pathname === "/campuses" && req.method === "POST") {
      if (!isAdmin(req, env)) return new Response("unauthorized", { status: 401 });
      return Response.json(await registerCampus(env, await req.json()));
    }
    if (url.pathname === "/officers" && req.method === "POST") {
      if (!isAdmin(req, env)) return new Response("unauthorized", { status: 401 });
      return Response.json(await registerOfficer(env, await req.json()));
    }
    if (url.pathname === "/verify-in-person" && req.method === "POST") {
      if (!isAdmin(req, env)) return new Response("unauthorized", { status: 401 });
      return Response.json(await verifyInPerson(env, await req.json()));
    }
    if (url.pathname === "/recover-in-person" && req.method === "POST") {
      if (!isAdmin(req, env)) return new Response("unauthorized", { status: 401 });
      return Response.json(await recoverInPerson(env, await req.json()));
    }
    if (url.pathname === "/verifications" && req.method === "GET") {
      if (!isAdmin(req, env)) return new Response("unauthorized", { status: 401 });
      const c = await getFullByDisplayId(env, url.searchParams.get("display_id"));
      if (!c) return Response.json({ ok: false, reason: "not_found" }, { status: 404 });
      return Response.json({ ok: true, gov_id: c.gov_id, verifications: await listVerifications(env, c.gov_id) });
    }

    // --- Education Report Card (citizen-issued QR portfolio) ---
    // Create a share (admin / ABC-campus kiosk). Citizens self-issue over WhatsApp.
    if (url.pathname === "/report/share" && req.method === "POST") {
      if (!isAdmin(req, env)) return new Response("unauthorized", { status: 401 });
      const { display_id, ttl_ms } = await req.json();
      const s = await createShareByDisplayId(env, display_id, ttl_ms);
      if (!s.ok) return Response.json(s, { status: 404 });
      const view_url = `${url.origin}/report/view?token=${s.token}`;
      return Response.json({
        ok: true, token: s.token, expires_at: s.expires_at,
        view_url, report_url: `${url.origin}/report?token=${s.token}`,
        qr_url: `${url.origin}/report/qr?token=${s.token}`,
      });
    }
    if (url.pathname === "/report/share" && req.method === "DELETE") {
      if (!isAdmin(req, env)) return new Response("unauthorized", { status: 401 });
      return Response.json(await revokeShare(env, url.searchParams.get("token")));
    }
    // Public, capability-gated views (what the employer reaches by scanning).
    if (url.pathname === "/report" && req.method === "GET") {
      const r = await getReportByToken(env, url.searchParams.get("token"));
      return Response.json(r, { status: r.ok ? 200 : 404 });
    }
    if (url.pathname === "/report/view" && req.method === "GET") {
      const r = await getReportByToken(env, url.searchParams.get("token"));
      if (!r.ok) return new Response("This report link is not valid or has expired.", { status: 404 });
      return new Response(renderReportHtml(r.report, { expires_at: r.expires_at }), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    if (url.pathname === "/report/qr" && req.method === "GET") {
      const token = url.searchParams.get("token");
      const r = await getReportByToken(env, token);
      if (!r.ok) return new Response("invalid token", { status: 404 });
      const svg = qrSvg(`${url.origin}/report/view?token=${token}`);
      return new Response(svg, { headers: { "content-type": "image/svg+xml; charset=utf-8" } });
    }

    return new Response("not found", { status: 404 });
  },
};
