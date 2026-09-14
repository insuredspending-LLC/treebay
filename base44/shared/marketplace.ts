// Shared marketplace helpers used by backend functions.

export function priceForQuantity(product, qty) {
  if (!product) return 0;
  const tiers = (product.bulk_price_tiers || []).slice().sort((a, b) => a.min_qty - b.min_qty);
  let applicable = null;
  for (const t of tiers) { if (qty >= t.min_qty) applicable = t; }
  if (applicable) { if (applicable.request_quote) return null; return Number(applicable.unit_price) || 0; }
  return Number(product.unit_price) || 0;
}

export function genOrderNumber() {
  return "TB-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
}

export function isPositiveNumber(n) {
  return typeof n === "number" && isFinite(n) && n > 0;
}

export function isNonNegativeNumber(n) {
  return typeof n === "number" && isFinite(n) && n >= 0;
}

// A vendor quote total covers MERCHANDISE and the vendor's own delivery offer only.
// Sales tax and marketplace fees are computed authoritatively by TreEbay at checkout —
// vendors do not quote them, so the buyer is never shown a total containing amounts
// that are silently discarded later.
export function computeQuoteTotal(items) {
  return (items || []).reduce((s, i) =>
    s + (Number(i.subtotal) || 0) + (i.delivery_offered ? (Number(i.delivery_price) || 0) : 0), 0);
}

// Vendor-offered delivery across a quote, used to seed the vendor_delivery option.
export function quoteDeliveryTotal(items) {
  return (items || []).reduce((s, i) => s + (i.delivery_offered ? (Number(i.delivery_price) || 0) : 0), 0);
}

export function listingReadinessErrors(product) {
  const errors = [];
  if (!String(product?.common_name || "").trim()) errors.push("Add a common name.");
  if (!String(product?.category || "").trim()) errors.push("Choose a category.");
  if (!(Number(product?.unit_price) > 0)) errors.push("Set a unit price greater than zero.");
  if (!(Number(product?.physical_quantity ?? product?.quantity_available) > 0)) errors.push("Add available inventory.");
  if (!Array.isArray(product?.images) || product.images.filter(Boolean).length === 0) errors.push("Add at least one current product photo.");
  if (![product?.container_size, product?.box_size, product?.caliper, product?.current_height].some((value) => String(value || "").trim())) {
    errors.push("Add at least one size detail.");
  }
  if (!product?.pickup_eligible && !product?.delivery_eligible) errors.push("Offer pickup or grower delivery.");
  return errors;
}

export function isPublicMarketplaceProduct(product) {
  return !!product && product.is_test_fixture !== true && product.listing_status === "active";
}

export function isPublicMarketplaceVendor(vendor) {
  return !!vendor && vendor.is_test_fixture !== true && !["restricted", "suspended"].includes(vendor.selling_status || "active");
}

export async function isBlocked(svc, a, b) {
  const blocks = await svc.entities.UserBlock.filter({
    $or: [{ blocker_id: a, blocked_id: b }, { blocker_id: b, blocked_id: a }]
  });
  return (blocks || []).length > 0;
}

export const VENDOR_NEXT_STATUS = {
  inventory_reserved: "vendor_confirmed",
  vendor_confirmed: "preparing",
  preparing: "ready_for_pickup",
  ready_for_pickup: "delivery_assigned",
  delivery_assigned: "picked_up",
  picked_up: "in_transit",
  in_transit: "delivered",
  delivered: "completed",
};