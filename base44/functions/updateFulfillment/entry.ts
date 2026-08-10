import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { VENDOR_NEXT_STATUS } from "../../shared/marketplace.ts";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const orderId = body?.orderId;
    const action = body?.action || "advance";
    if (!orderId) return Response.json({ error: "Order id required" }, { status: 400 });

    const svc = base44.asServiceRole;
    const order = await svc.entities.Order.get(orderId);
    if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
    const isVendor = order.vendor_owner_id === user.id;
    const isBuyer = order.buyer_id === user.id;

    if (action === "advance") {
      if (!isVendor) return Response.json({ error: "Only the vendor can advance fulfillment." }, { status: 403 });
      const next = VENDOR_NEXT_STATUS[order.order_status];
      if (!next) return Response.json({ error: "Order cannot advance from its current state." }, { status: 400 });
      await svc.entities.Order.update(orderId, { order_status: next });
      const notifType = next === "ready_for_pickup" ? "order_ready" : next === "in_transit" ? "order_shipped" : next === "delivered" ? "order_delivered" : next === "completed" ? "order_completed" : "general";
      await svc.entities.Notification.create({ user_id: order.buyer_id, type: notifType, title: "Order update", body: `${order.order_number} → ${next}`, reference_type: "order", reference_id: orderId, read: false });
      return Response.json({ order_status: next });
    } else if (action === "cancel") {
      if (!isVendor && !isBuyer) return Response.json({ error: "Not authorized" }, { status: 403 });
      if (["completed", "cancelled", "refunded", "delivered", "in_transit"].includes(order.order_status)) return Response.json({ error: "Order cannot be cancelled in its current state." }, { status: 400 });
      await svc.entities.Order.update(orderId, { order_status: "cancelled" });
      return Response.json({ order_status: "cancelled" });
    }
    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}