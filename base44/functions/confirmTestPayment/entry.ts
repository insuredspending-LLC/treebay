import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { processTestPayment } from "../../shared/payments.ts";

// Buyer-authorized TEST payment. The state machine itself lives in shared/payments.ts
// so the admin simulator exercises the exact same authoritative engine.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const orderId = body?.orderId;
    const outcome = body?.outcome || "TEST_SUCCESS";
    if (!orderId) return Response.json({ error: "orderId required" }, { status: 400 });

    const svc = base44.asServiceRole;
    const order = await svc.entities.Order.get(orderId);
    if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
    if (order.buyer_id !== user.id) return Response.json({ error: "Only the buyer can pay for this order." }, { status: 403 });

    const result = await processTestPayment(svc, orderId, outcome, { type: "buyer", id: user.id });
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}