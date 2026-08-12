import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { processTestPayment } from "../../shared/payments.ts";
import { advanceFulfillment, cancelOrder, recordDeliveryEvent } from "../../shared/fulfillment.ts";
import { getActiveReservation, getReservation } from "../../shared/inventory.ts";
import { allocationGroup, settlementGroup, refundGroup, createLedgerEntry, updateShipmentStatus, transitionOrder, vendorPayableCents } from "../../shared/transactions.ts";
import { retryFreightAssignment } from "../../shared/freight.ts";
import { notifySafely } from "../../shared/notifications.ts";

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
        // Direct listing, buyer pickup: buyer pays -> vendor confirm/prepare/ready ->
        // buyer pickup/receipt through the same Order state machine -> system complete/settle.
        const results = [];
        results.push({ step: "buyer_pay", result: (await processTestPayment(svc, orderId, "TEST_SUCCESS", actor)).body });
        for (let i = 0; i < 3; i++) results.push({ step: "vendor_advance_" + i, result: (await advanceFulfillment(svc, orderId, actor)).body });
        let pickupOrder = await svc.entities.Order.get(orderId);
        if (pickupOrder.order_status === "ready_for_pickup") {
          await transitionOrder(svc, orderId, "picked_up", { type: "buyer", id: pickupOrder.buyer_id, description: "Buyer confirmed pickup (simulator)" });
          results.push({ step: "buyer_confirm_pickup", result: { order_status: "picked_up" } });
          await transitionOrder(svc, orderId, "delivered", { type: "buyer", id: pickupOrder.buyer_id, description: "Buyer confirmed receipt (simulator)" });
          await svc.entities.Order.update(orderId, { delivered_at: new Date().toISOString() });
          results.push({ step: "buyer_confirm_received", result: { order_status: "delivered" } });
        }
        const maintenance = await base44.functions.invoke("runTransactionMaintenance", {});
        results.push({ step: "system_complete_settle", result: maintenance.data });
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
        // Direct listing, third-party carrier: use ACTUAL roles
        // buyer pays -> vendor confirms/prepares/marks ready -> SYSTEM auto-assigns freight ->
        // carrier accepts/picks up/in transit/delivers with POD -> SYSTEM completes + settles
        const results = [];
        results.push({ step: "buyer_pay", result: (await processTestPayment(svc, orderId, "TEST_SUCCESS", actor)).body });
        for (let i = 0; i < 3; i++) { results.push({ step: "vendor_advance_" + i, result: (await advanceFulfillment(svc, orderId, actor)).body }); }
        let orderC = await svc.entities.Order.get(orderId);
        if (orderC.order_status === "ready_for_pickup") {
          const res = await base44.functions.invoke("runTransactionMaintenance", {});
          results.push({ step: "maintenance_freight", result: res.data });
          orderC = await svc.entities.Order.get(orderId);
        }
        const shipments = await svc.entities.Shipment.filter({ order_id: orderId });
        const shipment = (shipments || [])[0];
        if (shipment && shipment.carrier_id && orderC.order_status === "delivery_assigned") {
          await updateShipmentStatus(svc, shipment.id, "pickup_scheduled", { type: "carrier", id: "simulator", description: "Carrier accepted (simulator)" });
          await updateShipmentStatus(svc, shipment.id, "picked_up", { type: "carrier", id: "simulator", description: "Carrier picked up (simulator)" });
          await transitionOrder(svc, orderId, "picked_up", { type: "carrier", id: "simulator", description: "Carrier picked up (simulator)" });
          await updateShipmentStatus(svc, shipment.id, "in_transit", { type: "carrier", id: "simulator", description: "Carrier in transit (simulator)" });
          await transitionOrder(svc, orderId, "in_transit", { type: "carrier", id: "simulator", description: "Carrier in transit (simulator)" });
          await svc.entities.Shipment.update(shipment.id, { delivery_timestamp: new Date().toISOString(), receiver_name: "TEST Receiver", confirmation_code: "TEST-POD-001", carrier_confirmed: true });
          await updateShipmentStatus(svc, shipment.id, "delivered", { type: "carrier", id: "simulator", description: "Carrier delivered (simulator)" });
          await transitionOrder(svc, orderId, "delivered", { type: "carrier", id: "simulator", description: "Carrier delivered (simulator)" });
          results.push({ step: "carrier_fulfillment", result: { shipment_status: "delivered", order_status: "delivered" } });
        }
        const res2 = await base44.functions.invoke("runTransactionMaintenance", {});
        results.push({ step: "system_complete_settle", result: res2.data });
        result = { composite: true, steps: results };
        break;
      }
      case "SCENARIO_D": {
        // RFQ path: same carrier-authoritative flow as C after RFQ acceptance
        const results = [];
        results.push({ step: "buyer_pay", result: (await processTestPayment(svc, orderId, "TEST_SUCCESS", actor)).body });
        for (let i = 0; i < 3; i++) { results.push({ step: "vendor_advance_" + i, result: (await advanceFulfillment(svc, orderId, actor)).body }); }
        let orderD = await svc.entities.Order.get(orderId);
        if (orderD.order_status === "ready_for_pickup") {
          const res = await base44.functions.invoke("runTransactionMaintenance", {});
          results.push({ step: "maintenance_freight", result: res.data });
          orderD = await svc.entities.Order.get(orderId);
        }
        const shipments = await svc.entities.Shipment.filter({ order_id: orderId });
        const shipment = (shipments || [])[0];
        if (shipment && shipment.carrier_id && orderD.order_status === "delivery_assigned") {
          await updateShipmentStatus(svc, shipment.id, "pickup_scheduled", { type: "carrier", id: "simulator", description: "Carrier accepted (simulator)" });
          await updateShipmentStatus(svc, shipment.id, "picked_up", { type: "carrier", id: "simulator", description: "Carrier picked up (simulator)" });
          await transitionOrder(svc, orderId, "picked_up", { type: "carrier", id: "simulator", description: "Carrier picked up (simulator)" });
          await updateShipmentStatus(svc, shipment.id, "in_transit", { type: "carrier", id: "simulator", description: "Carrier in transit (simulator)" });
          await transitionOrder(svc, orderId, "in_transit", { type: "carrier", id: "simulator", description: "Carrier in transit (simulator)" });
          await svc.entities.Shipment.update(shipment.id, { delivery_timestamp: new Date().toISOString(), receiver_name: "TEST Receiver", confirmation_code: "TEST-POD-002", carrier_confirmed: true });
          await updateShipmentStatus(svc, shipment.id, "delivered", { type: "carrier", id: "simulator", description: "Carrier delivered (simulator)" });
          await transitionOrder(svc, orderId, "delivered", { type: "carrier", id: "simulator", description: "Carrier delivered (simulator)" });
          results.push({ step: "carrier_fulfillment", result: { shipment_status: "delivered", order_status: "delivered" } });
        }
        const res2 = await base44.functions.invoke("runTransactionMaintenance", {});
        results.push({ step: "system_complete_settle", result: res2.data });
        result = { composite: true, steps: results };
        break;
      }
      case "SCENARIO_E": {
        // Controlled notification failure AFTER a successful commercial commit.
        // Invalid notification enum guarantees the TEST notification write fails schema validation.
        const payResult = (await processTestPayment(svc, orderId, "TEST_SUCCESS", actor)).body;
        const forcedNotification = await notifySafely(svc, {
          user_id: order.buyer_id, type: "__TEST_FORCE_FAILURE__", eventType: "scenario_e_forced_failure",
          title: "TEST forced failure", body: "TEST only", reference_type: "order", reference_id: orderId,
          order_id: orderId, buyer_id: order.buyer_id, vendor_id: order.vendor_id,
        });
        const orderAfter = await svc.entities.Order.get(orderId);
        const exceptions = await svc.entities.SystemException.filter({ order_id: orderId, exception_type: "notification_delivery_failed" }, "-created_date", 20);
        const notificationException = (exceptions || []).find((e) => e.status !== "RESOLVED" && e.status !== "CLOSED");
        result = {
          composite: true, payment: payResult, forcedNotification,
          commercialStatePreserved: orderAfter.payment_status === "paid" && orderAfter.order_status === "inventory_reserved",
          notificationExceptionCreated: !!notificationException,
        };
        break;
      }
      case "SCENARIO_F": {
        // Freight retry lifecycle: no carrier -> retries -> no immediate escalation ->
        // retry exhaustion -> Admin escalation -> carrier available -> recovery -> exception resolved
        const results = [];
        results.push({ step: "buyer_pay", result: (await processTestPayment(svc, orderId, "TEST_SUCCESS", actor)).body });
        for (let i = 0; i < 3; i++) { results.push({ step: "vendor_advance_" + i, result: (await advanceFulfillment(svc, orderId, actor)).body }); }
        const verifiedCarriers = await svc.entities.CarrierProfile.filter({ verification_status: "verified" });
        for (const c of (verifiedCarriers || [])) { await svc.entities.CarrierProfile.update(c.id, { verification_status: "suspended" }); }
        const res1 = await base44.functions.invoke("runTransactionMaintenance", {});
        results.push({ step: "maintenance_no_carrier", result: res1.data });
        const excs1 = await svc.entities.SystemException.filter({ order_id: orderId, exception_type: "freight_assignment_failed" });
        const exc1 = (excs1 || []).find((e) => e.status !== "RESOLVED" && e.status !== "CLOSED");
        results.push({ step: "exception_after_first_failure", exception: exc1 ? { severity: exc1.severity, status: exc1.status, requires_admin: exc1.requires_admin, retry_count: exc1.retry_count } : null });
        for (let i = 0; i < 3; i++) { await base44.functions.invoke("runTransactionMaintenance", {}); }
        const excs2 = await svc.entities.SystemException.filter({ order_id: orderId, exception_type: "freight_assignment_failed" });
        const exc2 = (excs2 || []).find((e) => e.status !== "RESOLVED" && e.status !== "CLOSED");
        results.push({ step: "exception_after_exhaustion", exception: exc2 ? { severity: exc2.severity, status: exc2.status, requires_admin: exc2.requires_admin, retry_count: exc2.retry_count } : null });
        if (verifiedCarriers && verifiedCarriers.length) { await svc.entities.CarrierProfile.update(verifiedCarriers[0].id, { verification_status: "verified" }); }
        const resFinal = await base44.functions.invoke("runTransactionMaintenance", {});
        results.push({ step: "maintenance_after_restore", result: resFinal.data });
        const excs3 = await svc.entities.SystemException.filter({ order_id: orderId, exception_type: "freight_assignment_failed" });
        const exc3 = (excs3 || []).find((e) => e.status !== "RESOLVED" && e.status !== "CLOSED");
        results.push({ step: "exception_after_recovery", exceptionResolved: !exc3 });
        result = { composite: true, steps: results };
        break;
      }
      case "SCENARIO_G": {
        // Partial settlement recovery: create ONLY the correct vendor payout entry,
        // leave carrier settlement absent, then maintenance creates the missing carrier entry.
        const cq = order.checkout_quote_id ? await svc.entities.CheckoutQuote.get(order.checkout_quote_id) : null;
        if (!cq) { result = { error: "No checkout quote" }; break; }
        const group = settlementGroup(orderId);
        await createLedgerEntry(svc, { order_id: orderId, transaction_id: group, entry_key: "payout", entry_type: "payout", party_type: "vendor", party_id: cq.vendor_id, description: "Vendor payout (partial write test)", debit_cents: vendorPayableCents(cq) });
        const res = await base44.functions.invoke("runTransactionMaintenance", {});
        result = { partialWrite: true, maintenance: res.data };
        break;
      }
      case "SCENARIO_H": {
        // Financial mismatch blocks settlement with CRITICAL exception
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