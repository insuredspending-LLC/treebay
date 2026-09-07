// Tree Marketplace payment engine.
// Simulated outcomes are restricted to approved closed-test users/admins. The shared
// confirmation sequence is resumable and idempotent for both approved TEST and Stripe LIVE.

import {
  transitionOrder, recordOrderEvent, createAllocationLedger, raiseExceptionOnce,
  resolvePaymentExceptions, assertVendorSellable, VENDOR_CONFIRM_HOURS, RESERVATION_TTL_MINUTES,
} from "./transactions.ts";
import { notifySafely } from "./notifications.ts";
import {
  reserveForOrder, releaseForOrder, getActiveReservation, isReservationExpired,
  checkoutQuantity, checkoutHoldsInventory,
} from "./inventory.ts";
import { generateAndStoreDocument } from "./documents.ts";

function err(status, message, extra) {
  return { ok: false, status, body: { error: message, ...(extra || {}) } };
}

const PAID_LIFECYCLE = new Set([
  "inventory_reserved", "vendor_confirmed", "preparing", "ready_for_pickup",
  "delivery_assigned", "picked_up", "in_transit", "delivered", "completed",
  "settlement_pending", "settled", "refund_pending", "refunded", "disputed",
]);

async function paymentSucceededEventExists(svc, orderId, paymentRef) {
  const events = await svc.entities.OrderEvent.filter({ order_id: orderId, event_type: "payment_succeeded" }, "-created_date", 50);
  return (events || []).some((event) => event.metadata?.payment_reference === paymentRef);
}

// Resumable confirmation. PaymentRecord.status=paid is not treated as proof that
// inventory, ledger, documents, notifications, and order state all finished.
export async function confirmOrderPayment(svc, orderId, p) {
  let order = await svc.entities.Order.get(orderId);
  if (!order) throw new Error("Order not found");
  if (!["live", "stripe_test", "test"].includes(order.commerce_mode)) throw new Error("Payments are disabled for this order.");
  if (["live", "stripe_test"].includes(order.commerce_mode) && p.provider !== "stripe") throw new Error("A live order requires Stripe confirmation.");
  if (order.commerce_mode === "test" && p.provider === "stripe") throw new Error("A test order cannot use Stripe confirmation.");
  if (["cancelled", "refunded"].includes(order.order_status)) throw new Error("A payment cannot be reconciled into a terminal order.");

  const cq = order.checkout_quote_id ? await svc.entities.CheckoutQuote.get(order.checkout_quote_id) : null;
  const holdsInventory = checkoutHoldsInventory(cq);
  const payments = await svc.entities.PaymentRecord.filter({ order_id: orderId });
  let payment = (payments || [])[0];
  const now = new Date().toISOString();

  if (!payment) {
    payment = await svc.entities.PaymentRecord.create({
      order_id: orderId,
      buyer_id: order.buyer_id,
      vendor_owner_id: order.vendor_owner_id,
      commerce_mode: order.commerce_mode,
      provider: p.provider,
      amount: order.total,
      amount_cents: order.total_cents || Math.round((order.total || 0) * 100),
      status: "pending",
      confirmation_status: "pending",
    });
  }

  const existingProviderId = payment.provider_payment_id || null;
  const incomingProviderId = p.providerPaymentId || p.paymentRef;
  if (payment.status === "paid" && existingProviderId && incomingProviderId && existingProviderId !== incomingProviderId) {
    throw new Error("Payment integrity error: a different provider payment is already attached to this order.");
  }

  await svc.entities.PaymentRecord.update(payment.id, {
    status: "paid",
    paid_at: payment.paid_at || now,
    transaction_ref: payment.transaction_ref || p.paymentRef,
    provider_payment_id: existingProviderId || incomingProviderId,
    provider: p.provider,
    confirmation_status: "reconciling",
  });

  try {
    order = await svc.entities.Order.get(orderId);

    // A provider-confirmed Stripe payment may arrive just after the local hold clock,
    // but only while the reservation still exists and has not been released.
    if (holdsInventory && !PAID_LIFECYCLE.has(order.order_status)) {
      const reservation = await getActiveReservation(svc, orderId, cq.product_id);
      if (!reservation) throw new Error("No active inventory reservation. Payment requires manual reconciliation.");
      if (reservation.quantity !== checkoutQuantity(cq)) throw new Error("Reservation quantity does not match this order.");
      if (isReservationExpired(reservation) && !p.allowExpiredReservation) {
        throw new Error("The inventory hold expired. Please restart checkout.");
      }
    }

    await assertVendorSellable(svc, order.vendor_id);

    if (order.order_status === "awaiting_payment") {
      await transitionOrder(svc, orderId, "payment_confirmed", {
        type: p.actor.type, id: p.actor.id, description: p.provider + " payment confirmed",
      });
      order = await svc.entities.Order.get(orderId);
    }
    if (order.order_status === "payment_confirmed") {
      await transitionOrder(svc, orderId, "inventory_reserved", {
        type: "system", id: "payment_reconciliation", description: "Inventory reserved for fulfillment",
      });
      order = await svc.entities.Order.get(orderId);
    }
    if (!PAID_LIFECYCLE.has(order.order_status)) {
      throw new Error("Payment confirmation cannot resume from order state " + order.order_status + ".");
    }

    const vendorDeadline = order.vendor_confirm_deadline ||
      new Date(Date.now() + VENDOR_CONFIRM_HOURS * 3600000).toISOString();
    await svc.entities.Order.update(orderId, {
      vendor_confirm_deadline: vendorDeadline,
      payment_status: "paid",
      financial_hold: order.financial_hold || false,
    });

    if (!(await paymentSucceededEventExists(svc, orderId, p.paymentRef))) {
      await recordOrderEvent(svc, {
        order_id: orderId,
        event_type: "payment_succeeded",
        actor_type: p.actor.type,
        actor_id: p.actor.id,
        description: p.provider + " payment succeeded (" + p.paymentRef + ")",
        metadata: { payment_reference: p.paymentRef, provider_payment_id: incomingProviderId },
      });
    }

    if (holdsInventory) {
      const reservation = await getActiveReservation(svc, orderId, cq.product_id);
      if (reservation && reservation.expires_at) {
        await svc.entities.InventoryReservation.update(reservation.id, { expires_at: null });
      }
    }

    order = await svc.entities.Order.get(orderId);
    if (cq) await createAllocationLedger(svc, order, cq, p.paymentRef);
    await resolvePaymentExceptions(svc, orderId, "Payment succeeded — payment exception resolved");

    await raiseExceptionOnce(svc, {
      severity: "WARNING",
      exception_type: "vendor_confirmation_reminder",
      order_id: orderId,
      buyer_id: order.buyer_id,
      vendor_id: order.vendor_id,
      reason: "Vendor confirmation pending for " + order.order_number,
      recommended_action: "Vendor should confirm the order.",
      requires_admin: false,
      status: "AUTO_RETRYING",
      retry_count: 0,
      max_retries: 2,
      next_retry_at: new Date(Date.now() + (VENDOR_CONFIRM_HOURS - 12) * 3600000).toISOString(),
    });

    const paidPayment = await svc.entities.PaymentRecord.get(payment.id);
    await generateAndStoreDocument(svc, order, "buyer_invoice", cq, { payment: paidPayment });
    await generateAndStoreDocument(svc, order, "buyer_receipt", cq, { payment: paidPayment });

    // Notification delivery is best-effort and never rolls the financial state back.
    await notifySafely(svc, {
      user_id: order.vendor_owner_id,
      type: "order_accepted",
      eventType: "payment_confirmed",
      title: "Payment received — please confirm order",
      body: order.order_number,
      reference_type: "order",
      reference_id: orderId,
      order_id: orderId,
      buyer_id: order.buyer_id,
      vendor_id: order.vendor_id,
    });

    await svc.entities.PaymentRecord.update(payment.id, {
      confirmation_status: "complete",
      confirmation_completed_at: new Date().toISOString(),
    });
    return { ok: true, resumed: payment.confirmation_status !== "complete" };
  } catch (error) {
    await svc.entities.PaymentRecord.update(payment.id, { confirmation_status: "failed" });
    await raiseExceptionOnce(svc, {
      severity: "CRITICAL",
      exception_type: "payment_confirmation_reconciliation",
      order_id: orderId,
      buyer_id: order.buyer_id,
      vendor_id: order.vendor_id,
      payment_id: payment.id,
      reason: "Payment confirmation is incomplete for " + order.order_number + ": " + error.message,
      technical_details_private: error.message,
      recommended_action: "Do not fulfill until payment reconciliation completes. Retry the authoritative provider event.",
      requires_admin: true,
    });
    throw error;
  }
}

export async function processTestPayment(svc, orderId, outcome, actor) {
  let order = await svc.entities.Order.get(orderId);
  if (!order) return err(404, "Order not found");
  if (order.commerce_mode !== "test") {
    return err(400, "The test payment engine can process approved test orders only.");
  }
  if (actor?.type !== "admin" && actor?.simulator_authorized !== true) {
    return err(403, "Simulated purchases are restricted to approved closed-test participants.");
  }

  if (order.payment_status === "paid") {
    try {
      await confirmOrderPayment(svc, orderId, {
        provider: "trebay_test",
        paymentRef: (await svc.entities.PaymentRecord.filter({ order_id: orderId }))?.[0]?.transaction_ref || "TEST-RECONCILE",
        providerPaymentId: (await svc.entities.PaymentRecord.filter({ order_id: orderId }))?.[0]?.provider_payment_id || "TEST-RECONCILE",
        actor: { type: actor.type, id: actor.id },
      });
    } catch (error) {
      return err(409, "Test payment reconciliation is incomplete: " + error.message);
    }
    return { ok: true, status: 200, body: { order: await svc.entities.Order.get(orderId), alreadyPaid: true, outcome: "ALREADY_PAID" } };
  }

  const cq = order.checkout_quote_id ? await svc.entities.CheckoutQuote.get(order.checkout_quote_id) : null;
  const holdsInventory = checkoutHoldsInventory(cq);
  const requiredQty = cq ? checkoutQuantity(cq) : 0;

  if (order.order_status === "payment_failed") {
    if (holdsInventory) {
      let reservation = await getActiveReservation(svc, orderId, cq.product_id);
      if (!reservation) {
        const product = await svc.entities.Product.get(cq.product_id);
        if (!product || product.listing_status === "archived") {
          await raiseExceptionOnce(svc, {
            severity: "ACTION_REQUIRED", exception_type: "inventory_unavailable", order_id: orderId,
            buyer_id: order.buyer_id, vendor_id: order.vendor_id,
            reason: "Listing is no longer available for " + order.order_number,
            recommended_action: "Buyer should choose another listing or request a quote.",
            requires_admin: false, status: "WAITING_ON_BUYER",
          });
          return err(409, "This listing is no longer available.");
        }
        try {
          const res = await reserveForOrder(svc, {
            order_id: orderId, checkout_quote_id: cq.id, product_id: cq.product_id,
            buyer_id: order.buyer_id, vendor_id: order.vendor_id, quantity: requiredQty,
            expires_at: new Date(Date.now() + RESERVATION_TTL_MINUTES * 60000).toISOString(),
          });
          reservation = res.reservation;
        } catch (error) {
          await raiseExceptionOnce(svc, {
            severity: "ACTION_REQUIRED", exception_type: "inventory_unavailable", order_id: orderId,
            buyer_id: order.buyer_id, vendor_id: order.vendor_id,
            reason: "Cannot re-reserve inventory for " + order.order_number + ": " + error.message,
            recommended_action: "Buyer should reduce quantity or choose another listing.",
            requires_admin: false, status: "WAITING_ON_BUYER",
          });
          return err(409, "Insufficient inventory for retry: " + error.message);
        }
      }
    }
    await transitionOrder(svc, orderId, "awaiting_payment", {
      type: actor.type, id: actor.id, description: "Retrying approved test payment — inventory re-reserved",
    });
    await svc.entities.Order.update(orderId, {
      reservation_expires_at: new Date(Date.now() + RESERVATION_TTL_MINUTES * 60000).toISOString(),
    });
    order = await svc.entities.Order.get(orderId);
  }

  if (order.order_status !== "awaiting_payment") {
    return err(400, "This order is not awaiting payment (current state: " + order.order_status + ").");
  }

  if (holdsInventory) {
    const reservation = await getActiveReservation(svc, orderId, cq.product_id);
    if (!reservation) return err(409, "No active inventory reservation for this order. Please restart checkout.");
    if (reservation.quantity !== requiredQty) return err(409, "Reservation quantity does not match this order. Please restart checkout.");
    if (isReservationExpired(reservation)) return err(409, "Your inventory hold expired. Please restart checkout.");
  }
  try {
    await assertVendorSellable(svc, order.vendor_id);
  } catch (error) {
    return err(403, error.message);
  }

  const payments = await svc.entities.PaymentRecord.filter({ order_id: orderId });
  let payment = (payments || [])[0];
  if (!payment) {
    payment = await svc.entities.PaymentRecord.create({
      order_id: orderId,
      buyer_id: order.buyer_id,
      vendor_owner_id: order.vendor_owner_id,
      commerce_mode: "test",
      provider: "trebay_test",
      amount: order.total,
      amount_cents: order.total_cents || Math.round((order.total || 0) * 100),
      status: "pending",
      confirmation_status: "pending",
    });
  }
  const now = new Date().toISOString();

  if (outcome === "TEST_SUCCESS") {
    const transactionRef = "TEST-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
    await confirmOrderPayment(svc, orderId, {
      provider: "trebay_test",
      paymentRef: transactionRef,
      providerPaymentId: transactionRef,
      actor: { type: actor.type, id: actor.id },
    });
    return {
      ok: true,
      status: 200,
      body: { order: await svc.entities.Order.get(orderId), payment: "paid", transactionRef, outcome: "TEST_SUCCESS" },
    };
  }

  if (!["TEST_DECLINED", "TEST_TIMEOUT"].includes(outcome)) {
    return err(400, "Unknown approved test payment outcome.");
  }
  await svc.entities.PaymentRecord.update(payment.id, {
    status: "failed", failed_at: now, confirmation_status: "pending",
  });
  await transitionOrder(svc, orderId, "payment_failed", {
    type: "payment_provider", id: "trebay_test", description: "Approved test payment failed: " + outcome,
  });
  await recordOrderEvent(svc, {
    order_id: orderId, event_type: "payment_failed", actor_type: "payment_provider",
    actor_id: "trebay_test", description: "Approved test payment failed: " + outcome,
  });
  if (holdsInventory) await releaseForOrder(svc, orderId, "Approved test payment failed: " + outcome);
  await raiseExceptionOnce(svc, {
    severity: "WARNING",
    exception_type: outcome === "TEST_TIMEOUT" ? "payment_timeout" : "payment_failed",
    order_id: orderId,
    buyer_id: order.buyer_id,
    vendor_id: order.vendor_id,
    reason: "Approved test payment failed: " + outcome,
    recommended_action: "Tester may retry payment.",
    requires_admin: false,
    status: "WAITING_ON_BUYER",
  });
  return { ok: true, status: 200, body: { order: await svc.entities.Order.get(orderId), payment: "failed", outcome } };
}
