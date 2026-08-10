import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { recordOrderEvent, createLedgerEntry, resolveException } from "../../shared/transactions.ts";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user && user.role !== "admin") return Response.json({ error: "Admin only" }, { status: 403 });
    const svc = base44.asServiceRole;
    const orders = await svc.entities.Order.filter({ order_status: "delivered" });
    let completed = 0;
    for (const o of (orders || [])) {
      const openExc = await svc.entities.SystemException.filter({ order_id: o.id });
      const stillOpen = (openExc || []).filter((e) => e.status === "OPEN" || e.status === "ADMIN_REVIEW" || e.status === "AUTO_RETRYING");
      if (stillOpen.length) continue;
      if (o.payment_status !== "paid") continue;

      await svc.entities.Order.update(o.id, { order_status: "completed", completed_at: new Date().toISOString() });
      await recordOrderEvent(svc, { order_id: o.id, event_type: "auto_completed", new_status: "completed", actor_type: "system", description: "Auto-completed after delivery confirmation" });

      await svc.entities.Order.update(o.id, { order_status: "settlement_pending" });
      await recordOrderEvent(svc, { order_id: o.id, event_type: "status_transition", new_status: "settlement_pending", actor_type: "system", description: "Moved to settlement pending" });

      if (o.checkout_quote_id) {
        const cq = await svc.entities.CheckoutQuote.get(o.checkout_quote_id);
        if (cq) {
          const proceeds = cq.merchandise_subtotal_cents - cq.marketplace_fee_cents;
          await createLedgerEntry(svc, { order_id: o.id, entry_type: "payout", party_type: "vendor", party_id: o.vendor_owner_id, description: "Vendor settlement (TEST MODE — no real payout)", credit_cents: proceeds });
        }
      }

      await svc.entities.Order.update(o.id, { order_status: "settled" });
      await recordOrderEvent(svc, { order_id: o.id, event_type: "status_transition", new_status: "settled", actor_type: "system", description: "Settlement records created (TEST MODE)" });

      const excs = await svc.entities.SystemException.filter({ order_id: o.id });
      for (const e of (excs || [])) {
        if (e.status === "OPEN" || e.status === "ADMIN_REVIEW") {
          try { await resolveException(svc, e.id, "Order completed automatically", "system"); } catch {}
        }
      }
      completed++;
    }
    return Response.json({ completed });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}