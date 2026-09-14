import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Carrier may edit ONLY owner-controlled fields. verification_status, insurance_verified,
// and ownership are NEVER accepted from the client.
const ALLOWED = ["business_name","contact_name","phone","address","city","state","zip_code",
  "equipment_type","service_radius","operating_regions","load_capabilities","description",
  "dot_number","mc_number"];

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const profileId = body?.profileId;
    const fields = body?.fields || {};
    if (!profileId) return Response.json({ error: "profileId required" }, { status: 400 });

    const svc = base44.asServiceRole;
    const profile = await svc.entities.CarrierProfile.get(profileId);
    if (!profile) return Response.json({ error: "Profile not found" }, { status: 404 });
    if (profile.owner_id !== user.id) return Response.json({ error: "Not authorized" }, { status: 403 });

    const update = {};
    for (const k of ALLOWED) { if (fields[k] !== undefined) update[k] = fields[k]; }
    // verification_status and insurance_verified are deliberately NOT in ALLOWED
    await svc.entities.CarrierProfile.update(profileId, update);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}