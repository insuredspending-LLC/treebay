import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { transitionOrder, commitInventory, releaseInventory, recordOrderEvent, createLedgerEntry, raiseException, resolveExceptionsForOrder, VENDOR_CONFIRM_HOURS } from "../../shared/transactions.ts";

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
      await svc.entities.PaymentRecord.update(payment.id, { status: "paid", paid_at: now, transaction_ref: "TEST-" + Date.now() });
      await transitionOrder(svc, orderId, "payment_confirmed", { type: "payment_provider", id: "trebay_test", description: "Test payment confirmed" });
      // Commit inventory (reservation -> sold) for direct listings
      if (order.checkout_quote_id) {
        const cq = await svc.entities.CheckoutQuote.get(order.checkout_quote_id);
        if (cq && cq.source_type === "direct_listing" && cq.product_id) {
          const qty = (cq.items || []).reduce((s, i) => s + (i.quantity || 0), 0);
          try { await commitInventory(svc, cq.product_id, qty); } catch {}
        }
      }
      await transitionOrder(svc, orderId, "inventory_reserved", { type: "system", description: "Inventory committed" });
      const deadline = new Date(Date.now() + VENDOR_CONFIRM_HOURS * 3600000).toISOString();
      await svc.entities.Order.update(orderId, { vendor_confirm_deadline: deadline, payment_status: "paid" });
      await recordOrderEvent(svc, { order_id: orderId, event_type: "payment_succeeded", actor_type: "payment_provider", actor_id: "trebay_test", description: "Test payment succeeded" });
      await createLedgerEntry(svc, { order_id: orderId, entry_type: "payment", party_type: "buyer", party_id: user.id, description: "Buyer payment (TEST)", debit_cents: totalCents, payment_reference: payment.transaction_ref });
      await createLedgerEntry(svc, { order_id: orderId, entry_type: "vendor_payable", party_type: "vendor", party_id: order.vendor_id, description: "Vendor payable (pending settlement)", credit_cents: totalCents - Math.round((order.platform_fees || 0) * 100) });
      await svc.entities.Notification.create({ user_id: order.vendor_owner_id, type: "order_accepted", title: "Payment received — please confirm order", body: order.order_number, reference_type: "order", reference_id: orderId, read: false });
      return Response.json({ order: await svc.entities.Order.get(orderId), payment: "paid", outcome: "TEST_SUCCESS" });
    } else {
      // Failure (TEST_DECLINED / TEST_TIMEOUT)
      await svc.entities.PaymentRecord.update(payment.id, { status: "failed", failed_at: now });
      try { await transitionOrder(svc, orderId, "payment_failed", { type: "payment_provider", id: "trebay_test", description: "Test payment failed: " + outcome }); } catch {}
      await recordOrderEvent(svc, { order_id: orderId, event_type: "payment_failed", actor_type: "payment_provider", actor_id: "trebay_test", description: "Test payment failed: " + outcome });
      // Release inventory reservation
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