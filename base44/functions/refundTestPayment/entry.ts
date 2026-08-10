import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { transitionOrder, recordOrderEvent, createLedgerEntry, raiseException } from "../../shared/transactions.ts";

// TEST MODE refund. Marks payment refunded, transitions order, records ledger. No real money moves.
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
    const isAuthorized = order.buyer_id === user.id || user.role === "admin";
    if (!isAuthorized) return Response.json({ error: "Not authorized" }, { status: 403 });

    let payments = await svc.entities.PaymentRecord.filter({ order_id: orderId });
    let payment = (payments || [])[0];
    if (!payment) return Response.json({ error: "No payment record found for this order." }, { status: 400 });
    if (payment.status === "refunded") return Response.json({ payment, alreadyRefunded: true });

    const totalCents = order.total_cents || Math.round((order.total || 0) * 100);
    const now = new Date().toISOString();
    await svc.entities.PaymentRecord.update(payment.id, { status: "refunded", refunded_amount: order.total, refund_status: "full" });
    try { await transitionOrder(svc, orderId, "refund_pending", { type: user.role === "admin" ? "admin" : "buyer", id: user.id, description: "Refund initiated (TEST)" }); } catch {}
    try { await transitionOrder(svc, orderId, "refunded", { type: "system", description: "Refund processed (TEST)" }); } catch {}
    await recordOrderEvent(svc, { order_id: orderId, event_type: "refund_processed", actor_type: user.role === "admin" ? "admin" : "buyer", actor_id: user.id, description: "Test refund processed" });
    await createLedgerEntry(svc, { order_id: orderId, entry_type: "refund", party_type: "buyer", party_id: order.buyer_id, description: "Refund to buyer (TEST)", credit_cents: totalCents });
    return Response.json({ payment: await svc.entities.PaymentRecord.get(payment.id), order: await svc.entities.Order.get(orderId) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}