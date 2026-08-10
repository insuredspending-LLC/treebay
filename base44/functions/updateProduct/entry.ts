import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const ALLOWED = ["common_name","botanical_name","cultivar","category","description","sku","container_size","box_size","caliper","current_height","approximate_spread","quantity_available","unit_price","minimum_order_quantity","wholesale_eligible","pickup_eligible","delivery_eligible","native_status","foliage_type","usda_zones","sun_requirement","water_requirement","mature_height","mature_spread","featured","listing_status","bulk_price_tiers","images"];

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json() || {};
    const productId = body?.productId;
    if (!productId) return Response.json({ error: "productId required" }, { status: 400 });

    const svc = base44.asServiceRole;
    const product = await svc.entities.Product.get(productId);
    if (!product) return Response.json({ error: "Product not found" }, { status: 404 });
    if (product.vendor_owner_id !== user.id) return Response.json({ error: "Not authorized" }, { status: 403 });

    const update = {};
    for (const k of ALLOWED) { if (body[k] !== undefined) update[k] = body[k]; }
    if (update.quantity_available !== undefined) {
      const q = Number(update.quantity_available) || 0;
      update.quantity_available = q;
      if (q <= 0) update.listing_status = update.listing_status || "sold_out";
      else if (product.listing_status === "sold_out" && update.listing_status === undefined) update.listing_status = "active";
    }
    await svc.entities.Product.update(productId, update);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}