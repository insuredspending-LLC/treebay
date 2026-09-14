import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const ALLOWED = ["business_name","contact_name","phone","address","city","state","zip_code","website","description","service_area","pickup_available","delivery_available","wholesale_available","logo_url","cover_url"];

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
    const profile = await svc.entities.VendorProfile.get(profileId);
    if (!profile) return Response.json({ error: "Profile not found" }, { status: 404 });
    if (profile.owner_id !== user.id) return Response.json({ error: "Not authorized" }, { status: 403 });

    const update = {};
    for (const k of ALLOWED) { if (fields[k] !== undefined) update[k] = fields[k]; }
    await svc.entities.VendorProfile.update(profileId, update);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}