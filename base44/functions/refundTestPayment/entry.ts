import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { transitionOrder, recordOrderEvent, createRefundLedger, raiseExceptionOnce } from "../../shared/transactions.ts";
import { applyRefundInventoryPolicy } from "../../shared/inventory.ts";
import { generateAndStoreDocument } from "../../shared/documents.ts";

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
    if (payment.status === "refunded") {
      return Response.json({ payment, order, alreadyRefunded: true });
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

    const totalCents = order.total_cents || Math.round((order.total || 0) * 100);
    const cq = order.checkout_quote_id ? await svc.entities.CheckoutQuote.get(order.checkout_quote_id) : null;

    // ---- 4. Process the TEST refund + update the payment record ----
    await svc.entities.PaymentRecord.update(payment.id, {
      status: "refunded", refunded_amount: order.total, refund_status: "full",
    });
    await svc.entities.Order.update(orderId, { payment_status: "refunded" });

    // ---- 5. Reversal ledger entries (history is append-only) ----
    await createRefundLedger(svc, order, cq, totalCents, reason);

    // ---- 6. Inventory per explicit refund policy (status-driven, not blind) ----
    const refundedFrom = order.order_status; // captured before the refund_pending move? use event trail
    const inventory = await applyRefundInventoryPolicy(svc, { ...order, order_status: order.order_status }, "Refund: " + reason);

    // ---- 7. Refund statement ----
    await generateAndStoreDocument(svc, order, "refund_statement", cq, { payment, refundReason: reason, refundAmountCents: totalCents });

    // ---- 8. Final transition ----
    try {
      await transitionOrder(svc, orderId, "refunded", { type: "system", description: "Refund processed (TEST)" });
    } catch (err) {
      // Never leave PaymentRecord=refunded with an un-refunded Order silently.
      await raiseExceptionOnce(svc, {
        severity: "CRITICAL", exception_type: "refund_state_mismatch", order_id: orderId,
        buyer_id: order.buyer_id, vendor_id: order.vendor_id, payment_id: payment.id,
        reason: "Payment is refunded but the order could not transition to refunded: " + err.message,
        technical_details_private: err.message,
        recommended_action: "Admin must reconcile the order status manually.", requires_admin: true,
      });
      return Response.json({ error: "Refund recorded but the order state needs admin reconciliation.", exception: true }, { status: 500 });
    }

    await recordOrderEvent(svc, {
      order_id: orderId, event_type: "refund_processed",
      actor_type: isAdmin ? "admin" : "buyer", actor_id: user.id,
      description: "Test refund processed (" + reason + ")",
      metadata: { inventory_action: inventory.action, inventory_quantity: inventory.quantity, refunded_from: refundedFrom },
    });
    await svc.entities.Notification.create({
      user_id: order.vendor_owner_id, type: "general", title: "Order refunded",
      body: order.order_number + " was refunded", reference_type: "order", reference_id: orderId, read: false,
    });

    return Response.json({
      payment: await svc.entities.PaymentRecord.get(payment.id),
      order: await svc.entities.Order.get(orderId),
      inventory,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}