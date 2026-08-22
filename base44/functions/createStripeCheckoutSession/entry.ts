import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { createCheckoutSession } from "../../shared/stripe.ts";

// Creates a Stripe Checkout Session for a LIVE order's buyer payment. The buyer is
// redirected to Stripe-hosted checkout; the webhook confirms payment. TEST orders
// never reach this function.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const orderId = body?.orderId;
    if (!orderId) return Response.json({ error: "orderId required" }, { status: 400 });
    const svc = base44.asServiceRole;
    const order = await svc.entities.Order.get(orderId);
    if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
    if (order.buyer_id !== user.id) return Response.json({ error: "Only the buyer can pay for this order." }, { status: 403 });
    if (order.commerce_mode !== "live") return Response.json({ error: "This order is not a live transaction." }, { status: 400 });
    if (order.order_status !== "awaiting_payment") return Response.json({ error: "This order is not awaiting payment." }, { status: 400 });
    const cq = order.checkout_quote_id ? await svc.entities.CheckoutQuote.get(order.checkout_quote_id) : null;
    if (!cq) return Response.json({ error: "Pricing snapshot not found." }, { status: 400 });
    const vendor = await svc.entities.VendorProfile.get(order.vendor_id);
    if (!vendor) return Response.json({ error: "Seller not found." }, { status: 404 });
    const origin = new URL(req.url).origin;
    const session = await createCheckoutSession(svc, order, cq, vendor, origin);
    return Response.json({ url: session.url, session_id: session.id });
  } catch (error) {
    console.error("createStripeCheckoutSession error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}