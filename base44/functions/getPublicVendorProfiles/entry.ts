import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { isPublicMarketplaceVendor } from "../../shared/marketplace.ts";

// Safe public seller projection — returns only marketplace display fields.
// Never exposes contact_name, phone, address, or zip_code.
// Backend transaction functions continue reading full profiles via service-role access.

const PUBLIC_FIELDS = [
  "id", "business_name", "city", "state", "website", "description",
  "service_area", "pickup_available", "delivery_available", "wholesale_available",
  "verification_status", "selling_status", "logo_url", "cover_url", "rating", "review_count",
  "created_date"
];

function sanitize(vendor) {
  if (!isPublicMarketplaceVendor(vendor)) return null;
  const result = {};
  for (const k of PUBLIC_FIELDS) {
    if (vendor[k] !== undefined) result[k] = vendor[k];
  }
  return result;
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json() || {};
    const svc = base44.asServiceRole;

    // Case 1: Get sanitized profiles by vendor IDs → returns map { [id]: profile }
    if (Array.isArray(body.vendorIds) && body.vendorIds.length) {
      const vendors = await svc.entities.VendorProfile.filter({ id: { $in: body.vendorIds } });
      const map = {};
      (vendors || []).filter(isPublicMarketplaceVendor).forEach(v => { map[v.id] = sanitize(v); });
      return Response.json({ vendors: map });
    }

    // Case 2: Get sanitized verified vendors → returns array [profile, ...]
    if (body.verified) {
      const limit = Math.min(body.limit || 12, 50);
      const vendors = await svc.entities.VendorProfile.filter({ verification_status: "verified" }, "-rating", limit);
      return Response.json({ vendors: (vendors || []).filter(isPublicMarketplaceVendor).map(sanitize) });
    }

    return Response.json({ error: "vendorIds or verified required" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}