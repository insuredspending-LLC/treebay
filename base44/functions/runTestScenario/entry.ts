import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { processTestPayment } from "../../shared/payments.ts";
import { advanceFulfillment, cancelOrder, recordDeliveryEvent } from "../../shared/fulfillment.ts";
import { getActiveReservation, getReservation } from "../../shared/inventory.ts";
import { allocationGroup, settlementGroup, refundGroup } from "../../shared/transactions.ts";

// ADMIN TEST SIMULATOR.
// Every scenario below runs through the SAME authoritative engines used in
// production paths (shared/payments.ts, shared/fulfillment.ts, refundTestPayment,
// runTransactionMaintenance). There is deliberately NO separate fake state engine —
// the simulator exists to prove the real system.
const SCENARIOS = [
  "TEST_SUCCESS", "TEST_DECLINED", "TEST_TIMEOUT", "PAYMENT_RETRY_SUCCESS",
  "VENDOR_CONFIRM", "VENDOR_TIMEOUT",
  "DELIVERY_ASSIGN", "PICKUP", "IN_TRANSIT", "DELIVER",
  "DELIVERY_DELAY", "DELIVERY_FAIL",
  "REFUND", "CANCEL", "MAINTENANCE",
];

async function snapshot(svc, orderId) {
  const order = await svc.entities.Order.get(orderId);
  if (!order) return null;
  const cq = order.checkout_quote_id ? await svc.entities.CheckoutQuote.get(order.checkout_quote_id) : null;
  const payments = await svc.entities.PaymentRecord.filter({ order_id: orderId });
  const shipments = await svc.entities.Shipment.filter({ order_id: orderId });
  const ledger = await svc.entities.TransactionLedgerEntry.filter({ order_id: orderId });
  const exceptions = await svc.entities.SystemException.filter({ order_id: orderId });
  const reservation = await getReservation(svc, orderId);
  const product = cq?.product_id ? await svc.entities.Product.get(cq.product_id) : null;
  const group = (id) => (ledger || []).filter((e) => e.transaction_id === id);
  const sum = (rows, field) => rows.reduce((s, e) => s + (e[field] || 0), 0);
  const alloc = group(allocationGroup(orderId));
  return {
    order_number: order.order_number,
    order_status: order.order_status,
    payment_status: order.payment_status,
    payment: (payments || []).map((p) => ({ status: p.status, ref: p.transaction_ref, amount_cents: p.amount_cents })),
    shipment: (shipments || []).map((s) => s.shipment_status),
    reservation: reservation ? { status: reservation.status, quantity: reservation.quantity } : null,
    inventory: product ? { available: product.quantity_available, reserved: product.quantity_reserved, sold: product.quantity_sold } : null,
    ledger: {
      allocation_entries: alloc.length,
      allocation_debits: sum(alloc, "debit_cents"),
      allocation_credits: sum(alloc, "credit_cents"),
      allocation_reconciled: sum(alloc, "debit_cents") === sum(alloc, "credit_cents"),
      settlement_entries: group(settlementGroup(orderId)).length,
      refund_entries: group(refundGroup(orderId)).length,
    },
    open_exceptions: (exceptions || [])
      .filter((e) => e.status !== "RESOLVED" && e.status !== "CLOSED")
      .map((e) => ({ type: e.exception_type, severity: e.severity, status: e.status })),
  };
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "The test simulator is available to administrators only." }, { status: 403 });

    const body = await req.json() || {};
    const scenario = body.scenario;
    const orderId = body.orderId;
    if (!scenario) return Response.json({ error: "scenario required", scenarios: SCENARIOS }, { status: 400 });

    const svc = base44.asServiceRole;
    const actor = { type: "admin", id: user.id, label: "Admin simulator" };

    if (scenario === "MAINTENANCE") {
      const res = await base44.functions.invoke("runTransactionMaintenance", {});
      return Response.json({ scenario, result: res.data, state: orderId ? await snapshot(svc, orderId) : null });
    }

    if (!orderId) return Response.json({ error: "orderId required for this scenario" }, { status: 400 });
    const order = await svc.entities.Order.get(orderId);
    if (!order) return Response.json({ error: "Order not found" }, { status: 404 });

    let result;
    switch (scenario) {
      case "TEST_SUCCESS":
      case "TEST_DECLINED":
      case "TEST_TIMEOUT":
        result = (await processTestPayment(svc, orderId, scenario, actor)).body;
        break;
      case "PAYMENT_RETRY_SUCCESS":
        result = (await processTestPayment(svc, orderId, "TEST_SUCCESS", actor)).body;
        break;
      case "VENDOR_CONFIRM":
      case "DELIVERY_ASSIGN":
      case "PICKUP":
      case "IN_TRANSIT":
      case "DELIVER":
        result = (await advanceFulfillment(svc, orderId, actor)).body;
        break;
      case "VENDOR_TIMEOUT": {
        // Force the confirmation deadline into the past, then let maintenance escalate.
        await svc.entities.Order.update(orderId, { vendor_confirm_deadline: new Date(Date.now() - 3600000).toISOString() });
        const res = await base44.functions.invoke("runTransactionMaintenance", {});
        result = res.data;
        break;
      }
      case "DELIVERY_DELAY":
        result = (await recordDeliveryEvent(svc, orderId, "delay", actor)).body;
        break;
      case "DELIVERY_FAIL":
        result = (await recordDeliveryEvent(svc, orderId, "fail", actor)).body;
        break;
      case "CANCEL":
        result = (await cancelOrder(svc, orderId, actor)).body;
        break;
      case "REFUND": {
        const res = await base44.functions.invoke("refundTestPayment", { orderId, reason: "Admin simulator refund" });
        result = res.data;
        break;
      }
      default:
        return Response.json({ error: "Unknown scenario", scenarios: SCENARIOS }, { status: 400 });
    }

    return Response.json({ scenario, result, state: await snapshot(svc, orderId) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}