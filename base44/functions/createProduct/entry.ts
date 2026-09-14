import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { isPositiveNumber, isNonNegativeNumber, listingReadinessErrors } from "../../shared/marketplace.ts";
import { vendorCanSell } from "../../shared/transactions.ts";

const ALLOWED = ["common_name","botanical_name","cultivar","category","description","sku","container_size","box_size","caliper","current_height","approximate_spread","quantity_available","unit_price","minimum_order_quantity","wholesale_eligible","pickup_eligible","delivery_eligible","native_status","foliage_type","usda_zones","sun_requirement","water_requirement","mature_height","mature_spread","listing_status","bulk_price_tiers","images"];

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json() || {};

    const svc = base44.asServiceRole;
    const vendors = await svc.entities.VendorProfile.filter({ owner_id: user.id });
    const vendor = (vendors || [])[0];
    if (!vendor) return Response.json({ error: "No vendor profile found. Complete vendor onboarding first." }, { status: 403 });
    if (!vendorCanSell(vendor)) return Response.json({ error: "Your seller account is not currently active for new listings." }, { status: 403 });

    if (!body.common_name || !body.category) return Response.json({ error: "Name and category are required" }, { status: 400 });
    const qty = Number(body.quantity_available) || 0;
    const price = Number(body.unit_price) || 0;
    if (!isNonNegativeNumber(qty) || !Number.isInteger(qty)) return Response.json({ error: "Quantity must be a non-negative whole number" }, { status: 400 });
    if (!isPositiveNumber(price)) return Response.json({ error: "Unit price must be positive" }, { status: 400 });
    const moq = Number(body.minimum_order_quantity) || 1;
    if (moq < 1 || !Number.isInteger(moq)) return Response.json({ error: "Minimum order must be a positive whole number" }, { status: 400 });

    const payload = {};
    for (const k of ALLOWED) { if (body[k] !== undefined) payload[k] = body[k]; }
    payload.is_test_fixture = false;
    payload.vendor_id = vendor.id;
    payload.vendor_owner_id = user.id;
    payload.vendor_name = vendor.business_name;
    payload.vendor_city = vendor.city;
    payload.vendor_state = vendor.state;
    payload.verified_vendor = vendor.verification_status === "verified";
    payload.physical_quantity = qty;
    payload.quantity_available = qty;
    payload.quantity_reserved = 0;
    payload.quantity_sold = 0;
    payload.unit_price = price;
    payload.minimum_order_quantity = moq;
    payload.listing_status = qty <= 0 ? "sold_out" : (payload.listing_status || "paused");
    if (payload.listing_status === "active") {
      const readinessErrors = listingReadinessErrors(payload);
      if (readinessErrors.length) {
        return Response.json({ error: "Complete this listing before publishing: " + readinessErrors.join(" ") }, { status: 400 });
      }
    }

    const product = await svc.entities.Product.create(payload);
    return Response.json({ product });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}