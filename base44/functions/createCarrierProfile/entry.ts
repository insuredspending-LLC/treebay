import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Secure carrier profile creation. Derives owner from auth; forces pending verification.
// CarrierProfile RLS blocks direct client creation — this function is the ONLY path.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    if (!body.business_name || !body.contact_name || !body.phone || !body.city || !body.state || !body.zip_code)
      return Response.json({ error: "Required fields missing" }, { status: 400 });
    const svc = base44.asServiceRole;
    // Prevent duplicate carrier profiles for the same user
    const existing = await svc.entities.CarrierProfile.filter({ created_by_id: user.id });
    if (existing && existing.length) return Response.json({ carrier: existing[0] });
    const carrier = await svc.entities.CarrierProfile.create({
      business_name: body.business_name, contact_name: body.contact_name, phone: body.phone,
      address: body.address || "", city: body.city, state: body.state, zip_code: body.zip_code,
      equipment_type: body.equipment_type || "flatbed", service_radius: body.service_radius || "",
      operating_regions: body.operating_regions || "", load_capabilities: body.load_capabilities || "",
      description: body.description || "", dot_number: body.dot_number || "", mc_number: body.mc_number || "",
      // Backend forces these — owner cannot self-verify
      verification_status: "pending", insurance_verified: false,
    });
    await base44.auth.updateMe({ account_type: "carrier" });
    return Response.json({ carrier });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}