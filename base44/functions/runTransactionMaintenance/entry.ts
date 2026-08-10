import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { releaseInventory, transitionOrder, raiseException, createLedgerEntry } from "../../shared/transactions.ts";

// Scheduled transaction maintenance: releases expired reservations, escalates
// overdue vendor confirmations, auto-completes delivered orders, and settles
// completed orders. Runs without a user (system schedule).
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const now = new Date();
    let released = 0, escalated = 0, completed = 0, settled = 0;

    // 1. Release expired reservations (awaiting_payment past reservation_expires_at)
    const awaiting = await svc.entities.Order.filter({ order_status: "awaiting_payment" }, "-created_date", 200);
    for (const order of (awaiting || [])) {
      if (!order.reservation_expires_at || new Date(order.reservation_expires_at) > now) continue;
      if (order.checkout_quote_id) {
        try {
          const cq = await svc.entities.CheckoutQuote.get(order.checkout_quote_id);
          if (cq && cq.source_type === "direct_listing" && cq.product_id) {
            const qty = (cq.items || []).reduce((s, i) => s + (i.quantity || 0), 0);
            await releaseInventory(svc, cq.product_id, qty);
          }
        } catch {}
      }
      try { await transitionOrder(svc, order.id, "cancelled", { type: "system", description: "Reservation expired - payment not received" }); } catch {}
      released++;
    }

    // 2. Escalate overdue vendor confirmations
    const reserved = await svc.entities.Order.filter({ order_status: "inventory_reserved" }, "-created_date", 200);
    for (const order of (reserved || [])) {
      if (!order.vendor_confirm_deadline || new Date(order.vendor_confirm_deadline) > now) continue;
      const existing = await svc.entities.SystemException.filter({ order_id: order.id, exception_type: "vendor_confirmation_timeout" });
      if (existing && existing.length) continue;
      await raiseException(svc, {
        severity: "ACTION_REQUIRED", exception_type: "vendor_confirmation_timeout",
        order_id: order.id, buyer_id: order.buyer_id, vendor_id: order.vendor_id,
        reason: "Vendor did not confirm " + order.order_number + " within 24h",
        recommended_action: "Contact vendor or cancel fulfillment.",
        requires_admin: true, status: "WAITING_ON_VENDOR",
      });
      escalated++;
    }

    // 3. Auto-complete delivered orders (payment valid, no blocking exception)
    const delivered = await svc.entities.Order.filter({ order_status: "delivered" }, "-created_date", 100);
    for (const order of (delivered || [])) {
      if (order.payment_status !== "paid") continue;
      const blockers = await svc.entities.SystemException.filter({ order_id: order.id });
      const hasOpen = (blockers || []).some((e) => e.status !== "RESOLVED" && e.status !== "CLOSED" && (e.severity === "ACTION_REQUIRED" || e.severity === "CRITICAL"));
      if (hasOpen) continue;
      try {
        await transitionOrder(svc, order.id, "completed", { type: "system", description: "Auto-completed after delivery" });
        await svc.entities.Order.update(order.id, { completed_at: new Date().toISOString() });
        completed++;
      } catch {}
    }

    // 4. Settle completed orders (TEST settlement — no real payout)
    const done = await svc.entities.Order.filter({ order_status: "completed" }, "-created_date", 100);
    for (const order of (done || [])) {
      try {
        await transitionOrder(svc, order.id, "settlement_pending", { type: "system", description: "Settlement prepared" });
        const totalCents = order.total_cents || Math.round((order.total || 0) * 100);
        const vendorPayable = totalCents - Math.round((order.platform_fees || 0) * 100);
        await createLedgerEntry(svc, { order_id: order.id, entry_type: "payout", party_type: "vendor", party_id: order.vendor_id, description: "Vendor settlement (TEST)", credit_cents: vendorPayable });
        await transitionOrder(svc, order.id, "settled", { type: "system", description: "Settled (TEST)" });
        settled++;
      } catch {}
    }

    return Response.json({ released, escalated, completed, settled });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}