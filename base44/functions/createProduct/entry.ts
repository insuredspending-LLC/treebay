import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { isPositiveNumber, isNonNegativeNumber } from "../../shared/marketplace.ts";

const ALLOWED = ["common_name","botanical_name","cultivar","category","description","sku","container_size","box_size","caliper","current_height","approximate_spread","quantity_available","unit_price","minimum_order_quantity","wholesale_eligible","pickup_eligible","delivery_eligible","native_status","foliage_type","usda_zones","sun_requirement","water_requirement","mature_height","mature_spread","listing_status","bulk_price_tiers","images"];

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json() || {};

    const svc = base44.asServiceRole;
    const vendors = await svc.entities.VendorProfile.filter({ created_by_id: user.id });
    const vendor = (vendors || [])[0];
    if (!vendor) return Response.json({ error: "No vendor profile found. Complete vendor onboarding first." }, { status: 403 });

    if (!body.common_name || !body.category) return Response.json({ error: "Name and category are required" }, { status: 400 });
    const qty = Number(body.quantity_available) || 0;
    const price = Number(body.unit_price) || 0;
    if (!isNonNegativeNumber(qty)) return Response.json({ error: "Quantity invalid" }, { status: 400 });
    if (!isPositiveNumber(price)) return Response.json({ error: "Unit price must be positive" }, { status: 400 });
    const moq = Number(body.minimum_order_quantity) || 1;
    if (moq < 1) return Response.json({ error: "Minimum order must be at least 1" }, { status: 400 });

    const payload = {};
    for (const k of ALLOWED) { if (body[k] !== undefined) payload[k] = body[k]; }
    payload.vendor_id = vendor.id;
    payload.vendor_owner_id = user.id;
    payload.vendor_name = vendor.business_name;
    payload.vendor_city = vendor.city;
    payload.vendor_state = vendor.state;
    payload.verified_vendor = vendor.verification_status === "verified";
    payload.quantity_available = qty;
    payload.unit_price = price;
    payload.minimum_order_quantity = moq;
    payload.listing_status = qty <= 0 ? "sold_out" : (payload.listing_status || "active");

    const product = await svc.entities.Product.create(payload);
    return Response.json({ product });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}