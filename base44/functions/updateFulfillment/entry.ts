import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { advanceFulfillment, cancelOrder, recordDeliveryEvent } from "../../shared/fulfillment.ts";

// Vendor-authorized fulfillment actions. The state machine lives in
// shared/fulfillment.ts so the admin simulator drives the same engine.
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
      const result = await advanceFulfillment(svc, orderId, { type: "vendor", id: user.id, label: "Vendor" });
      return Response.json(result.body, { status: result.status });
    }

    if (action === "cancel") {
      if (!isVendor && !isBuyer) return Response.json({ error: "Not authorized" }, { status: 403 });
      const result = await cancelOrder(svc, orderId, { type: isVendor ? "vendor" : "buyer", id: user.id });
      return Response.json(result.body, { status: result.status });
    }

    if (action === "delivery_event") {
      if (!isVendor) return Response.json({ error: "Only the vendor can report delivery events." }, { status: 403 });
      const result = await recordDeliveryEvent(svc, orderId, body?.event, { type: "vendor", id: user.id });
      return Response.json(result.body, { status: result.status });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}