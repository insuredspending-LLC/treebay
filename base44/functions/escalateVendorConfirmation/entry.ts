import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { raiseException } from "../../shared/transactions.ts";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user && user.role !== "admin") return Response.json({ error: "Admin only" }, { status: 403 });
    const svc = base44.asServiceRole;
    const now = new Date();
    const orders = await svc.entities.Order.filter({ order_status: "inventory_reserved" });
    let escalated = 0;
    for (const o of (orders || [])) {
      if (o.vendor_confirm_deadline && new Date(o.vendor_confirm_deadline) < now) {
        const existing = await svc.entities.SystemException.filter({ order_id: o.id, exception_type: "vendor_confirmation_overdue" });
        const open = (existing || []).filter((e) => e.status === "OPEN" || e.status === "ADMIN_REVIEW");
        if (!open.length) {
          await raiseException(svc, { severity: "ACTION_REQUIRED", exception_type: "vendor_confirmation_overdue", order_id: o.id, vendor_id: o.vendor_id, buyer_id: o.buyer_id, reason: "Vendor did not confirm order within deadline", recommended_action: "Contact vendor or cancel fulfillment", requires_admin: true });
          await svc.entities.Notification.create({ user_id: o.vendor_owner_id, type: "general", title: "Order confirmation overdue", body: o.order_number, reference_type: "order", reference_id: o.id, read: false });
          escalated++;
        }
      }
    }
    return Response.json({ escalated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}