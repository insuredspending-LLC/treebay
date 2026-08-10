import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { applyDeliveryOption } from "../../shared/transactions.ts";

// Secure delivery option selection: buyer picks a delivery option and provides
// a delivery address. The CheckoutQuote is recalculated with the new delivery
// amount and total. This is the ONLY way to set delivery_method on a CheckoutQuote.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const checkoutQuoteId = body?.checkoutQuoteId;
    const deliveryOptionId = body?.deliveryOptionId;
    if (!checkoutQuoteId || !deliveryOptionId) return Response.json({ error: "checkoutQuoteId and deliveryOptionId required" }, { status: 400 });
    const svc = base44.asServiceRole;
    const quote = await svc.entities.CheckoutQuote.get(checkoutQuoteId);
    if (!quote) return Response.json({ error: "Checkout quote not found" }, { status: 404 });
    if (quote.buyer_id !== user.id) return Response.json({ error: "This checkout quote belongs to another buyer." }, { status: 403 });
    // For non-pickup delivery, require a delivery address.
    const option = await svc.entities.DeliveryOption.get(deliveryOptionId);
    if (!option || option.checkout_quote_id !== checkoutQuoteId) return Response.json({ error: "Invalid delivery option for this quote." }, { status: 400 });
    if (option.provider_type !== "buyer_pickup") {
      const addr = body.address || {};
      if (!addr.street || !addr.city || !addr.state || !addr.zip) return Response.json({ error: "Delivery address (street, city, state, zip) is required for delivery options." }, { status: 400 });
    }
    const updated = await applyDeliveryOption(svc, checkoutQuoteId, deliveryOptionId, body.address || null);
    return Response.json({ checkoutQuote: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.message?.includes("expired") ? 400 : 500 });
  }
}