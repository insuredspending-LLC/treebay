import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const email = (body?.email || "").trim();
    if (!email) return Response.json({ error: "Email required" }, { status: 400 });
    const svc = base44.asServiceRole;
    await svc.entities.DeletionRequest.create({ email, reason: (body?.reason || "").trim(), status: "open" });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}