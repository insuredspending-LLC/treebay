import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { confirmBuyerDelivery } from "../../shared/deliveryConfirmation.ts";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const orderId = body?.orderId;
    if (!orderId) return Response.json({ error: "orderId required" }, { status: 400 });

    const svc = base44.asServiceRole;
    const order = await svc.entities.Order.get(orderId);
    if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
    if (order.buyer_id !== user.id && user.role !== "admin") {
      return Response.json({ error: "Only the buyer can confirm delivery." }, { status: 403 });
    }

    const result = await confirmBuyerDelivery(
      svc,
      orderId,
      { type: user.role === "admin" ? "admin" : "buyer", id: user.id },
      {
        receiver_name: body?.receiver_name,
        delivery_notes: body?.delivery_notes,
        confirmation_code: body?.confirmation_code,
      },
    );
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.message?.includes("must be delivered") ? 400 : 500 });
  }
}
