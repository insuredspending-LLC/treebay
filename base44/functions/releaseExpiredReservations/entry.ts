import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { releaseInventory, recordOrderEvent } from "../../shared/transactions.ts";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user && user.role !== "admin") return Response.json({ error: "Admin only" }, { status: 403 });
    const svc = base44.asServiceRole;
    const now = new Date().toISOString();
    const orders = await svc.entities.Order.filter({ order_status: "awaiting_payment" });
    let released = 0;
    for (const o of (orders || [])) {
      if (o.reservation_expires_at && o.reservation_expires_at < now) {
        if (o.checkout_quote_id) {
          const cq = await svc.entities.CheckoutQuote.get(o.checkout_quote_id);
          if (cq && cq.source_type === "direct_listing" && cq.product_id) {
            const qty = ((cq.items || [])[0] || {}).quantity || 1;
            try { await releaseInventory(svc, cq.product_id, qty); } catch {}
          }
        }
        await svc.entities.Order.update(o.id, { order_status: "cancelled" });
        await recordOrderEvent(svc, { order_id: o.id, event_type: "reservation_expired", new_status: "cancelled", actor_type: "system", description: "Reservation expired; order cancelled" });
        released++;
      }
    }
    return Response.json({ released });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}