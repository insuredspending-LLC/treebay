import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { updateShipmentStatus, transitionOrder, raiseExceptionOnce } from "../../shared/transactions.ts";
import { notifySafely } from "../../shared/notifications.ts";

// Carrier-authorized shipment actions. The carrier mutates shipment status ONLY
// through this secure backend function — Shipment is never directly writable from React.
// Role ownership: carrier may accept, pickup, in_transit, deliver. Vendor/buyer may NOT.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const shipmentId = body?.shipmentId;
    const action = body?.action;
    if (!shipmentId || !action) return Response.json({ error: "shipmentId and action required" }, { status: 400 });

    const svc = base44.asServiceRole;
    const shipment = await svc.entities.Shipment.get(shipmentId);
    if (!shipment) return Response.json({ error: "Shipment not found" }, { status: 404 });
    if (!shipment.carrier_id) return Response.json({ error: "No carrier assigned to this shipment." }, { status: 403 });

    // Verify carrier authorization: the carrier must own the assigned CarrierProfile
    const carrier = await svc.entities.CarrierProfile.get(shipment.carrier_id);
    if (!carrier || carrier.created_by_id !== user.id) {
      return Response.json({ error: "You are not the assigned carrier for this shipment." }, { status: 403 });
    }
    if (carrier.verification_status !== "verified") {
      return Response.json({ error: "Your carrier account is not verified." }, { status: 403 });
    }

    const order = await svc.entities.Order.get(shipment.order_id);
    if (!order) return Response.json({ error: "Order not found" }, { status: 404 });

    let newStatus = null;
    let description = "";

    if (action === "accept") {
      newStatus = "pickup_scheduled";
      description = "Carrier accepted load";
    } else if (action === "pickup") {
      newStatus = "picked_up";
      description = "Carrier confirmed pickup";
    } else if (action === "in_transit") {
      newStatus = "in_transit";
      description = "Carrier marked in transit";
    } else if (action === "deliver") {
      newStatus = "delivered";
      description = "Carrier confirmed delivery";
      // Record POD fields — do not invent values
      await svc.entities.Shipment.update(shipmentId, {
        delivery_timestamp: body?.delivery_timestamp || new Date().toISOString(),
        receiver_name: body?.receiver_name || "",
        delivery_notes: body?.delivery_notes || "",
        proof_of_delivery_url: body?.proof_of_delivery_url || null,
        confirmation_code: body?.confirmation_code || "",
        carrier_confirmed: true,
      });
    } else if (action === "decline") {
      // Carrier declines the assigned load — raises exception for re-assignment
      await svc.entities.FreightQuote.update(shipment.freight_quote_id, { status: "declined" });
      await raiseExceptionOnce(svc, {
        severity: "ACTION_REQUIRED", exception_type: "freight_assignment_failed",
        order_id: order.id, shipment_id: shipment.id,
        buyer_id: order.buyer_id, vendor_id: order.vendor_id, carrier_id: carrier.id,
        reason: "Carrier declined load for " + order.order_number,
        recommended_action: "Re-assign to another verified carrier via maintenance.",
        requires_admin: true, status: "ADMIN_REVIEW",
      });
      await notifySafely(svc, { user_id: order.vendor_owner_id, type: "general", eventType: "carrier_declined", title: "Carrier declined load", body: order.order_number, reference_type: "order", reference_id: order.id, order_id: order.id, buyer_id: order.buyer_id, vendor_id: order.vendor_id, carrier_id: carrier.id });
      return Response.json({ ok: true, declined: true });
    } else {
      return Response.json({ error: "Unknown action" }, { status: 400 });
    }

    // Transition shipment status (validated by state machine)
    try {
      await updateShipmentStatus(svc, shipmentId, newStatus, { type: "carrier", id: user.id, description });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 400 });
    }

    // Sync order status: picked_up, in_transit, delivered map directly
    const ORDER_STATUS_MAP = { pickup_scheduled: null, picked_up: "picked_up", in_transit: "in_transit", delivered: "delivered" };
    const orderStatus = ORDER_STATUS_MAP[newStatus];
    if (orderStatus) {
      try {
        await transitionOrder(svc, order.id, orderStatus, { type: "carrier", id: user.id, description: "Carrier advanced to " + newStatus });
      } catch { /* order may already be at or past this state */ }
    }

    // Notify buyer and vendor (via notifySafely — never rolls back)
    const notifType = newStatus === "delivered" ? "order_delivered" : "order_shipped";
    await notifySafely(svc, { user_id: order.buyer_id, type: notifType, eventType: "carrier_" + action, title: "Shipment update", body: order.order_number + " — " + description, reference_type: "order", reference_id: order.id, order_id: order.id, buyer_id: order.buyer_id, vendor_id: order.vendor_id, carrier_id: carrier.id });
    await notifySafely(svc, { user_id: order.vendor_owner_id, type: notifType, eventType: "carrier_" + action, title: "Shipment update", body: order.order_number + " — " + description, reference_type: "order", reference_id: order.id, order_id: order.id, buyer_id: order.buyer_id, vendor_id: order.vendor_id, carrier_id: carrier.id });

    return Response.json({ ok: true, shipment_status: newStatus });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}