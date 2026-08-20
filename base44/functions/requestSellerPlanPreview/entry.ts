import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

const SELLER_PLANS = new Set(["free", "professional", "business"]);

export default async function(req) {
  try {
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const requestedPlan = String(body?.plan || "").trim().toLowerCase();
    if (!SELLER_PLANS.has(requestedPlan)) {
      return Response.json({ error: "Invalid seller plan" }, { status: 400 });
    }

    const service = base44.asServiceRole;
    const records = await service.entities.VendorProfile.filter({ owner_id: user.id }, "-updated_date", 1);
    const vendor = records?.[0];
    if (!vendor) {
      return Response.json({ error: "Create a seller profile before selecting a plan" }, { status: 404 });
    }

    const updated = await service.entities.VendorProfile.update(vendor.id, {
      requested_seller_plan: requestedPlan,
      requested_plan_at: new Date().toISOString(),
      seller_plan: vendor.seller_plan || "free",
      seller_plan_status: vendor.seller_plan_status || "preview",
      seller_billing_provider: vendor.seller_billing_provider || "none",
    });

    return Response.json({
      ok: true,
      vendor: updated,
      preview_only: true,
      charged: false,
      message: "Founding-plan interest saved. No charge or paid entitlement was created.",
    });
  } catch (error) {
    return Response.json({ error: error.message || "Could not save seller plan interest" }, { status: 500 });
  }
}
