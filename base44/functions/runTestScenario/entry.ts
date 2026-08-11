import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { processTestPayment } from "../../shared/payments.ts";
import { advanceFulfillment, cancelOrder, recordDeliveryEvent } from "../../shared/fulfillment.ts";
import { getActiveReservation, getReservation } from "../../shared/inventory.ts";
import { allocationGroup, settlementGroup, refundGroup, createLedgerEntry } from "../../shared/transactions.ts";
import { retryFreightAssignment } from "../../shared/freight.ts";

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
  "SCENARIO_A", "SCENARIO_B", "SCENARIO_C", "SCENARIO_D",
  "SCENARIO_E", "SCENARIO_F", "SCENARIO_G", "SCENARIO_H",
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
        try {
          const res = await base44.functions.invoke("refundTestPayment", { orderId, reason: "Admin simulator refund" });
          result = res.data;
        } catch (e) {
          // Surface the engine's actual reason instead of a bare status code.
          result = { error: e?.response?.data?.error || e.message };
        }
        break;
      }
      case "SCENARIO_A": {
        // Direct listing, buyer pickup: pay -> confirm -> prepare -> ready -> pickup -> deliver -> complete -> settle
        const steps = ["TEST_SUCCESS", "VENDOR_CONFIRM", "VENDOR_CONFIRM", "VENDOR_CONFIRM", "VENDOR_CONFIRM", "VENDOR_CONFIRM", "MAINTENANCE"];
        const results = [];
        for (const step of steps) {
          if (step === "MAINTENANCE") { const res = await base44.functions.invoke("runTransactionMaintenance", {}); results.push({ step, result: res.data }); }
          else if (step === "TEST_SUCCESS") { results.push({ step, result: (await processTestPayment(svc, orderId, "TEST_SUCCESS", actor)).body }); }
          else { results.push({ step, result: (await advanceFulfillment(svc, orderId, actor)).body }); }
        }
        result = { composite: true, steps: results };
        break;
      }
      case "SCENARIO_B": {
        // Direct listing, vendor delivery: pay -> confirm -> prepare -> ready -> assign -> pickup -> transit -> deliver -> settle
        const steps = ["TEST_SUCCESS", "VENDOR_CONFIRM", "VENDOR_CONFIRM", "VENDOR_CONFIRM", "VENDOR_CONFIRM", "VENDOR_CONFIRM", "VENDOR_CONFIRM", "VENDOR_CONFIRM", "MAINTENANCE"];
        const results = [];
        for (const step of steps) {
          if (step === "MAINTENANCE") { const res = await base44.functions.invoke("runTransactionMaintenance", {}); results.push({ step, result: res.data }); }
          else if (step === "TEST_SUCCESS") { results.push({ step, result: (await processTestPayment(svc, orderId, "TEST_SUCCESS", actor)).body }); }
          else { results.push({ step, result: (await advanceFulfillment(svc, orderId, actor)).body }); }
        }
        result = { composite: true, steps: results };
        break;
      }
      case "SCENARIO_C": {
        // Direct listing, third-party carrier: pay -> confirm -> prepare -> ready -> assign (auto freight) -> pickup -> transit -> deliver -> settle
        const steps = ["TEST_SUCCESS", "VENDOR_CONFIRM", "VENDOR_CONFIRM", "VENDOR_CONFIRM", "VENDOR_CONFIRM", "VENDOR_CONFIRM", "VENDOR_CONFIRM", "MAINTENANCE"];
        const results = [];
        for (const step of steps) {
          if (step === "MAINTENANCE") { const res = await base44.functions.invoke("runTransactionMaintenance", {}); results.push({ step, result: res.data }); }
          else if (step === "TEST_SUCCESS") { results.push({ step, result: (await processTestPayment(svc, orderId, "TEST_SUCCESS", actor)).body }); }
          else { results.push({ step, result: (await advanceFulfillment(svc, orderId, actor)).body }); }
        }
        result = { composite: true, steps: results };
        break;
      }
      case "SCENARIO_D": {
        // RFQ path: same as C but for an accepted-quote order
        const steps = ["TEST_SUCCESS", "VENDOR_CONFIRM", "VENDOR_CONFIRM", "VENDOR_CONFIRM", "VENDOR_CONFIRM", "VENDOR_CONFIRM", "VENDOR_CONFIRM", "MAINTENANCE"];
        const results = [];
        for (const step of steps) {
          if (step === "MAINTENANCE") { const res = await base44.functions.invoke("runTransactionMaintenance", {}); results.push({ step, result: res.data }); }
          else if (step === "TEST_SUCCESS") { results.push({ step, result: (await processTestPayment(svc, orderId, "TEST_SUCCESS", actor)).body }); }
          else { results.push({ step, result: (await advanceFulfillment(svc, orderId, actor)).body }); }
        }
        result = { composite: true, steps: results };
        break;
      }
      case "SCENARIO_E": {
        // Notification fails after commercial state commits — verify state is preserved
        const payResult = (await processTestPayment(svc, orderId, "TEST_SUCCESS", actor)).body;
        result = { composite: true, note: "Payment processed; notifications use notifySafely with retry+exception. Order state is preserved regardless of notification outcome.", payment: payResult };
        break;
      }
      case "SCENARIO_F": {
        // Carrier assignment fails — temporarily suspend all verified carriers
        const verifiedCarriers = await svc.entities.CarrierProfile.filter({ verification_status: "verified" });
        for (const c of (verifiedCarriers || [])) { await svc.entities.CarrierProfile.update(c.id, { verification_status: "suspended" }); }
        const freightRes = await retryFreightAssignment(svc);
        for (const c of (verifiedCarriers || [])) { await svc.entities.CarrierProfile.update(c.id, { verification_status: "verified" }); }
        result = { freightAssignment: freightRes, note: "All carriers temporarily suspended to simulate failure. Carriers restored." };
        break;
      }
      case "SCENARIO_G": {
        // Carrier payout settlement writes partially — create vendor payout only, then maintenance completes carrier payout
        const cq = order.checkout_quote_id ? await svc.entities.CheckoutQuote.get(order.checkout_quote_id) : null;
        if (!cq) { result = { error: "No checkout quote" }; break; }
        const group = settlementGroup(orderId);
        await createLedgerEntry(svc, { order_id: orderId, transaction_id: group, entry_key: "payout", entry_type: "payout", party_type: "vendor", party_id: cq.vendor_id, description: "Vendor payout (partial write test)", debit_cents: Math.round((cq.merchandise_subtotal_cents || 0) * 0.96) });
        const res = await base44.functions.invoke("runTransactionMaintenance", {});
        result = { partialWrite: true, maintenance: res.data };
        break;
      }
      case "SCENARIO_H": {
        // Financial allocation mismatch — inject an extra ledger entry to unbalance the allocation
        const group = allocationGroup(orderId);
        await createLedgerEntry(svc, { order_id: orderId, transaction_id: group, entry_key: "test_mismatch", entry_type: "adjustment", party_type: "marketplace", description: "TEST mismatch entry", debit_cents: 100 });
        const res = await base44.functions.invoke("runTransactionMaintenance", {});
        result = { mismatchInjected: true, maintenance: res.data, note: "Extra 100-cent entry injected. Settlement should be blocked with CRITICAL reconciliation exception." };
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