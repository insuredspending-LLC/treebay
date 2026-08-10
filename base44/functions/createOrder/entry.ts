import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { toCents, unitPriceCentsForQty, assembleCheckout, createOrderFromQuote } from "../../shared/transactions.ts";
import { generateAndStoreDocument } from "../../shared/documents.ts";

// Legacy createOrder — now a strict wrapper around calculateCheckout + createOrderFromCheckout.
// No buyer can bypass the CheckoutQuote / delivery / tax / fee / reservation path.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const productId = body?.productId;
    const quantity = Number(body?.quantity);
    if (!productId) return Response.json({ error: "Product id required" }, { status: 400 });
    if (!quantity || quantity < 1) return Response.json({ error: "Quantity must be a positive number" }, { status: 400 });

    const svc = base44.asServiceRole;
    const product = await svc.entities.Product.get(productId);
    if (!product) return Response.json({ error: "Product not found" }, { status: 404 });
    if (product.listing_status !== "active") return Response.json({ error: "This listing is no longer available." }, { status: 400 });
    const vendor = await svc.entities.VendorProfile.get(product.vendor_id);
    if (!vendor || vendor.verification_status !== "verified") return Response.json({ error: "This vendor is not yet verified." }, { status: 403 });
    if (quantity < (product.minimum_order_quantity || 1)) return Response.json({ error: "Minimum order is " + (product.minimum_order_quantity || 1) + "." }, { status: 400 });
    if (quantity > (product.quantity_available || 0)) return Response.json({ error: "Only " + (product.quantity_available || 0) + " available." }, { status: 400 });
    const unitPriceCents = unitPriceCentsForQty(product, quantity);
    if (unitPriceCents === null) return Response.json({ error: "This quantity requires a custom quote." }, { status: 400 });
    const merchCents = unitPriceCents * quantity;
    const lineName = product.common_name + " (" + [product.caliper, product.container_size].filter(Boolean).join(" · ") + ")";
    const items = [{ line_name: lineName, quantity, unit_price_cents: unitPriceCents, subtotal_cents: merchCents }];
    const buyerProfiles = await svc.entities.BuyerProfile.filter({ created_by_id: user.id });
    const buyer = (buyerProfiles || [])[0] || {};
    const { checkoutQuote } = await assembleCheckout(svc, {
      buyer_id: user.id, vendor_id: product.vendor_id, vendor_owner_id: product.vendor_owner_id,
      source_type: "direct_listing", product, product_id: product.id, items, merchandise_cents: merchCents,
      destination: body.destination || { city: buyer.city, state: buyer.state, zip: buyer.zip_code },
      deliveryMethod: body.deliveryMethod || null,
    });
    const { order } = await createOrderFromQuote(svc, checkoutQuote.id, user);
    await generateAndStoreDocument(svc, order, "buyer_order_confirmation", checkoutQuote);
    await generateAndStoreDocument(svc, order, "vendor_purchase_order", checkoutQuote);
    return Response.json({ order });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}