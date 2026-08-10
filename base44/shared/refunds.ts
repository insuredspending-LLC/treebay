import { transitionOrder, recordOrderEvent, createRefundLedger, raiseExceptionOnce } from "./transactions.ts";
import { applyRefundInventoryPolicy } from "./inventory.ts";
import { generateAndStoreDocument } from "./documents.ts";

export async function resumePendingRefund(svc, orderId, actor) {
  const order = await svc.entities.Order.get(orderId);
  if (!order) throw new Error("Order not found");
  const payments = await svc.entities.PaymentRecord.filter({ order_id: orderId });
  const payment = (payments || [])[0];
  if (!payment) throw new Error("No payment record found for this order.");
  if (payment.status === "refunded" && order.order_status === "refunded") return { order, payment, alreadyRefunded: true };
  if (order.order_status !== "refund_pending" || payment.refund_status !== "pending") throw new Error("Refund is not staged for reconciliation.");

  const metadata = payment.metadata || {};
  const originStatus = metadata.refund_origin_status || "delivered";
  const reason = metadata.refund_reason || "Buyer refund request";
  const totalCents = order.total_cents || Math.round((order.total || 0) * 100);
  const cq = order.checkout_quote_id ? await svc.entities.CheckoutQuote.get(order.checkout_quote_id) : null;

  try {
    await createRefundLedger(svc, order, cq, totalCents, reason);
    const inventory = await applyRefundInventoryPolicy(svc, { ...order, order_status: originStatus }, "Refund: " + reason);
    await generateAndStoreDocument(svc, order, "refund_statement", cq, { payment, refundReason: reason, refundAmountCents: totalCents });
    await svc.entities.PaymentRecord.update(payment.id, {
      status: "refunded", refunded_amount: order.total, refund_status: "full",
    });
    await svc.entities.Order.update(orderId, { payment_status: "refunded" });
    await transitionOrder(svc, orderId, "refunded", { type: "system", description: "Refund reconciled and finalized (TEST)" });
    await recordOrderEvent(svc, {
      order_id: orderId, event_type: "refund_processed", actor_type: actor?.type || "system", actor_id: actor?.id,
      description: "Test refund processed (" + reason + ")",
      metadata: { inventory_action: inventory.action, inventory_quantity: inventory.quantity, refunded_from: originStatus },
    });
    return { order: await svc.entities.Order.get(orderId), payment: await svc.entities.PaymentRecord.get(payment.id), inventory };
  } catch (error) {
    await raiseExceptionOnce(svc, {
      severity: "CRITICAL", exception_type: "refund_reconciliation", order_id: orderId,
      buyer_id: order.buyer_id, vendor_id: order.vendor_id, payment_id: payment.id,
      reason: "Refund reconciliation failed for " + order.order_number + ": " + error.message,
      technical_details_private: error.message,
      recommended_action: "Run Transaction Maintenance or retry the refund after correcting the failing internal step.", requires_admin: true,
    });
    throw error;
  }
}