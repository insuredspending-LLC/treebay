import { transitionOrder, updateShipmentStatus } from "./transactions.ts";
import { notifySafely } from "./notifications.ts";

function env(name) {
  try { if (typeof Deno !== "undefined" && Deno.env) return Deno.env.get(name); } catch {}
  try { return process.env[name]; } catch {}
  return undefined;
}

export function payoutHoldHours() {
  const configured = Number(env("TREE_MARKETPLACE_PAYOUT_HOLD_HOURS"));
  if (!Number.isFinite(configured)) return 72;
  return Math.min(720, Math.max(24, configured));
}

export function payoutEligibleAt(confirmedAt) {
  const base = new Date(confirmedAt || new Date()).getTime();
  return new Date(base + payoutHoldHours() * 3600000).toISOString();
}

// Buyer confirmation is the only normal delivered -> completed path.
export async function confirmBuyerDelivery(svc, orderId, actor, details) {
  let order = await svc.entities.Order.get(orderId);
  if (!order) throw new Error("Order not found");
  if (order.order_status === "completed" && order.buyer_confirmed_at) {
    return { order, alreadyConfirmed: true };
  }
  if (order.order_status !== "delivered") {
    throw new Error("The order must be delivered before the buyer can confirm receipt.");
  }

  const shipments = await svc.entities.Shipment.filter({ order_id: orderId });
  const isPickup = order.fulfillment_method === "buyer_pickup" || order.fulfillment_method === "pickup";
  if (!isPickup && !(shipments || []).length) {
    throw new Error("Delivery cannot be confirmed without a shipment record.");
  }
  if (!isPickup && !(shipments || []).every((shipment) =>
    ["delivered", "confirmed"].includes(shipment.shipment_status)
  )) {
    throw new Error("Every shipment must be delivered before buyer confirmation.");
  }

  const confirmedAt = order.buyer_confirmed_at || new Date().toISOString();
  const eligibleAt = order.payout_eligible_at || payoutEligibleAt(confirmedAt);
  for (const shipment of (shipments || [])) {
    if (shipment.shipment_status === "delivered") {
      await updateShipmentStatus(svc, shipment.id, "confirmed", {
        type: "buyer",
        id: actor.id,
        description: "Buyer confirmed delivery",
      });
    }
    await svc.entities.Shipment.update(shipment.id, {
      buyer_confirmed: true,
      receiver_name: details?.receiver_name || shipment.receiver_name || order.contact_name || "Buyer",
      delivery_notes: details?.delivery_notes || shipment.delivery_notes || "",
      confirmation_code: details?.confirmation_code || shipment.confirmation_code || "",
    });
  }

  await transitionOrder(svc, orderId, "completed", {
    type: "buyer",
    id: actor.id,
    description: "Buyer confirmed receipt; payout cooling hold started",
    metadata: { payout_eligible_at: eligibleAt, payout_hold_hours: payoutHoldHours() },
  });
  await svc.entities.Order.update(orderId, {
    buyer_confirmed_at: confirmedAt,
    completed_at: confirmedAt,
    payout_eligible_at: eligibleAt,
  });
  order = await svc.entities.Order.get(orderId);

  await notifySafely(svc, {
    user_id: order.vendor_owner_id,
    type: "order_delivered",
    eventType: "buyer_delivery_confirmed",
    title: "Buyer confirmed delivery",
    body: order.order_number + " is complete. Settlement remains in the cooling hold.",
    reference_type: "order",
    reference_id: orderId,
    order_id: orderId,
    buyer_id: order.buyer_id,
    vendor_id: order.vendor_id,
  });
  return { order, payout_eligible_at: eligibleAt, payout_hold_hours: payoutHoldHours() };
}
