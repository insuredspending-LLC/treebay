// Tree Marketplace fulfillment engine — the ONE implementation of vendor fulfillment steps.
// Backend functions supply authorization; this module owns the state machine.
//
// Vendor responsibility ENDS at `delivered`. delivered -> completed belongs to the
// system (Transaction Maintenance), never to a vendor action.

import {
  transitionOrder, resolveVendorConfirmationExceptions, raiseExceptionOnce,
  createShipment, updateShipmentStatus, shipmentStatusForOrder,
} from "./transactions.ts";
import { releaseForOrder, reverseCommitForOrder, commitForOrder, checkoutHoldsInventory } from "./inventory.ts";
import { generateAndStoreDocument } from "./documents.ts";
import { notifySafely } from "./notifications.ts";
import { autoAssignFreight } from "./freight.ts";
import { initiateRefundWorkflow } from "./stripe.ts";

// buyer_pickup: inventory_reserved -> vendor_confirmed -> preparing -> ready_for_pickup -> picked_up -> delivered
// delivery:     ... ready_for_pickup -> delivery_assigned -> picked_up -> in_transit -> delivered
export function getNextStatus(order) {
  const s = order.order_status;
  const isVendorDelivery = order.fulfillment_method === "vendor_delivery";
  if (s === "inventory_reserved") return "vendor_confirmed";
  if (s === "vendor_confirmed") return "preparing";
  if (s === "preparing") return "ready_for_pickup";
  // Vendor responsibility ENDS at ready_for_pickup for buyer_pickup and third_party_carrier.
  // Only vendor_delivery remains vendor-owned after ready_for_pickup.
  if (s === "ready_for_pickup") return isVendorDelivery ? "delivery_assigned" : null;
  if (s === "delivery_assigned") return isVendorDelivery ? "picked_up" : null;
  if (s === "picked_up") return isVendorDelivery ? "in_transit" : null;
  if (s === "in_transit") return isVendorDelivery ? "delivered" : null;
  return null;
}

function err(status, message) {
  return { ok: false, status, body: { error: message } };
}

export async function advanceFulfillment(svc, orderId, actor) {
  const order = await svc.entities.Order.get(orderId);
  if (!order) return err(404, "Order not found");
  if (order.order_status === "delivered") {
    return err(400, "This order is delivered and is waiting for buyer confirmation.");
  }
  const next = getNextStatus(order);
  if (!next) return err(400, "Order cannot advance from its current state.");

  const cq = order.checkout_quote_id ? await svc.entities.CheckoutQuote.get(order.checkout_quote_id) : null;

  if (next === "vendor_confirmed" && checkoutHoldsInventory(cq)) {
    try {
      await commitForOrder(svc, orderId);
    } catch (error) {
      await raiseExceptionOnce(svc, {
        severity: "CRITICAL", exception_type: "inventory_commit_failed", order_id: orderId,
        buyer_id: order.buyer_id, vendor_id: order.vendor_id,
        reason: "Vendor confirmation could not commit inventory for " + order.order_number + ": " + error.message,
        technical_details_private: error.message,
        recommended_action: "Reconcile the reservation and retry vendor confirmation.", requires_admin: true,
      });
      return err(409, "Inventory could not be committed. The order remains inventory reserved.");
    }
  }

  await transitionOrder(svc, orderId, next, { type: actor.type, id: actor.id, description: (actor.label || "Vendor") + " advanced to " + next });

  if (next === "vendor_confirmed") {
    await svc.entities.Order.update(orderId, { vendor_confirmed_at: new Date().toISOString() });
    await resolveVendorConfirmationExceptions(svc, orderId);
  }

  // For third_party_carrier: after seller marks ready_for_pickup, system auto-assigns freight.
  // If freight succeeds, system transitions to delivery_assigned. If fails, stays at ready_for_pickup.
  if (next === "ready_for_pickup" && cq && cq.delivery_method === "third_party_carrier") {
    const shipment = await createShipment(svc, order, cq);
    if (shipment) await updateShipmentStatus(svc, shipment.id, "pending", { type: "system", description: "Shipment created for freight assignment" });
    try {
      await autoAssignFreight(svc, await svc.entities.Order.get(orderId), cq, shipment);
      // Freight assigned — system transitions to delivery_assigned
      await transitionOrder(svc, orderId, "delivery_assigned", { type: "system", description: "Freight assigned — delivery assigned" });
      await updateShipmentStatus(svc, shipment.id, "assigned", { type: "system", description: "Carrier assigned" });
    } catch (e) {
      // Freight assignment failed — order stays at ready_for_pickup.
      // autoAssignFreight raised a WARNING/AUTO_RETRYING exception; maintenance retries.
    }
  }

  // For vendor_delivery: shipment is created when vendor advances to delivery_assigned.
  if (next === "delivery_assigned" && cq && cq.delivery_method === "vendor_delivery") {
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
  await notifySafely(svc, { user_id: order.buyer_id, type: notifType, eventType: "fulfillment_" + next, title: "Order update", body: order.order_number + " -> " + next, reference_type: "order", reference_id: orderId, order_id: orderId, buyer_id: order.buyer_id, vendor_id: order.vendor_id });

  // Delivery alone never completes or settles an order. The buyer must explicitly
  // confirm receipt; the payout cooling hold starts from that confirmation.
  return { ok: true, status: 200, body: { order_status: next } };
}

export async function cancelOrder(svc, orderId, actor) {
  const order = await svc.entities.Order.get(orderId);
  if (!order) return err(404, "Order not found");
  if (["picked_up", "in_transit", "delivered", "completed", "settlement_pending", "settled", "cancelled", "refunded"].includes(order.order_status)) {
    return err(400, "Order cannot be cancelled in its current state.");
  }
  const cq = order.checkout_quote_id ? await svc.entities.CheckoutQuote.get(order.checkout_quote_id) : null;
  const payments = await svc.entities.PaymentRecord.filter({ order_id: orderId });
  const payment = (payments || [])[0];

  // A paid cancellation is a refund request. Never move a paid order directly to
  // cancelled because that would claim completion without returning money.
  if (["paid", "partially_refunded"].includes(order.payment_status) || ["paid", "partially_refunded"].includes(payment?.status)) {
    const refund = await initiateRefundWorkflow(svc, orderId, actor, "Order cancellation");
    const shipments = await svc.entities.Shipment.filter({ order_id: orderId });
    for (const shipment of (shipments || [])) {
      if (shipment.shipment_status !== "cancelled") {
        try {
          await updateShipmentStatus(svc, shipment.id, "cancelled", {
            type: actor.type, id: actor.id, description: "Fulfillment stopped for refund",
          });
        } catch {
          // Operational shipment state cannot override financial refund truth.
        }
      }
    }
    const refreshed = await svc.entities.Order.get(orderId);
    return {
      ok: true,
      status: refreshed.order_status === "refunded" ? 200 : 202,
      body: {
        order_status: refreshed.order_status,
        refund_pending: refreshed.order_status !== "refunded",
        provider_status: refund?.providerStatus || null,
      },
    };
  }

  const committed = ["vendor_confirmed", "preparing", "ready_for_pickup", "delivery_assigned", "fulfillment_exception"].includes(order.order_status);
  if (checkoutHoldsInventory(cq)) {
    if (committed) await reverseCommitForOrder(svc, orderId, "Order cancelled after vendor confirmation");
    else await releaseForOrder(svc, orderId, "Order cancelled before vendor confirmation");
  }
  await transitionOrder(svc, orderId, "cancelled", { type: actor.type, id: actor.id, description: "Unpaid order cancelled" });
  const shipments = await svc.entities.Shipment.filter({ order_id: orderId });
  for (const shipment of (shipments || [])) {
    await updateShipmentStatus(svc, shipment.id, "cancelled", { type: actor.type, id: actor.id, description: "Order cancelled" });
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
  // A vendor may report delivery events only for vendor-owned delivery.
  // Third-party freight belongs to the assigned carrier; buyer pickup belongs to the buyer.
  if (actor.type !== "admin" && order.fulfillment_method !== "vendor_delivery") {
    return err(403, "Only vendor-delivery orders can be updated by the vendor delivery workflow.");
  }

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