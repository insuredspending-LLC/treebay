// TreEbay fulfillment engine — the ONE implementation of vendor fulfillment steps.
// Backend functions supply authorization; this module owns the state machine.
//
// Vendor responsibility ENDS at `delivered`. delivered -> completed belongs to the
// system (Transaction Maintenance), never to a vendor action.

import {
  transitionOrder, resolveVendorConfirmationExceptions, raiseExceptionOnce,
  createShipment, updateShipmentStatus, shipmentStatusForOrder,
} from "./transactions.ts";
import { releaseForOrder, reverseCommitForOrder, checkoutHoldsInventory } from "./inventory.ts";
import { generateAndStoreDocument } from "./documents.ts";

// buyer_pickup: inventory_reserved -> vendor_confirmed -> preparing -> ready_for_pickup -> picked_up -> delivered
// delivery:     ... ready_for_pickup -> delivery_assigned -> picked_up -> in_transit -> delivered
export function getNextStatus(order) {
  const s = order.order_status;
  const isPickup = order.fulfillment_method === "buyer_pickup" || order.fulfillment_method === "pickup";
  if (s === "inventory_reserved") return "vendor_confirmed";
  if (s === "vendor_confirmed") return "preparing";
  if (s === "preparing") return "ready_for_pickup";
  if (s === "ready_for_pickup") return isPickup ? "picked_up" : "delivery_assigned";
  if (s === "delivery_assigned") return "picked_up";
  if (s === "picked_up") return isPickup ? "delivered" : "in_transit";
  if (s === "in_transit") return "delivered";
  return null;
}

function err(status, message) {
  return { ok: false, status, body: { error: message } };
}

export async function advanceFulfillment(svc, orderId, actor) {
  const order = await svc.entities.Order.get(orderId);
  if (!order) return err(404, "Order not found");
  if (order.order_status === "delivered") {
    return err(400, "This order is delivered. TreEbay completes and settles it automatically.");
  }
  const next = getNextStatus(order);
  if (!next) return err(400, "Order cannot advance from its current state.");

  const cq = order.checkout_quote_id ? await svc.entities.CheckoutQuote.get(order.checkout_quote_id) : null;

  await transitionOrder(svc, orderId, next, { type: actor.type, id: actor.id, description: (actor.label || "Vendor") + " advanced to " + next });

  if (next === "vendor_confirmed") {
    await svc.entities.Order.update(orderId, { vendor_confirmed_at: new Date().toISOString() });
    await resolveVendorConfirmationExceptions(svc, orderId);
  }

  if (next === "delivery_assigned") {
    const shipment = await createShipment(svc, order, cq);
    if (shipment) await updateShipmentStatus(svc, shipment.id, "assigned", { type: actor.type, id: actor.id, description: "Delivery assigned" });
  }

  const shipStatus = shipmentStatusForOrder(next);
  if (shipStatus) {
    const shipments = await svc.entities.Shipment.filter({ order_id: orderId });
    for (const sh of (shipments || [])) {
      await updateShipmentStatus(svc, sh.id, shipStatus, { type: actor.type, id: actor.id });
    }
  }

  if (next === "delivered") await svc.entities.Order.update(orderId, { delivered_at: new Date().toISOString() });

  if (next === "delivery_assigned" || next === "in_transit") {
    const shipments = await svc.entities.Shipment.filter({ order_id: orderId });
    if (cq) await generateAndStoreDocument(svc, await svc.entities.Order.get(orderId), "delivery_manifest", cq, { shipment: (shipments || [])[0] });
  }

  const notifType = next === "ready_for_pickup" ? "order_ready" : next === "in_transit" ? "order_shipped" : next === "delivered" ? "order_delivered" : next === "vendor_confirmed" ? "order_accepted" : "general";
  await svc.entities.Notification.create({ user_id: order.buyer_id, type: notifType, title: "Order update", body: order.order_number + " -> " + next, reference_type: "order", reference_id: orderId, read: false });
  return { ok: true, status: 200, body: { order_status: next } };
}

export async function cancelOrder(svc, orderId, actor) {
  const order = await svc.entities.Order.get(orderId);
  if (!order) return err(404, "Order not found");
  if (["picked_up", "in_transit", "delivered", "completed", "settlement_pending", "settled", "cancelled", "refunded"].includes(order.order_status)) {
    return err(400, "Order cannot be cancelled in its current state.");
  }
  const cq = order.checkout_quote_id ? await svc.entities.CheckoutQuote.get(order.checkout_quote_id) : null;
  const committed = ["inventory_reserved", "vendor_confirmed", "preparing", "ready_for_pickup", "delivery_assigned", "fulfillment_exception"].includes(order.order_status);
  if (checkoutHoldsInventory(cq)) {
    if (committed) await reverseCommitForOrder(svc, orderId, "Order cancelled after vendor confirmation");
    else await releaseForOrder(svc, orderId, "Order cancelled before vendor confirmation");
  }
  await transitionOrder(svc, orderId, "cancelled", { type: actor.type, id: actor.id, description: "Order cancelled" });
  const shipments = await svc.entities.Shipment.filter({ order_id: orderId });
  for (const sh of (shipments || [])) {
    await updateShipmentStatus(svc, sh.id, "cancelled", { type: actor.type, id: actor.id, description: "Order cancelled" });
  }
  return { ok: true, status: 200, body: { order_status: "cancelled" } };
}

// Delivery exception / recovery steps used by the vendor UI and the admin simulator.
export async function recordDeliveryEvent(svc, orderId, event, actor) {
  const order = await svc.entities.Order.get(orderId);
  if (!order) return err(404, "Order not found");
  const shipments = await svc.entities.Shipment.filter({ order_id: orderId });
  const shipment = (shipments || [])[0];
  if (!shipment) return err(400, "No shipment exists for this order yet.");

  if (event === "delay") {
    const target = ["picked_up", "in_transit"].includes(shipment.shipment_status) ? "delivery_delayed" : "pickup_delayed";
    await updateShipmentStatus(svc, shipment.id, target, { type: actor.type, id: actor.id, description: "Delivery delayed" });
    await raiseExceptionOnce(svc, {
      severity: "WARNING", exception_type: "delivery_delayed", order_id: orderId, shipment_id: shipment.id,
      buyer_id: order.buyer_id, vendor_id: order.vendor_id,
      reason: "Delivery delayed for " + order.order_number,
      recommended_action: "Carrier should provide an updated ETA.", requires_admin: false,
    });
    return { ok: true, status: 200, body: { shipment_status: target } };
  }

  if (event === "fail") {
    await updateShipmentStatus(svc, shipment.id, "delivery_failed", { type: actor.type, id: actor.id, description: "Delivery failed" });
    await transitionOrder(svc, orderId, "delivery_exception", { type: actor.type, id: actor.id, description: "Delivery failed" });
    await raiseExceptionOnce(svc, {
      severity: "ACTION_REQUIRED", exception_type: "delivery_failed", order_id: orderId, shipment_id: shipment.id,
      buyer_id: order.buyer_id, vendor_id: order.vendor_id,
      reason: "Delivery failed for " + order.order_number,
      recommended_action: "Reschedule delivery or refund the buyer.", requires_admin: true,
    });
    return { ok: true, status: 200, body: { shipment_status: "delivery_failed" } };
  }

  return err(400, "Unknown delivery event.");
}