import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { transitionOrder, raiseExceptionOnce } from "../../shared/transactions.ts";
import { resumePendingRefund } from "../../shared/refunds.ts";
import { notifySafely } from "../../shared/notifications.ts";

// Authoritative TEST refund. No real money moves, but every state change is
// validated and audited. History is never rewritten — refunds add reversal entries.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const orderId = body?.orderId;
    const reason = body?.reason || "Buyer refund request";
    if (!orderId) return Response.json({ error: "orderId required" }, { status: 400 });

    const svc = base44.asServiceRole;
    const order = await svc.entities.Order.get(orderId);
    if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
    const isAdmin = user.role === "admin";
    if (order.buyer_id !== user.id && !isAdmin) return Response.json({ error: "Not authorized" }, { status: 403 });

    // ---- 1. Validate the payment is actually paid ----
    const payments = await svc.entities.PaymentRecord.filter({ order_id: orderId });
    const payment = (payments || [])[0];
    if (!payment) return Response.json({ error: "No payment record found for this order." }, { status: 400 });
    // Only treat as fully reconciled when BOTH the Order and the PaymentRecord agree.
    if (order.order_status === "refunded" && payment.status === "refunded" && payment.refund_status === "full") {
      return Response.json({ payment, order, alreadyRefunded: true });
    }
    // PaymentRecord is refunded but the Order is still refund_pending — finish reconciliation.
    if (payment.status === "refunded" && order.order_status === "refund_pending") {
      try {
        const result = await resumePendingRefund(svc, orderId, { type: isAdmin ? "admin" : "buyer", id: user.id });
        await notifySafely(svc, { user_id: order.vendor_owner_id, type: "general", eventType: "refund_completed", title: "Order refunded", body: order.order_number + " was refunded", reference_type: "order", reference_id: orderId, order_id: orderId, buyer_id: order.buyer_id, vendor_id: order.vendor_id });
        return Response.json(result);
      } catch (error) {
        return Response.json({ error: "Refund is pending reconciliation: " + error.message, refundPending: true }, { status: 500 });
      }
    }
    if (payment.status !== "paid") {
      return Response.json({ error: "This order has not been paid, so it cannot be refunded (payment is " + payment.status + ")." }, { status: 400 });
    }

    // ---- 2. Validate refund eligibility ----
    if (["refunded", "cancelled"].includes(order.order_status)) {
      return Response.json({ error: "This order is already " + order.order_status + "." }, { status: 400 });
    }

    // ---- 3. Transition to refund_pending (must succeed — no silent catch) ----
    try {
      await transitionOrder(svc, orderId, "refund_pending", {
        type: isAdmin ? "admin" : "buyer", id: user.id, description: "Refund initiated (TEST): " + reason,
      });
    } catch (err) {
      await raiseExceptionOnce(svc, {
        severity: "ACTION_REQUIRED", exception_type: "refund_blocked", order_id: orderId,
        buyer_id: order.buyer_id, vendor_id: order.vendor_id,
        reason: "Refund could not start from state " + order.order_status + ": " + err.message,
        technical_details_private: err.message,
        recommended_action: "Admin must resolve the order state before refunding.", requires_admin: true,
      });
      return Response.json({ error: "This order cannot be refunded from its current state (" + order.order_status + ")." }, { status: 409 });
    }

    // Stage durable recovery metadata before any reversal work. Payment remains paid
    // until every financial, inventory, and document step has succeeded.
    await svc.entities.PaymentRecord.update(payment.id, {
      refund_status: "pending",
      metadata: { ...(payment.metadata || {}), refund_origin_status: order.order_status, refund_reason: reason },
    });

    try {
      const result = await resumePendingRefund(svc, orderId, { type: isAdmin ? "admin" : "buyer", id: user.id });
      await notifySafely(svc, { user_id: order.vendor_owner_id, type: "general", eventType: "refund_completed", title: "Order refunded", body: order.order_number + " was refunded", reference_type: "order", reference_id: orderId, order_id: orderId, buyer_id: order.buyer_id, vendor_id: order.vendor_id });
      return Response.json(result);
    } catch (error) {
      return Response.json({ error: "Refund is pending reconciliation: " + error.message, refundPending: true }, { status: 500 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}