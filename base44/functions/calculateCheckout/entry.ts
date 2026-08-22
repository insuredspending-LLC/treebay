import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { toCents, unitPriceCentsForQty, assembleCheckout, vendorCanSell } from "../../shared/transactions.ts";
import { commerceModeForVendor } from "../../shared/stripe.ts";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const svc = base44.asServiceRole;

    // ---- Direct listing checkout ----
    if (body.productId) {
      const product = await svc.entities.Product.get(body.productId);
      if (!product) return Response.json({ error: "Product not found" }, { status: 404 });
      if (product.listing_status !== "active") return Response.json({ error: "This listing is no longer available." }, { status: 400 });
      // Operational selling is automatic for normal onboarding. Trust verification is
      // a separate badge and does not block checkout unless the seller is suspended/restricted.
      const vendor = await svc.entities.VendorProfile.get(product.vendor_id);
      if (!vendorCanSell(vendor)) return Response.json({ error: "This seller account is not currently active for new orders." }, { status: 403 });
      const qty = Number(body.quantity);
      if (!qty || qty < (product.minimum_order_quantity || 1)) return Response.json({ error: "Quantity below minimum order." }, { status: 400 });
      if (qty > (product.quantity_available || 0)) return Response.json({ error: "Only " + (product.quantity_available || 0) + " available." }, { status: 400 });
      const unitPriceCents = unitPriceCentsForQty(product, qty);
      if (unitPriceCents === null) return Response.json({ error: "This quantity requires a custom quote." }, { status: 400 });
      const merchCents = unitPriceCents * qty;
      const lineName = product.common_name + " (" + [product.caliper, product.container_size].filter(Boolean).join(" · ") + ")";
      const items = [{ line_name: lineName, quantity: qty, unit_price_cents: unitPriceCents, subtotal_cents: merchCents }];
      const buyerProfiles = await svc.entities.BuyerProfile.filter({ created_by_id: user.id });
      const buyer = (buyerProfiles || [])[0] || {};
      // deliveryMethod is NOT defaulted — buyer selects from options in Checkout.
      const result = await assembleCheckout(svc, {
        buyer_id: user.id, vendor_id: product.vendor_id, vendor_owner_id: product.vendor_owner_id,
        source_type: "direct_listing", product, product_id: product.id, items, merchandise_cents: merchCents,
        destination: body.destination || { city: buyer.city, state: buyer.state, zip: buyer.zip_code },
        deliveryMethod: body.deliveryMethod || null,
        commerce_mode: commerceModeForVendor(vendor),
      });
      return Response.json(result);
    }

    // ---- Accepted-quote checkout ----
    if (body.quoteId) {
      const quote = await svc.entities.VendorQuote.get(body.quoteId);
      if (!quote) return Response.json({ error: "Quote not found" }, { status: 404 });
      if (quote.status !== "submitted" && quote.status !== "revised" && quote.status !== "pending_acceptance") return Response.json({ error: "This quote is no longer available." }, { status: 400 });
      if (quote.expiration_date) { const exp = new Date(quote.expiration_date); if (!isNaN(exp) && exp < new Date()) return Response.json({ error: "This quote has expired." }, { status: 400 }); }
      const rfq = await svc.entities.RFQ.get(quote.rfq_id);
      if (!rfq) return Response.json({ error: "RFQ not found" }, { status: 404 });
      if (rfq.buyer_id !== user.id) return Response.json({ error: "Only the buyer can checkout this quote." }, { status: 403 });
      // Seller operational status is re-checked at checkout — a seller suspended or
      // restricted after quoting cannot receive a new paid order.
      const quoteVendor = await svc.entities.VendorProfile.get(quote.vendor_id);
      if (!vendorCanSell(quoteVendor)) {
        return Response.json({ error: "This seller account is not currently active for new orders." }, { status: 403 });
      }
      const items = (quote.items || []).map((i) => {
        const qty = Number(i.quantity_offered) || 0;
        const up = toCents(Number(i.unit_price) || 0);
        return { line_name: i.line_name, quantity: qty, unit_price_cents: up, subtotal_cents: up * qty };
      });
      const merchCents = items.reduce((s, i) => s + i.subtotal_cents, 0);
      const vendorDeliveryOffered = (quote.items || []).some((i) => i.delivery_offered);
      const vendorDeliveryCents = vendorDeliveryOffered
        ? toCents((quote.items || []).filter((i) => i.delivery_offered).reduce((sum, i) => sum + (Number(i.delivery_price) || 0), 0))
        : 0;
      const result = await assembleCheckout(svc, {
        buyer_id: user.id, vendor_id: quote.vendor_id, vendor_owner_id: quote.vendor_owner_id,
        source_type: "accepted_quote", quote_id: quote.id, rfq_id: rfq.id, items, merchandise_cents: merchCents,
        destination: { city: rfq.delivery_city, state: rfq.delivery_state, zip: rfq.delivery_zip },
        vendor_delivery_cents: vendorDeliveryCents,
        vendor_delivery_available: vendorDeliveryOffered,
        deliveryMethod: body.deliveryMethod || null,
        commerce_mode: commerceModeForVendor(quoteVendor),
      });
      return Response.json(result);
    }

    return Response.json({ error: "productId or quoteId required" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}