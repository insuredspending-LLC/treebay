import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { genOrderNumber } from "../../shared/marketplace.ts";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const quoteId = body?.quoteId;
    if (!quoteId) return Response.json({ error: "Quote id required" }, { status: 400 });

    const svc = base44.asServiceRole;
    const quote = await svc.entities.VendorQuote.get(quoteId);
    if (!quote) return Response.json({ error: "Quote not found" }, { status: 404 });
    if (quote.status !== "submitted" && quote.status !== "revised") return Response.json({ error: "This quote is no longer available." }, { status: 400 });
    if (quote.expiration_date) { const exp = new Date(quote.expiration_date); if (!isNaN(exp) && exp < new Date()) return Response.json({ error: "This quote has expired." }, { status: 400 }); }

    const rfq = await svc.entities.RFQ.get(quote.rfq_id);
    if (!rfq) return Response.json({ error: "RFQ not found" }, { status: 404 });
    if (rfq.buyer_id !== user.id) return Response.json({ error: "Only the buyer can accept quotes." }, { status: 403 });
    if (rfq.status !== "open" && rfq.status !== "quotes_received") return Response.json({ error: "This RFQ is no longer accepting quotes." }, { status: 400 });

    const items = (quote.items || []).map((i) => ({
      ...i,
      quantity_offered: Number(i.quantity_offered) || 0,
      unit_price: Number(i.unit_price) || 0,
      delivery_price: Number(i.delivery_price) || 0,
      taxes: Number(i.taxes) || 0,
      additional_fees: Number(i.additional_fees) || 0,
      subtotal: (Number(i.quantity_offered) || 0) * (Number(i.unit_price) || 0),
    }));
    const subtotal = items.reduce((s, i) => s + (i.subtotal || 0), 0);
    const delivery = items.reduce((s, i) => s + (i.delivery_price || 0), 0);
    const taxes = items.reduce((s, i) => s + (i.taxes || 0), 0);
    const fees = items.reduce((s, i) => s + (i.additional_fees || 0), 0);
    const total = subtotal + delivery + taxes + fees;

    const orderNumber = genOrderNumber();
    const orderItems = items.map((i) => ({ line_name: i.line_name, quantity: i.quantity_offered, unit_price: i.unit_price, subtotal: i.subtotal }));
    const order = await svc.entities.Order.create({
      order_number: orderNumber, buyer_id: rfq.buyer_id, vendor_id: quote.vendor_id, vendor_owner_id: quote.vendor_owner_id,
      vendor_name: quote.vendor_name, rfq_id: rfq.id, quote_id: quote.id, items: orderItems,
      subtotal, delivery_charges: delivery, taxes, platform_fees: fees, total,
      fulfillment_method: items.some((i) => i.delivery_offered) ? "vendor_delivery" : "pickup",
      destination_city: rfq.delivery_city, destination_state: rfq.delivery_state, destination_zip: rfq.delivery_zip,
      requested_date: rfq.requested_delivery_date, payment_status: "pending", order_status: "pending",
    });

    await svc.entities.VendorQuote.update(quoteId, { status: "accepted" });
    const others = await svc.entities.VendorQuote.filter({ rfq_id: rfq.id, status: "submitted" });
    if (others && others.length) { await svc.entities.VendorQuote.bulkUpdate(others.map((o) => ({ id: o.id, status: "declined" }))); }
    await svc.entities.RFQ.update(rfq.id, { status: "awarded" });
    await svc.entities.Notification.create({ user_id: quote.vendor_owner_id, type: "quote_accepted", title: "Quote accepted!", body: `Order ${orderNumber}`, reference_type: "order", reference_id: order.id, read: false });

    return Response.json({ order });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}