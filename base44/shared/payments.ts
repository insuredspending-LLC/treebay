// Tree Marketplace TEST payment engine — the ONE implementation.
// Backend functions supply authorization; this module owns the state machine.
// Outcomes: TEST_SUCCESS | TEST_DECLINED | TEST_TIMEOUT.

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

// Shared payment-confirmation sequence used by BOTH the TEST engine and the LIVE
// Stripe webhook path. Idempotent: a no-op if the order is already paid. This is the
// ONE place an order transitions to payment_confirmed/inventory_reserved and the
// allocation ledger is written, so TEST and LIVE can never diverge in state.
export async function confirmOrderPayment(svc, orderId, p) {
  let order = await svc.entities.Order.get(orderId);
  if (!order) throw new Error("Order not found");
  if (order.payment_status === "paid") return { alreadyPaid: true };

  const cq = order.checkout_quote_id ? await svc.entities.CheckoutQuote.get(order.checkout_quote_id) : null;
  const holdsInventory = checkoutHoldsInventory(cq);
  if (holdsInventory) {
    const reservation = await getActiveReservation(svc, orderId, cq.product_id);
    if (!reservation) throw new Error("No active inventory reservation. Please restart checkout.");
    if (reservation.quantity !== checkoutQuantity(cq)) throw new Error("Reservation quantity does not match this order.");
    if (isReservationExpired(reservation)) throw new Error("Your inventory hold expired. Please restart checkout.");
  }
  await assertVendorSellable(svc, order.vendor_id);

  const payments = await svc.entities.PaymentRecord.filter({ order_id: orderId });
  let payment = (payments || [])[0];
  const now = new Date().toISOString();
  if (!payment) {
    payment = await svc.entities.PaymentRecord.create({
      order_id: orderId, buyer_id: order.buyer_id, vendor_owner_id: order.vendor_owner_id,
      commerce_mode: order.commerce_mode || "test", provider: p.provider, amount: order.total,
      amount_cents: order.total_cents || Math.round((order.total || 0) * 100), status: "pending",
    });
  }
  await svc.entities.PaymentRecord.update(payment.id, {
    status: "paid", paid_at: now, transaction_ref: p.paymentRef,
    provider_payment_id: p.providerPaymentId || p.paymentRef, provider: p.provider,
  });

  await transitionOrder(svc, orderId, "payment_confirmed", { type: p.actor.type, id: p.actor.id, description: p.provider + " payment confirmed" });
  await transitionOrder(svc, orderId, "inventory_reserved", { type: "system", description: "Inventory reserved for fulfillment" });
  await svc.entities.Order.update(orderId, {
    vendor_confirm_deadline: new Date(Date.now() + VENDOR_CONFIRM_HOURS * 3600000).toISOString(),
    payment_status: "paid",
  });
  await recordOrderEvent(svc, { order_id: orderId, event_type: "payment_succeeded", actor_type: p.actor.type, actor_id: p.actor.id, description: p.provider + " payment succeeded (" + p.paymentRef + ")" });

  if (holdsInventory) {
    const reservation = await getActiveReservation(svc, orderId, cq.product_id);
    if (reservation) await svc.entities.InventoryReservation.update(reservation.id, { expires_at: null });
  }

  order = await svc.entities.Order.get(orderId);
  if (cq) await createAllocationLedger(svc, order, cq, p.paymentRef);
  await resolvePaymentExceptions(svc, orderId, "Payment succeeded — payment exception resolved");

  await raiseExceptionOnce(svc, {
    severity: "WARNING", exception_type: "vendor_confirmation_reminder",
    order_id: orderId, buyer_id: order.buyer_id, vendor_id: order.vendor_id,
    reason: "Vendor confirmation pending for " + order.order_number,
    recommended_action: "Vendor should confirm the order.",
    requires_admin: false, status: "AUTO_RETRYING",
    retry_count: 0, max_retries: 2,
    next_retry_at: new Date(Date.now() + (VENDOR_CONFIRM_HOURS - 12) * 3600000).toISOString(),
  });

  const paidPayment = await svc.entities.PaymentRecord.get(payment.id);
  await generateAndStoreDocument(svc, order, "buyer_invoice", cq, { payment: paidPayment });
  await generateAndStoreDocument(svc, order, "buyer_receipt", cq, { payment: paidPayment });
  await notifySafely(svc, { user_id: order.vendor_owner_id, type: "order_accepted", eventType: "payment_confirmed", title: "Payment received — please confirm order", body: order.order_number, reference_type: "order", reference_id: orderId, order_id: orderId, buyer_id: order.buyer_id, vendor_id: order.vendor_id });
  return { ok: true };
}

export async function processTestPayment(svc, orderId, outcome, actor) {
  let order = await svc.entities.Order.get(orderId);
  if (!order) return err(404, "Order not found");

  // Idempotency: already paid.
  if (order.payment_status === "paid") {
    return { ok: true, status: 200, body: { order, alreadyPaid: true, outcome: "ALREADY_PAID" } };
  }

  const cq = order.checkout_quote_id ? await svc.entities.CheckoutQuote.get(order.checkout_quote_id) : null;
  const holdsInventory = checkoutHoldsInventory(cq);
  const requiredQty = cq ? checkoutQuantity(cq) : 0;

  // ---- Retry path: payment_failed -> re-establish reservation -> awaiting_payment ----
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
        } catch (e) {
          // Inventory unavailable on retry: stay payment_failed, never mark paid.
          await raiseExceptionOnce(svc, {
            severity: "ACTION_REQUIRED", exception_type: "inventory_unavailable", order_id: orderId,
            buyer_id: order.buyer_id, vendor_id: order.vendor_id,
            reason: "Cannot re-reserve inventory for " + order.order_number + ": " + e.message,
            recommended_action: "Buyer should reduce quantity or choose another listing.",
            requires_admin: false, status: "WAITING_ON_BUYER",
          });
          return err(409, "Insufficient inventory for retry: " + e.message);
        }
      }
    }
    await transitionOrder(svc, orderId, "awaiting_payment", {
      type: actor.type, id: actor.id, description: "Retrying payment — inventory re-reserved",
    });
    await svc.entities.Order.update(orderId, {
      reservation_expires_at: new Date(Date.now() + RESERVATION_TTL_MINUTES * 60000).toISOString(),
    });
    order = await svc.entities.Order.get(orderId);
  }

  if (order.order_status !== "awaiting_payment") {
    return err(400, "This order is not awaiting payment (current state: " + order.order_status + ").");
  }

  // ---- Preconditions: a valid reservation already covers this order ----
  // Payment does NOT require another full order quantity to still be available.
  if (holdsInventory) {
    const reservation = await getActiveReservation(svc, orderId, cq.product_id);
    if (!reservation) return err(409, "No active inventory reservation for this order. Please restart checkout.");
    if (reservation.quantity !== requiredQty) return err(409, "Reservation quantity does not match this order. Please restart checkout.");
    if (isReservationExpired(reservation)) return err(409, "Your inventory hold expired. Please restart checkout.");
  }
  try {
    await assertVendorSellable(svc, order.vendor_id);
  } catch (e) {
    return err(403, e.message);
  }

  const payments = await svc.entities.PaymentRecord.filter({ order_id: orderId });
  let payment = (payments || [])[0];
  if (!payment) {
    payment = await svc.entities.PaymentRecord.create({
      order_id: orderId, buyer_id: order.buyer_id, vendor_owner_id: order.vendor_owner_id,
      commerce_mode: order.commerce_mode || "test", provider: "trebay_test", amount: order.total,
      amount_cents: order.total_cents || Math.round((order.total || 0) * 100),
      status: "pending",
    });
  }
  const now = new Date().toISOString();

  if (outcome === "TEST_SUCCESS") {
    const transactionRef = "TEST-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
    await confirmOrderPayment(svc, orderId, {
      provider: "trebay_test", paymentRef: transactionRef, providerPaymentId: transactionRef,
      actor: { type: actor.type, id: actor.id },
    });
    return { ok: true, status: 200, body: { order: await svc.entities.Order.get(orderId), payment: "paid", transactionRef, outcome: "TEST_SUCCESS" } };
  }

  // ---- Failure (TEST_DECLINED / TEST_TIMEOUT) ----
  await svc.entities.PaymentRecord.update(payment.id, { status: "failed", failed_at: now });
  await transitionOrder(svc, orderId, "payment_failed", { type: "payment_provider", id: "trebay_test", description: "Test payment failed: " + outcome });
  await recordOrderEvent(svc, { order_id: orderId, event_type: "payment_failed", actor_type: "payment_provider", actor_id: "trebay_test", description: "Test payment failed: " + outcome });
  if (holdsInventory) await releaseForOrder(svc, orderId, "Payment failed: " + outcome);
  await raiseExceptionOnce(svc, {
    severity: "WARNING", exception_type: outcome === "TEST_TIMEOUT" ? "payment_timeout" : "payment_failed",
    order_id: orderId, buyer_id: order.buyer_id, vendor_id: order.vendor_id,
    reason: "Test payment failed: " + outcome, recommended_action: "Buyer may retry payment.",
    requires_admin: false, status: "WAITING_ON_BUYER",
  });
  return { ok: true, status: 200, body: { order: await svc.entities.Order.get(orderId), payment: "failed", outcome } };
}