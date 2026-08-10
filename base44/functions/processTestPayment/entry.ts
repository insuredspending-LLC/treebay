import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { toCents, recordOrderEvent, createLedgerEntry, raiseException, commitInventory } from "../../shared/transactions.ts";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const orderId = body?.orderId;
    const testResult = body?.testResult || "success";
    if (!orderId) return Response.json({ error: "orderId required" }, { status: 400 });

    const svc = base44.asServiceRole;
    const order = await svc.entities.Order.get(orderId);
    if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
    if (order.buyer_id !== user.id) return Response.json({ error: "Forbidden" }, { status: 403 });
    if (order.order_status !== "awaiting_payment") return Response.json({ error: "Order is not awaiting payment" }, { status: 400 });

    // TEST PAYMENT MODE — simulated result, no real money movement.
    if (testResult === "declined" || testResult === "timeout") {
      await svc.entities.PaymentRecord.create({ order_id: orderId, buyer_id: user.id, vendor_owner_id: order.vendor_owner_id, provider: "trebay_test", amount: order.total, amount_cents: order.total_cents || toCents(order.total), status: "failed", failed_at: new Date().toISOString(), metadata: { test_mode: true, result: testResult } });
      await svc.entities.Order.update(orderId, { order_status: "payment_failed" });
      await recordOrderEvent(svc, { order_id: orderId, event_type: "payment_failed", new_status: "payment_failed", actor_type: "payment_provider", actor_id: "trebay_test", description: "Test payment " + testResult });
      await raiseException(svc, { severity: "WARNING", exception_type: "payment_failed", order_id: orderId, buyer_id: user.id, reason: "Test payment " + testResult, recommended_action: "Buyer should retry payment or cancel.", requires_admin: false });
      return Response.json({ status: "failed", message: "Test payment " + testResult });
    }

    // Success
    const payRef = "TEST-" + Math.random().toString(36).slice(2, 10).toUpperCase();
    await svc.entities.PaymentRecord.create({ order_id: orderId, buyer_id: user.id, vendor_owner_id: order.vendor_owner_id, provider: "trebay_test", provider_payment_id: payRef, amount: order.total, amount_cents: order.total_cents || toCents(order.total), status: "paid", paid_at: new Date().toISOString(), transaction_ref: payRef, metadata: { test_mode: true } });
    await createLedgerEntry(svc, { order_id: orderId, entry_type: "payment", party_type: "buyer", party_id: user.id, description: "Buyer payment (TEST MODE)", credit_cents: order.total_cents || toCents(order.total), payment_reference: payRef });

    await svc.entities.Order.update(orderId, { order_status: "payment_confirmed", payment_status: "paid" });
    await recordOrderEvent(svc, { order_id: orderId, event_type: "payment_confirmed", new_status: "payment_confirmed", actor_type: "payment_provider", actor_id: "trebay_test", description: "Payment confirmed (TEST MODE) ref " + payRef });

    if (order.checkout_quote_id) {
      const cq = await svc.entities.CheckoutQuote.get(order.checkout_quote_id);
      if (cq && cq.source_type === "direct_listing" && cq.product_id) {
        const qty = ((cq.items || [])[0] || {}).quantity || 1;
        try { await commitInventory(svc, cq.product_id, qty); } catch {}
      }
    }
    await svc.entities.Order.update(orderId, { order_status: "inventory_reserved" });
    await recordOrderEvent(svc, { order_id: orderId, event_type: "inventory_reserved", new_status: "inventory_reserved", actor_type: "system", description: "Inventory reserved/committed" });

    await svc.entities.Notification.create({ user_id: user.id, type: "order_completed", title: "Payment confirmed", body: order.order_number, reference_type: "order", reference_id: orderId, read: false });
    await svc.entities.Notification.create({ user_id: order.vendor_owner_id, type: "new_order", title: "Order paid — please confirm", body: order.order_number, reference_type: "order", reference_id: orderId, read: false });

    return Response.json({ status: "paid", order: await svc.entities.Order.get(orderId) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}