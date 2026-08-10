import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { transitionOrder, recordOrderEvent, releaseInventory, commitInventory, reverseCommittedInventory, resolveVendorTimeoutException, createShipment, updateShipmentStatus } from "../../shared/transactions.ts";
import { generateAndStoreDocument } from "../../shared/documents.ts";

// Fulfillment state machine depends on fulfillment_method:
//   buyer_pickup:  vendor_confirmed -> preparing -> ready_for_pickup -> picked_up -> in_transit -> delivered -> completed
//   delivery:      vendor_confirmed -> preparing -> ready_for_pickup -> delivery_assigned -> picked_up -> in_transit -> delivered -> completed
// Inventory is COMMITTED (reserved -> sold) at vendor_confirmed, not at payment.
function getNextStatus(order) {
  const s = order.order_status;
  const isPickup = order.fulfillment_method === "buyer_pickup" || order.fulfillment_method === "pickup";
  if (s === "inventory_reserved") return "vendor_confirmed";
  if (s === "vendor_confirmed") return "preparing";
  if (s === "preparing") return "ready_for_pickup";
  if (s === "ready_for_pickup") return isPickup ? "picked_up" : "delivery_assigned";
  if (s === "delivery_assigned") return "picked_up";
  if (s === "picked_up") return "in_transit";
  if (s === "in_transit") return "delivered";
  if (s === "delivered") return "completed";
  return null;
}

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
      const next = getNextStatus(order);
      if (!next) return Response.json({ error: "Order cannot advance from its current state." }, { status: 400 });
      await transitionOrder(svc, orderId, next, { type: "vendor", id: user.id, description: "Vendor advanced to " + next });

      // Commit inventory (reserved -> sold) when vendor confirms.
      if (next === "vendor_confirmed") {
        await svc.entities.Order.update(orderId, { vendor_confirmed_at: new Date().toISOString() });
        if (order.checkout_quote_id) {
          const cq = await svc.entities.CheckoutQuote.get(order.checkout_quote_id);
          if (cq && cq.source_type === "direct_listing" && cq.product_id) {
            const qty = (cq.items || []).reduce((s, i) => s + (i.quantity || 0), 0);
            try { await commitInventory(svc, cq.product_id, qty); } catch {}
          }
        }
        // Auto-resolve any vendor confirmation timeout/reminder exceptions.
        await resolveVendorTimeoutException(svc, orderId);
      }

      // Create shipment record when delivery is assigned.
      if (next === "delivery_assigned" && order.checkout_quote_id) {
        const cq = await svc.entities.CheckoutQuote.get(order.checkout_quote_id);
        if (cq) await createShipment(svc, order, cq);
      }

      // Update shipment status in sync with order.
      if (["picked_up", "in_transit", "delivered"].includes(next)) {
        const shipments = await svc.entities.Shipment.filter({ order_id: orderId });
        for (const sh of (shipments || [])) {
          const shipStatus = next === "picked_up" ? "picked_up" : next === "in_transit" ? "in_transit" : "delivered";
          await updateShipmentStatus(svc, sh.id, shipStatus, { type: "vendor", id: user.id });
        }
      }

      if (next === "delivered") await svc.entities.Order.update(orderId, { delivered_at: new Date().toISOString() });

      // Generate delivery manifest when shipment starts.
      if (next === "delivery_assigned" || next === "in_transit") {
        const cq = order.checkout_quote_id ? await svc.entities.CheckoutQuote.get(order.checkout_quote_id) : null;
        const shipments = await svc.entities.Shipment.filter({ order_id: orderId });
        const shipment = (shipments || [])[0];
        if (cq) await generateAndStoreDocument(svc, order, "delivery_manifest", cq, { shipment });
      }

      const notifType = next === "ready_for_pickup" ? "order_ready" : next === "in_transit" ? "order_shipped" : next === "delivered" ? "order_delivered" : next === "vendor_confirmed" ? "order_accepted" : "general";
      await svc.entities.Notification.create({ user_id: order.buyer_id, type: notifType, title: "Order update", body: order.order_number + " -> " + next, reference_type: "order", reference_id: orderId, read: false });
      return Response.json({ order_status: next });
    } else if (action === "cancel") {
      if (!isVendor && !isBuyer) return Response.json({ error: "Not authorized" }, { status: 403 });
      if (["completed", "settled", "cancelled", "refunded", "delivered", "in_transit"].includes(order.order_status)) return Response.json({ error: "Order cannot be cancelled in its current state." }, { status: 400 });
      const committed = ["vendor_confirmed", "preparing", "ready_for_pickup", "delivery_assigned"].includes(order.order_status);
      if (order.checkout_quote_id) {
        const cq = await svc.entities.CheckoutQuote.get(order.checkout_quote_id);
        if (cq && cq.source_type === "direct_listing" && cq.product_id) {
          const qty = (cq.items || []).reduce((s, i) => s + (i.quantity || 0), 0);
          try {
            if (committed) await reverseCommittedInventory(svc, cq.product_id, qty);
            else await releaseInventory(svc, cq.product_id, qty);
          } catch {}
        }
      }
      await svc.entities.Order.update(orderId, { order_status: "cancelled" });
      await recordOrderEvent(svc, { order_id: orderId, event_type: "cancelled", new_status: "cancelled", actor_type: isVendor ? "vendor" : "buyer", actor_id: user.id, description: "Order cancelled" });
      return Response.json({ order_status: "cancelled" });
    }
    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}