import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const email = String(body?.email || "").trim().toLowerCase();
    const reason = String(body?.reason || "").trim().slice(0, 1000);

    if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
      return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const svc = base44.asServiceRole;

    // Public deletion requests are deliberately idempotent by email while an
    // open request exists. This avoids duplicate records from repeated taps and
    // reduces trivial form abuse without exposing whether an account exists.
    const existing = await svc.entities.DeletionRequest.filter({ email, status: "open" }, "-created_date", 1);
    if (!existing?.length) {
      await svc.entities.DeletionRequest.create({ email, reason, status: "open" });
    }

    // Keep the response neutral so this endpoint cannot be used to enumerate
    // whether a TreEbay account exists for an email address.
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Could not submit the deletion request." }, { status: 500 });
  }
}
