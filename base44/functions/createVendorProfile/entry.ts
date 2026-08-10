import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Secure vendor profile creation. Derives owner from auth; forces pending verification, rating 0.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    if (!body.business_name || !body.contact_name || !body.phone || !body.city || !body.state || !body.zip_code)
      return Response.json({ error: "Required fields missing" }, { status: 400 });
    const svc = base44.asServiceRole;
    // Prevent duplicate profiles for the same user
    const existing = await svc.entities.VendorProfile.filter({ created_by_id: user.id });
    if (existing && existing.length) return Response.json({ vendor: existing[0] });
    const vendor = await svc.entities.VendorProfile.create({
      business_name: body.business_name, contact_name: body.contact_name, phone: body.phone,
      address: body.address || "", city: body.city, state: body.state, zip_code: body.zip_code,
      website: body.website || "", description: body.description || "", service_area: body.service_area || "",
      pickup_available: body.pickup_available !== false, delivery_available: body.delivery_available !== false,
      wholesale_available: !!body.wholesale_available,
      verification_status: "pending", rating: 0, review_count: 0,
    });
    await base44.auth.updateMe({ account_type: "vendor", terms_accepted_at: new Date().toISOString(), terms_version: "1" });
    return Response.json({ vendor });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}