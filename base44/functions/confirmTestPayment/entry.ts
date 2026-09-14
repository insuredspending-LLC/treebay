import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { processTestPayment } from "../../shared/payments.ts";
import { requireInternalSimulatorAccess } from "../../shared/commerceAccess.ts";

// Buyer-authorized approved TEST payment. Public users cannot invoke the simulator.
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
    await requireInternalSimulatorAccess(svc, user);

    const order = await svc.entities.Order.get(orderId);
    if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
    if (order.buyer_id !== user.id && user.role !== "admin") {
      return Response.json({ error: "Only the buyer can pay for this order." }, { status: 403 });
    }
    if (order.commerce_mode !== "test") {
      return Response.json({ error: "Approved test payment is not permitted for this order." }, { status: 400 });
    }

    const result = await processTestPayment(svc, orderId, outcome, {
      type: user.role === "admin" ? "admin" : "buyer",
      id: user.id,
      simulator_authorized: true,
    });
    return Response.json(result.body, { status: result.status });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
}
