import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { genOrderNumber } from "../../shared/marketplace.ts";
import { fromCents, reserveInventory, recordOrderEvent, createLedgerEntry, RESERVATION_TTL_MINUTES } from "../../shared/transactions.ts";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const checkoutQuoteId = body?.checkoutQuoteId;
    if (!checkoutQuoteId) return Response.json({ error: "checkoutQuoteId required" }, { status: 400 });
    const svc = base44.asServiceRole;
    const cq = await svc.entities.CheckoutQuote.get(checkoutQuoteId);
    if (!cq) return Response.json({ error: "Checkout quote not found" }, { status: 404 });
    if (cq.buyer_id !== user.id) return Response.json({ error: "This checkout quote belongs to another buyer." }, { status: 403 });

    // Idempotency: if this quote already produced an order, return it.
    if (cq.order_id) {
      const existing = await svc.entities.Order.get(cq.order_id);
      if (existing) return Response.json({ order: existing });
    }
    if (cq.expiration_at && new Date(cq.expiration_at) < new Date()) return Response.json({ error: "This checkout quote has expired. Please recalculate." }, { status: 400 });

    // Reserve inventory for direct listings (accepted quotes rely on vendor-offered stock).
    if (cq.source_type === "direct_listing" && cq.product_id) {
      const qty = (cq.items || []).reduce((s, i) => s + (i.quantity || 0), 0);
      try { await reserveInventory(svc, cq.product_id, qty); }
      catch (e) { return Response.json({ error: e.message }, { status: 400 }); }
    }

    const vendor = await svc.entities.VendorProfile.get(cq.vendor_id);
    const orderNumber = genOrderNumber();
    const order = await svc.entities.Order.create({
      order_number: orderNumber, buyer_id: cq.buyer_id, vendor_id: cq.vendor_id, vendor_owner_id: cq.vendor_owner_id,
      vendor_name: vendor?.business_name || "", quote_id: cq.quote_id || "", rfq_id: cq.rfq_id || "", checkout_quote_id: cq.id,
      items: (cq.items || []).map((i) => ({ line_name: i.line_name, quantity: i.quantity, unit_price: fromCents(i.unit_price_cents), subtotal: fromCents(i.subtotal_cents) })),
      subtotal: fromCents(cq.merchandise_subtotal_cents), delivery_charges: fromCents(cq.delivery_amount_cents),
      taxes: fromCents(cq.tax_amount_cents), platform_fees: fromCents(cq.marketplace_fee_cents),
      total: fromCents(cq.total_amount_cents), total_cents: cq.total_amount_cents,
      fulfillment_method: cq.delivery_method,
      destination_city: cq.destination_city, destination_state: cq.destination_state, destination_zip: cq.destination_zip,
      payment_status: "pending", order_status: "awaiting_payment",
      reservation_expires_at: new Date(Date.now() + RESERVATION_TTL_MINUTES * 60000).toISOString(),
    });
    await svc.entities.CheckoutQuote.update(cq.id, { pricing_status: "consumed", order_id: order.id });
    await recordOrderEvent(svc, { order_id: order.id, event_type: "order_created", new_status: "awaiting_payment", actor_type: "buyer", actor_id: user.id, description: "Order created from checkout quote " + cq.id });

    // Initial ledger (accounting convention: credit = payable to party; debit = owed by marketplace/buyer)
    await createLedgerEntry(svc, { order_id: order.id, entry_type: "merchandise", party_type: "vendor", party_id: cq.vendor_id, description: "Merchandise subtotal", credit_cents: cq.merchandise_subtotal_cents });
    if (cq.delivery_amount_cents) await createLedgerEntry(svc, { order_id: order.id, entry_type: "delivery", party_type: "carrier", description: "Delivery charge", credit_cents: cq.delivery_amount_cents });
    await createLedgerEntry(svc, { order_id: order.id, entry_type: "tax", party_type: "tax_authority", description: "Sales tax (TEST/ESTIMATED)", credit_cents: cq.tax_amount_cents });
    await createLedgerEntry(svc, { order_id: order.id, entry_type: "marketplace_fee", party_type: "marketplace", description: "TreEbay marketplace fee", credit_cents: cq.marketplace_fee_cents });

    await svc.entities.Notification.create({ user_id: cq.vendor_owner_id, type: "new_order", title: "New order received", body: orderNumber, reference_type: "order", reference_id: order.id, read: false });
    return Response.json({ order });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}