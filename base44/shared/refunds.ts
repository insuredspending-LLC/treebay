import {
  transitionOrder, recordOrderEvent, createRefundLedger, verifyRefundReconciliation,
  raiseExceptionOnce, vendorPayableCents,
} from "./transactions.ts";
import { applyRefundInventoryPolicy } from "./inventory.ts";
import { generateAndStoreDocument } from "./documents.ts";

// Finalizes internal refund state only after truth is authoritative:
// - approved TEST: the simulator staged a full refund;
// - LIVE: Stripe reported a succeeded, full refund and any settled seller transfer
//   was reversed before this function runs.
export async function resumePendingRefund(svc, orderId, actor) {
  const order = await svc.entities.Order.get(orderId);
  if (!order) throw new Error("Order not found");
  const payments = await svc.entities.PaymentRecord.filter({ order_id: orderId });
  const payment = (payments || [])[0];
  if (!payment) throw new Error("No payment record found for this order.");

  const totalCents = order.total_cents || Math.round((order.total || 0) * 100);
  if (
    order.order_status === "refunded" &&
    payment.status === "refunded" &&
    payment.refund_status === "full" &&
    (payment.refunded_amount_cents || Math.round((payment.refunded_amount || 0) * 100)) >= totalCents
  ) {
    return { order, payment, alreadyRefunded: true };
  }

  const orderStaged = order.order_status === "refund_pending" || order.order_status === "refunded";
  if (!orderStaged) {
    throw new Error("Refund is not staged for reconciliation (order=" + order.order_status + ").");
  }

  const metadata = payment.metadata || {};
  let originStatus = metadata.refund_origin_status;
  if (!originStatus) {
    const events = await svc.entities.OrderEvent.filter({ order_id: orderId }, "-created_date", 50);
    const toPending = (events || []).find(
      (event) => event.event_type === "status_transition" && event.new_status === "refund_pending",
    );
    originStatus = toPending?.previous_status || null;
    if (!originStatus) {
      await raiseExceptionOnce(svc, {
        severity: "CRITICAL",
        exception_type: "refund_reconciliation",
        order_id: orderId,
        buyer_id: order.buyer_id,
        vendor_id: order.vendor_id,
        payment_id: payment.id,
        reason: "Refund origin status could not be determined for " + order.order_number + ".",
        technical_details_private: "order_status=" + order.order_status + ", payment_status=" + payment.status,
        recommended_action: "Inspect the order history and set refund_origin_status before retrying.",
        requires_admin: true,
      });
      throw new Error("Refund origin status could not be determined from metadata or audit trail.");
    }
  }

  const isLive = order.commerce_mode === "live";
  if (isLive) {
    const refundedCents = payment.refunded_amount_cents || Math.round((payment.refunded_amount || 0) * 100);
    if (payment.provider !== "stripe") throw new Error("Live refund has no authoritative Stripe provider.");
    if (payment.provider_refund_status !== "succeeded") {
      throw new Error("Stripe refund is not provider-confirmed successful (status=" + (payment.provider_refund_status || "none") + ").");
    }
    if (payment.refund_status !== "full" || refundedCents < totalCents) {
      throw new Error("A partial live refund cannot finalize the order as fully refunded.");
    }
  } else if (order.commerce_mode !== "test") {
    throw new Error("Refunds are disabled for this commerce mode.");
  }

  const reason = metadata.refund_reason || "Buyer refund request";
  const cq = order.checkout_quote_id ? await svc.entities.CheckoutQuote.get(order.checkout_quote_id) : null;

  if (isLive && order.stripe_transfer_id && cq) {
    const requiredReversal = vendorPayableCents(cq);
    if ((order.stripe_transfer_reversed_cents || 0) < requiredReversal) {
      throw new Error("Seller transfer reversal is incomplete; live refund remains quarantined.");
    }
  }

  try {
    await createRefundLedger(svc, order, cq, totalCents, reason);
    if (cq) await verifyRefundReconciliation(svc, order, cq);
    const inventory = await applyRefundInventoryPolicy(
      svc,
      { ...order, order_status: originStatus },
      "Refund: " + reason,
    );
    await generateAndStoreDocument(svc, order, "refund_statement", cq, {
      payment,
      refundReason: reason,
      refundAmountCents: totalCents,
    });

    if (!isLive && (
      payment.status !== "refunded" ||
      payment.refund_status !== "full" ||
      (payment.refunded_amount_cents || 0) < totalCents
    )) {
      await svc.entities.PaymentRecord.update(payment.id, {
        status: "refunded",
        refunded_amount: order.total,
        refunded_amount_cents: totalCents,
        refund_status: "full",
        provider_refund_status: "succeeded",
        refund_last_event_at: new Date().toISOString(),
      });
    }

    if (order.payment_status !== "refunded") {
      await svc.entities.Order.update(orderId, {
        payment_status: "refunded",
        financial_hold: order.stripe_dispute_status && order.stripe_dispute_status !== "won",
        financial_hold_reason: order.stripe_dispute_status && order.stripe_dispute_status !== "won"
          ? "Stripe dispute remains open after refund."
          : null,
      });
    }
    if (order.order_status !== "refunded") {
      await transitionOrder(svc, orderId, "refunded", {
        type: actor?.type || "system",
        id: actor?.id,
        description: isLive
          ? "Provider-confirmed refund reconciled and finalized"
          : "Approved test refund reconciled and finalized",
      });
    }

    const existing = await svc.entities.OrderEvent.filter({ order_id: orderId, event_type: "refund_processed" }, "-created_date", 50);
    if (!(existing || []).some((event) => event.metadata?.provider_refund_id === payment.provider_refund_id)) {
      await recordOrderEvent(svc, {
        order_id: orderId,
        event_type: "refund_processed",
        actor_type: actor?.type || "system",
        actor_id: actor?.id,
        description: (isLive ? "Stripe refund finalized" : "Approved test refund processed") + " (" + reason + ")",
        metadata: {
          inventory_action: inventory.action,
          inventory_quantity: inventory.quantity,
          refunded_from: originStatus,
          provider_refund_id: payment.provider_refund_id || "approved-test",
        },
      });
    }
    return {
      order: await svc.entities.Order.get(orderId),
      payment: await svc.entities.PaymentRecord.get(payment.id),
      inventory,
    };
  } catch (error) {
    await raiseExceptionOnce(svc, {
      severity: "CRITICAL",
      exception_type: "refund_reconciliation",
      order_id: orderId,
      buyer_id: order.buyer_id,
      vendor_id: order.vendor_id,
      payment_id: payment.id,
      reason: "Refund reconciliation failed for " + order.order_number + ": " + error.message,
      technical_details_private: error.message,
      recommended_action: "Keep the order quarantined and retry after correcting the provider/ledger/inventory state.",
      requires_admin: true,
    });
    throw error;
  }
}
