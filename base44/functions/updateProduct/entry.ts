import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const ALLOWED = ["common_name","botanical_name","cultivar","category","description","sku","container_size","box_size","caliper","current_height","approximate_spread","quantity_available","unit_price","minimum_order_quantity","wholesale_eligible","pickup_eligible","delivery_eligible","native_status","foliage_type","usda_zones","sun_requirement","water_requirement","mature_height","mature_spread","listing_status","bulk_price_tiers","images"];

function validateProductUpdate(body, product) {
  const errors = [];
  // quantity_available: non-negative whole number
  if (body.quantity_available !== undefined) {
    const q = Number(body.quantity_available);
    if (!Number.isFinite(q) || q < 0) errors.push("Quantity available must be a non-negative number.");
    if (q !== Math.floor(q)) errors.push("Quantity must be a whole number.");
  }
  // unit_price: positive number
  if (body.unit_price !== undefined) {
    const p = Number(body.unit_price);
    if (!Number.isFinite(p) || p <= 0) errors.push("Unit price must be greater than zero.");
  }
  // minimum_order_quantity: >= 1 whole number
  if (body.minimum_order_quantity !== undefined) {
    const m = Number(body.minimum_order_quantity);
    if (!Number.isFinite(m) || m < 1) errors.push("Minimum order quantity must be at least 1.");
    if (m !== Math.floor(m)) errors.push("Minimum order quantity must be a whole number.");
  }
  // bulk_price_tiers: validate no overlapping ranges, min_qty > 0, unit_price > 0
  if (body.bulk_price_tiers !== undefined) {
    const tiers = Array.isArray(body.bulk_price_tiers) ? body.bulk_price_tiers : [];
    const sorted = tiers.slice().sort((a, b) => (a.min_qty || 0) - (b.min_qty || 0));
    for (let i = 0; i < sorted.length; i++) {
      const t = sorted[i];
      if (!t.min_qty || t.min_qty < 1) errors.push("Bulk tier min_qty must be at least 1.");
      if (t.unit_price != null && (!Number.isFinite(t.unit_price) || t.unit_price < 0)) errors.push("Bulk tier unit_price must be non-negative.");
      if (t.max_qty != null && t.max_qty > 0 && t.min_qty > t.max_qty) errors.push("Bulk tier min_qty cannot exceed max_qty.");
      if (i > 0) {
        const prev = sorted[i - 1];
        if (prev.max_qty != null && prev.max_qty > 0 && t.min_qty <= prev.max_qty) errors.push("Bulk tier " + t.min_qty + " overlaps previous tier (max " + prev.max_qty + ").");
      }
    }
  }
  return errors;
}

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
    if (product.vendor_owner_id !== user.id && user.role !== "admin") return Response.json({ error: "Not authorized" }, { status: 403 });

    const errors = validateProductUpdate(body, product);
    if (errors.length) return Response.json({ error: errors.join(" ") }, { status: 400 });

    const update = {};
    for (const k of ALLOWED) { if (body[k] !== undefined) update[k] = body[k]; }
    if (update.quantity_available !== undefined) {
      // Seller enters total physical units on hand. Active reservations are never overwritten.
      const physical = Number(update.quantity_available) || 0;
      const reserved = product.quantity_reserved || 0;
      if (physical < reserved) {
        return Response.json({ error: "Physical stock cannot be lower than the " + reserved + " units currently reserved." }, { status: 409 });
      }
      update.physical_quantity = physical;
      update.quantity_available = physical - reserved;
      if (update.quantity_available <= 0) update.listing_status = update.listing_status || "sold_out";
      else if (product.listing_status === "sold_out" && update.listing_status === undefined) update.listing_status = "active";
    }
    await svc.entities.Product.update(productId, update);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}