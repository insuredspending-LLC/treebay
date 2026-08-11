import { transitionOrder, recordOrderEvent, createRefundLedger, verifyRefundReconciliation, raiseExceptionOnce } from "./transactions.ts";
import { applyRefundInventoryPolicy } from "./inventory.ts";
import { generateAndStoreDocument } from "./documents.ts";

// Resume a staged refund from ANY legitimate partial state. All recovery is idempotent:
//   - Order refund_pending + PaymentRecord already refunded/full  -> finalize the order transition
//   - Order refunded + PaymentRecord still pending                  -> finalize the payment record
//   - interrupted refund staging (ledger/inventory/document done, payment/order not) -> complete the missing steps
// Each step checks current state before acting, so re-running after a partial failure is safe.
export async function resumePendingRefund(svc, orderId, actor) {
  const order = await svc.entities.Order.get(orderId);
  if (!order) throw new Error("Order not found");
  const payments = await svc.entities.PaymentRecord.filter({ order_id: orderId });
  const payment = (payments || [])[0];
  if (!payment) throw new Error("No payment record found for this order.");

  // Already fully reconciled — idempotent no-op.
  if (order.order_status === "refunded" && payment.status === "refunded" && payment.refund_status === "full") {
    return { order, payment, alreadyRefunded: true };
  }

  // Only legitimate staged refund states are recoverable.
  const orderStaged = order.order_status === "refund_pending" || order.order_status === "refunded";
  const paymentStaged = payment.status === "paid" || payment.status === "refunded";
  if (!orderStaged || !paymentStaged) {
    throw new Error("Refund is not staged for reconciliation (order=" + order.order_status + ", payment=" + payment.status + ").");
  }

  const metadata = payment.metadata || {};
  let originStatus = metadata.refund_origin_status;
  if (!originStatus) {
    // Staging failed after the Order transitioned to refund_pending — recover the
    // origin state from the audit trail rather than guessing.
    const events = await svc.entities.OrderEvent.filter({ order_id: orderId }, "-created_date", 50);
    const toPending = (events || []).find((e) => e.event_type === "status_transition" && e.new_status === "refund_pending");
    originStatus = toPending?.previous_status || null;
    if (!originStatus) {
      await raiseExceptionOnce(svc, {
        severity: "CRITICAL", exception_type: "refund_reconciliation", order_id: orderId,
        buyer_id: order.buyer_id, vendor_id: order.vendor_id, payment_id: payment.id,
        reason: "Refund origin status could not be determined for " + order.order_number + " — no refund_origin_status metadata and no audit trail entry for the refund_pending transition.",
        technical_details_private: "order_status=" + order.order_status + ", payment_status=" + payment.status,
        recommended_action: "Admin must inspect the order history and set refund_origin_status before retrying the refund.", requires_admin: true,
      });
      throw new Error("Refund origin status could not be determined from metadata or audit trail.");
    }
  }
  const reason = metadata.refund_reason || "Buyer refund request";
  const totalCents = order.total_cents || Math.round((order.total || 0) * 100);
  const cq = order.checkout_quote_id ? await svc.entities.CheckoutQuote.get(order.checkout_quote_id) : null;

  try {
    // 1. Ledger — idempotent per entry (createRefundLedger creates only missing entries).
    await createRefundLedger(svc, order, cq, totalCents, reason);
    // 2. Verify refund reversals reconcile before finalization.
    if (cq) await verifyRefundReconciliation(svc, order, cq);
    // 3. Inventory — idempotent (reservation state guards prevent double-release/reverse).
    const inventory = await applyRefundInventoryPolicy(svc, { ...order, order_status: originStatus }, "Refund: " + reason);
    // 4. Refund statement document.
    await generateAndStoreDocument(svc, order, "refund_statement", cq, { payment, refundReason: reason, refundAmountCents: totalCents });
    // 5. PaymentRecord — only update if not already finalized.
    if (payment.status !== "refunded" || payment.refund_status !== "full") {
      await svc.entities.PaymentRecord.update(payment.id, {
        status: "refunded", refunded_amount: order.total, refund_status: "full",
      });
    }
    // 6. Order payment_status — only update if not already refunded.
    if (order.payment_status !== "refunded") {
      await svc.entities.Order.update(orderId, { payment_status: "refunded" });
    }
    // 7. Order status transition — only if not already refunded.
    if (order.order_status !== "refunded") {
      await transitionOrder(svc, orderId, "refunded", { type: "system", description: "Refund reconciled and finalized (TEST)" });
    }
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