import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const email = String(body?.email || "").trim().toLowerCase();
    const consent = body?.consent === true;
    const honeypot = String(body?.website || "").trim();

    // Quietly accept bot submissions without storing them.
    if (honeypot) return Response.json({ ok: true });

    if (!EMAIL_RE.test(email) || email.length > 254) {
      return Response.json({ error: "Enter the Google email used with Google Play." }, { status: 400 });
    }
    if (!consent) {
      return Response.json({ error: "Testing consent is required." }, { status: 400 });
    }

    const svc = base44.asServiceRole;
    const existing = await svc.entities.TesterSignup.filter({ play_email: email }, "-created_date", 1);
    const now = new Date().toISOString();

    if (existing?.length) {
      const current = existing[0];
      if (["requested", "declined"].includes(current.status)) {
        await svc.entities.TesterSignup.update(current.id, {
          status: "requested",
          consent_to_testing: true,
          consent_at: now,
          source: "public_website"
        });
      }
      return Response.json({ ok: true, alreadyRequested: true });
    }

    await svc.entities.TesterSignup.create({
      play_email: email,
      status: "requested",
      consent_to_testing: true,
      consent_at: now,
      source: "public_website"
    });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: "We could not save your tester request. Please try again." }, { status: 500 });
  }
}
