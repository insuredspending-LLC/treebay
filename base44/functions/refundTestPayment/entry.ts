import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { initiateRefundWorkflow } from "../../shared/stripe.ts";
import { requireInternalSimulatorAccess } from "../../shared/commerceAccess.ts";
import { notifySafely } from "../../shared/notifications.ts";

// Buyer/admin refund request. Approved TEST refunds finalize internally; LIVE refunds
// remain pending until Stripe confirms success and any seller transfer is reversed.
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
    if (order.buyer_id !== user.id && !isAdmin) {
      return Response.json({ error: "Not authorized" }, { status: 403 });
    }
    if (order.commerce_mode === "test") await requireInternalSimulatorAccess(svc, user);
    if (order.commerce_mode === "payments_disabled") {
      return Response.json({ error: "Payments are disabled for this order." }, { status: 400 });
    }

    const result = await initiateRefundWorkflow(
      svc,
      orderId,
      { type: isAdmin ? "admin" : "buyer", id: user.id },
      reason,
    );
    const refreshed = await svc.entities.Order.get(orderId);
    const completed = refreshed.order_status === "refunded";
    if (completed) {
      await notifySafely(svc, {
        user_id: order.vendor_owner_id,
        type: "general",
        eventType: "refund_completed",
        title: "Order refunded",
        body: order.order_number + " was refunded",
        reference_type: "order",
        reference_id: orderId,
        order_id: orderId,
        buyer_id: order.buyer_id,
        vendor_id: order.vendor_id,
      });
    }
    return Response.json(
      { ...result, order: refreshed, refundPending: !completed },
      { status: completed ? 200 : 202 },
    );
  } catch (error) {
    return Response.json(
      { error: error.message, refundPending: true },
      { status: error.status || (error.message?.includes("transition") ? 409 : 500) },
    );
  }
}
