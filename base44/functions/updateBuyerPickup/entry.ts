import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { transitionOrder, updateShipmentStatus, raiseExceptionOnce } from "../../shared/transactions.ts";
import { notifySafely } from "../../shared/notifications.ts";

// Buyer-authorized pickup actions for buyer_pickup orders.
// Seller stops at ready_for_pickup. Buyer confirms pickup and receipt.
// System still owns delivered -> completed -> settlement.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const orderId = body?.orderId;
    const action = body?.action;
    if (!orderId || !action) return Response.json({ error: "orderId and action required" }, { status: 400 });

    const svc = base44.asServiceRole;
    const order = await svc.entities.Order.get(orderId);
    if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
    if (order.buyer_id !== user.id) return Response.json({ error: "Only the buyer can perform pickup actions." }, { status: 403 });
    if (order.fulfillment_method !== "buyer_pickup" && order.fulfillment_method !== "pickup")
      return Response.json({ error: "This action is only for buyer pickup orders." }, { status: 400 });

    let newStatus = null;
    let description = "";

    if (action === "confirm_pickup") {
      if (order.order_status !== "ready_for_pickup")
        return Response.json({ error: "Order is not ready for pickup yet." }, { status: 400 });
      newStatus = "picked_up";
      description = "Buyer confirmed pickup";
    } else if (action === "confirm_received") {
      if (order.order_status !== "picked_up")
        return Response.json({ error: "Order must be picked up before confirming receipt." }, { status: 400 });
      newStatus = "delivered";
      description = "Buyer confirmed receipt";
    } else {
      return Response.json({ error: "Unknown action" }, { status: 400 });
    }

    await transitionOrder(svc, orderId, newStatus, { type: "buyer", id: user.id, description });

    // Sync shipment status
    const shipments = await svc.entities.Shipment.filter({ order_id: orderId });
    for (const sh of (shipments || [])) {
      try {
        const target = newStatus === "picked_up" ? "picked_up" : "delivered";
        await updateShipmentStatus(svc, sh.id, target, { type: "buyer", id: user.id, description });
        if (newStatus === "delivered") {
          await svc.entities.Shipment.update(sh.id, {
            delivery_timestamp: new Date().toISOString(),
            buyer_confirmed: true,
            receiver_name: body?.receiver_name || user.full_name || order.contact_name || "Buyer",
            confirmation_code: body?.confirmation_code || "",
            delivery_notes: body?.delivery_notes || "",
          });
        }
      } catch { /* shipment may not exist for pickup */ }
    }

    if (newStatus === "delivered") await svc.entities.Order.update(orderId, { delivered_at: new Date().toISOString() });

    // Notify vendor (via notifySafely — never rolls back)
    const notifType = newStatus === "picked_up" ? "order_shipped" : "order_delivered";
    await notifySafely(svc, { user_id: order.vendor_owner_id, type: notifType, eventType: "buyer_pickup_" + action, title: "Pickup update", body: order.order_number + " — " + description, reference_type: "order", reference_id: orderId, order_id: orderId, buyer_id: order.buyer_id, vendor_id: order.vendor_id });

    // Buyer receipt is the normal completion trigger for pickup orders. Finalize now;
    // the hourly recovery automation remains the fallback for any transient failure.
    if (newStatus === "delivered") {
      try { await svc.functions.invoke("runTransactionMaintenance", { trigger: "buyer_pickup_received", order_id: orderId }); } catch { /* recovery scheduler handles it */ }
    }

    return Response.json({ ok: true, order_status: newStatus });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}