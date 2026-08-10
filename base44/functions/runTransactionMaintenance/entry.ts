import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { releaseInventory, transitionOrder, raiseException, resolveException, createSettlementLedgerEntry, rollbackExpiredRFQCheckout, recordOrderEvent } from "../../shared/transactions.ts";
import { generateAndStoreDocument } from "../../shared/documents.ts";

// Single source of truth for all recurring transaction maintenance.
// Idempotent: safe to run every 15 minutes. Each section is independently guarded.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const now = new Date();
    let released = 0, escalated = 0, completed = 0, settled = 0, reminders = 0, rolledBack = 0;

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
          if (cq && cq.source_type === "accepted_quote") {
            await rollbackExpiredRFQCheckout(svc, cq);
            rolledBack++;
          }
        } catch {}
      }
      try { await transitionOrder(svc, order.id, "cancelled", { type: "system", description: "Reservation expired - payment not received" }); } catch {}
      released++;
    }

    // 2. Rollback expired RFQ checkouts (CheckoutQuotes that expired without producing an order)
    const expiredQuotes = await svc.entities.CheckoutQuote.filter({ pricing_status: "draft" }, "-created_date", 200);
    for (const cq of (expiredQuotes || [])) {
      if (!cq.expiration_at || new Date(cq.expiration_at) > now) continue;
      if (cq.order_id) continue;
      if (cq.source_type === "accepted_quote") {
        try { await rollbackExpiredRFQCheckout(svc, cq); rolledBack++; } catch {}
      } else {
        try { await svc.entities.CheckoutQuote.update(cq.id, { pricing_status: "expired" }); } catch {}
      }
    }

    // 3. Vendor confirmation reminders + escalation
    const reserved = await svc.entities.Order.filter({ order_status: "inventory_reserved" }, "-created_date", 200);
    for (const order of (reserved || [])) {
      if (!order.vendor_confirm_deadline) continue;
      const deadline = new Date(order.vendor_confirm_deadline);
      // Find existing reminder exception
      const excs = await svc.entities.SystemException.filter({ order_id: order.id, exception_type: "vendor_confirmation_reminder" });
      let exc = (excs || [])[0];
      if (!exc) continue; // exception created at payment time; skip if missing

      if (now >= deadline) {
        // Escalate to admin
        if (exc.status !== "ADMIN_REVIEW" && exc.status !== "RESOLVED") {
          await svc.entities.SystemException.update(exc.id, {
            severity: "ACTION_REQUIRED", status: "ADMIN_REVIEW", requires_admin: true,
            reason: "Vendor did not confirm " + order.order_number + " within " + Math.round((deadline - new Date(order.created_date)) / 3600000) + "h",
            recommended_action: "Contact vendor or cancel fulfillment.",
          });
          escalated++;
        }
      } else if (exc.next_retry_at && now >= new Date(exc.next_retry_at) && exc.retry_count < exc.max_retries) {
        // Send reminder notification
        await svc.entities.Notification.create({
          user_id: order.vendor_owner_id, type: "general",
          title: "Reminder: Please confirm order " + order.order_number,
          body: "Confirmation deadline: " + deadline.toLocaleString(),
          reference_type: "order", reference_id: order.id, read: false,
        });
        const nextRetry = new Date(deadline.getTime() - (exc.max_retries - exc.retry_count - 1) * 4 * 3600000);
        await svc.entities.SystemException.update(exc.id, {
          retry_count: exc.retry_count + 1,
          next_retry_at: nextRetry.toISOString(),
        });
        reminders++;
      }
    }

    // 4. Auto-complete delivered orders (payment valid, no blocking exceptions)
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

    // 5. Settle completed orders (TEST settlement — no real payout)
    const done = await svc.entities.Order.filter({ order_status: "completed" }, "-created_date", 100);
    for (const order of (done || [])) {
      try {
        await transitionOrder(svc, order.id, "settlement_pending", { type: "system", description: "Settlement prepared" });
        const cq = order.checkout_quote_id ? await svc.entities.CheckoutQuote.get(order.checkout_quote_id) : null;
        if (cq) {
          await createSettlementLedgerEntry(svc, order, cq);
          await generateAndStoreDocument(svc, order, "vendor_settlement_statement", cq);
        }
        await transitionOrder(svc, order.id, "settled", { type: "system", description: "Settled (TEST)" });
        settled++;
      } catch {}
    }

    return Response.json({ released, escalated, completed, settled, reminders, rolledBack });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}