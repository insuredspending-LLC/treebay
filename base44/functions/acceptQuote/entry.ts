import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { toCents, assembleCheckout } from "../../shared/transactions.ts";

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

    // Mark quote as pending_acceptance and RFQ as checkout_pending — do NOT finalize yet.
    // Finalization (quote accepted, others declined, RFQ awarded) happens only when
    // an authoritative Order is created via createOrderFromCheckout.
    await svc.entities.VendorQuote.update(quoteId, { status: "pending_acceptance" });
    await svc.entities.RFQ.update(rfq.id, { status: "checkout_pending" });

    const items = (quote.items || []).map((i) => {
      const qty = Number(i.quantity_offered) || 0;
      const up = toCents(Number(i.unit_price) || 0);
      return { line_name: i.line_name, quantity: qty, unit_price_cents: up, subtotal_cents: up * qty };
    });
    const merchCents = items.reduce((s, i) => s + i.subtotal_cents, 0);
    const result = await assembleCheckout(svc, {
      buyer_id: user.id, vendor_id: quote.vendor_id, vendor_owner_id: quote.vendor_owner_id,
      source_type: "accepted_quote", quote_id: quote.id, rfq_id: rfq.id, items, merchandise_cents: merchCents,
      destination: { city: rfq.delivery_city, state: rfq.delivery_state, zip: rfq.delivery_zip },
      deliveryMethod: body.deliveryMethod || null,
    });
    await svc.entities.Notification.create({ user_id: quote.vendor_owner_id, type: "quote_accepted", title: "Quote accepted!", body: "Checkout started for " + rfq.delivery_city, reference_type: "rfq", reference_id: rfq.id, read: false });
    return Response.json({ checkoutQuote: result.checkoutQuote, deliveryOptions: result.deliveryOptions });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}