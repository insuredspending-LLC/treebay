import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Creates a pending test PaymentRecord for an order. Idempotent: returns existing if present.
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
    if (order.buyer_id !== user.id) return Response.json({ error: "Only the buyer can pay." }, { status: 403 });
    let payments = await svc.entities.PaymentRecord.filter({ order_id: orderId });
    let payment = (payments || [])[0];
    if (!payment) {
      payment = await svc.entities.PaymentRecord.create({
        order_id: orderId, buyer_id: user.id, vendor_owner_id: order.vendor_owner_id,
        provider: "trebay_test", amount: order.total, amount_cents: order.total_cents || Math.round((order.total || 0) * 100),
        status: "pending",
      });
    }
    return Response.json({ payment });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}