import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { updateShipmentStatus, transitionOrder, raiseExceptionOnce } from "../../shared/transactions.ts";
import { notifySafely } from "../../shared/notifications.ts";
import { reassignFreight } from "../../shared/freight.ts";

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

    // Validate action/state BEFORE writing POD or other side effects.
    const currentShipmentStatus = shipment.shipment_status;
    const stateAllowed =
      (action === "accept" && currentShipmentStatus === "assigned") ||
      (action === "decline" && currentShipmentStatus === "assigned") ||
      (action === "pickup" && currentShipmentStatus === "pickup_scheduled") ||
      (action === "in_transit" && currentShipmentStatus === "picked_up") ||
      (action === "deliver" && ["in_transit", "delivery_delayed"].includes(currentShipmentStatus));
    if (!stateAllowed) {
      return Response.json({ error: "Action " + action + " is not valid while shipment is " + currentShipmentStatus + "." }, { status: 400 });
    }

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
      // POD validation: require at least one piece of delivery evidence
      const hasReceiver = body?.receiver_name && String(body.receiver_name).trim();
      const hasCode = body?.confirmation_code && String(body.confirmation_code).trim();
      const hasPodUrl = body?.proof_of_delivery_url && String(body.proof_of_delivery_url).trim();
      if (!hasReceiver && !hasCode && !hasPodUrl) {
        return Response.json({ error: "Proof of delivery required: provide receiver name, confirmation code, or proof of delivery photo." }, { status: 400 });
      }
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
      // Carrier declines — release carrier assignment, try immediate reassignment to a different carrier.
      // Decline history is preserved via the declined FreightQuote. The same carrier is NOT re-assigned.
      const cq = order.checkout_quote_id ? await svc.entities.CheckoutQuote.get(order.checkout_quote_id) : null;
      try {
        await reassignFreight(svc, order, cq, shipment, carrier.id);
        await notifySafely(svc, { user_id: order.vendor_owner_id, type: "general", eventType: "carrier_declined", title: "Carrier declined — new carrier assigned", body: order.order_number, reference_type: "order", reference_id: order.id, order_id: order.id, buyer_id: order.buyer_id, vendor_id: order.vendor_id, carrier_id: carrier.id });
      } catch (e) {
        // Reassignment failed — raise WARNING for automatic retry via maintenance
        await raiseExceptionOnce(svc, {
          severity: "WARNING", exception_type: "freight_assignment_failed",
          order_id: order.id, shipment_id: shipment.id,
          buyer_id: order.buyer_id, vendor_id: order.vendor_id, carrier_id: carrier.id,
          reason: "Carrier declined load for " + order.order_number + " and no alternative carrier available",
          recommended_action: "System will retry. Verify a carrier in admin if retries exhaust.",
          requires_admin: false, status: "AUTO_RETRYING",
          retry_count: 0, max_retries: 3,
          next_retry_at: new Date(Date.now() + 3600000).toISOString(),
        });
        await notifySafely(svc, { user_id: order.vendor_owner_id, type: "general", eventType: "carrier_declined", title: "Carrier declined — awaiting reassignment", body: order.order_number, reference_type: "order", reference_id: order.id, order_id: order.id, buyer_id: order.buyer_id, vendor_id: order.vendor_id, carrier_id: carrier.id });
      }
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