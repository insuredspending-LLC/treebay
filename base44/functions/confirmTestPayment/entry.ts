import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { transitionOrder, reserveInventory, releaseInventory, recordOrderEvent, createPaymentLedgerEntry, raiseException, resolveExceptionsForOrder, VENDOR_CONFIRM_HOURS, RESERVATION_TTL_MINUTES } from "../../shared/transactions.ts";
import { generateAndStoreDocument } from "../../shared/documents.ts";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const orderId = body?.orderId;
    const outcome = body?.outcome || "TEST_SUCCESS";
    if (!orderId) return Response.json({ error: "orderId required" }, { status: 400 });
    const svc = base44.asServiceRole;
    const order = await svc.entities.Order.get(orderId);
    if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
    if (order.buyer_id !== user.id) return Response.json({ error: "Only the buyer can pay for this order." }, { status: 403 });

    // Idempotency: already paid
    if (order.payment_status === "paid") return Response.json({ order, alreadyPaid: true });

    // On retry from payment_failed, re-reserve inventory before attempting payment.
    if (order.order_status === "payment_failed" && order.checkout_quote_id) {
      const cq = await svc.entities.CheckoutQuote.get(order.checkout_quote_id);
      if (cq && cq.source_type === "direct_listing" && cq.product_id) {
        const qty = (cq.items || []).reduce((s, i) => s + (i.quantity || 0), 0);
        try { await reserveInventory(svc, cq.product_id, qty); }
        catch (e) { return Response.json({ error: "Insufficient inventory for retry: " + e.message }, { status: 400 }); }
      }
      // Re-extend reservation
      await svc.entities.Order.update(orderId, { reservation_expires_at: new Date(Date.now() + RESERVATION_TTL_MINUTES * 60000).toISOString() });
    }

    // Find or create payment record (idempotent)
    let payments = await svc.entities.PaymentRecord.filter({ order_id: orderId });
    let payment = (payments || [])[0];
    if (!payment) {
      payment = await svc.entities.PaymentRecord.create({
        order_id: orderId, buyer_id: user.id, vendor_owner_id: order.vendor_owner_id,
        provider: "trebay_test", amount: order.total, amount_cents: order.total_cents || Math.round((order.total || 0) * 100),
        status: "pending",
      });
    }

    const totalCents = order.total_cents || Math.round((order.total || 0) * 100);
    const now = new Date().toISOString();

    if (outcome === "TEST_SUCCESS") {
      // Validate before marking paid: re-check inventory availability.
      if (order.checkout_quote_id) {
        const cq = await svc.entities.CheckoutQuote.get(order.checkout_quote_id);
        if (cq && cq.source_type === "direct_listing" && cq.product_id) {
          const product = await svc.entities.Product.get(cq.product_id);
          const qty = (cq.items || []).reduce((s, i) => s + (i.quantity || 0), 0);
          if ((product?.quantity_available || 0) < qty) return Response.json({ error: "Insufficient inventory — product may have sold out. Please try again." }, { status: 409 });
        }
      }
      // Mark payment record paid.
      await svc.entities.PaymentRecord.update(payment.id, { status: "paid", paid_at: now, transaction_ref: "TEST-" + Date.now() });
      // Transition order: payment_confirmed -> inventory_reserved (inventory stays reserved, NOT committed).
      await transitionOrder(svc, orderId, "payment_confirmed", { type: "payment_provider", id: "trebay_test", description: "Test payment confirmed" });
      await transitionOrder(svc, orderId, "inventory_reserved", { type: "system", description: "Inventory reserved for fulfillment" });
      const deadline = new Date(Date.now() + VENDOR_CONFIRM_HOURS * 3600000).toISOString();
      await svc.entities.Order.update(orderId, { vendor_confirm_deadline: deadline, payment_status: "paid" });
      await recordOrderEvent(svc, { order_id: orderId, event_type: "payment_succeeded", actor_type: "payment_provider", actor_id: "trebay_test", description: "Test payment succeeded" });
      // Authoritative ledger: debit buyer for total.
      await createPaymentLedgerEntry(svc, order, payment.transaction_ref);
      // Auto-resolve any prior payment_failed exception.
      await resolveExceptionsForOrder(svc, orderId, "Payment succeeded on retry — exception auto-resolved");
      // Create vendor confirmation reminder exception (WARNING, auto-retrying).
      await raiseException(svc, {
        severity: "WARNING", exception_type: "vendor_confirmation_reminder",
        order_id: orderId, buyer_id: order.buyer_id, vendor_id: order.vendor_id,
        reason: "Vendor confirmation pending for " + order.order_number,
        recommended_action: "Vendor should confirm the order.",
        requires_admin: false, status: "AUTO_RETRYING",
        retry_count: 0, max_retries: 2,
        next_retry_at: new Date(Date.now() + (VENDOR_CONFIRM_HOURS - 12) * 3600000).toISOString(),
      });
      // Generate invoice + receipt documents.
      const cq = order.checkout_quote_id ? await svc.entities.CheckoutQuote.get(order.checkout_quote_id) : null;
      await generateAndStoreDocument(svc, order, "buyer_invoice", cq, { payment });
      await generateAndStoreDocument(svc, order, "buyer_receipt", cq, { payment });
      await svc.entities.Notification.create({ user_id: order.vendor_owner_id, type: "order_accepted", title: "Payment received — please confirm order", body: order.order_number, reference_type: "order", reference_id: orderId, read: false });
      return Response.json({ order: await svc.entities.Order.get(orderId), payment: "paid", outcome: "TEST_SUCCESS" });
    } else {
      // Failure (TEST_DECLINED / TEST_TIMEOUT)
      await svc.entities.PaymentRecord.update(payment.id, { status: "failed", failed_at: now });
      try { await transitionOrder(svc, orderId, "payment_failed", { type: "payment_provider", id: "trebay_test", description: "Test payment failed: " + outcome }); } catch {}
      await recordOrderEvent(svc, { order_id: orderId, event_type: "payment_failed", actor_type: "payment_provider", actor_id: "trebay_test", description: "Test payment failed: " + outcome });
      // Release inventory reservation (reserved -> available)
      if (order.checkout_quote_id) {
        const cq = await svc.entities.CheckoutQuote.get(order.checkout_quote_id);
        if (cq && cq.source_type === "direct_listing" && cq.product_id) {
          const qty = (cq.items || []).reduce((s, i) => s + (i.quantity || 0), 0);
          try { await releaseInventory(svc, cq.product_id, qty); } catch {}
        }
      }
      await raiseException(svc, { severity: "WARNING", exception_type: "payment_failed", order_id: orderId, buyer_id: order.buyer_id, vendor_id: order.vendor_id, reason: "Test payment failed: " + outcome, recommended_action: "Buyer may retry payment.", requires_admin: false, status: "WAITING_ON_BUYER" });
      return Response.json({ order: await svc.entities.Order.get(orderId), payment: "failed", outcome });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}