// TreEbay TEST freight provider — deterministic, repeatable quotes.
// NOT real market freight rates. Architecture testing only.
// Every UI location must clearly label: TEST FREIGHT until a real freight integration exists.

import { notifySafely } from "./notifications.ts";
import { raiseExceptionOnce, updateCarrierPayablePartyId } from "./transactions.ts";

export const TEST_FREIGHT_PROVIDER = "trebay_test_freight";
export const FREIGHT_QUOTE_TTL_HOURS = 48;

export function genFreightQuoteReference() {
  return "FQ-TEST-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
}

// Deterministic TEST freight quote breakdown.
// The buyer_freight_charge_cents is LOCKED to what the buyer already paid at checkout
// (CheckoutQuote.delivery_amount_cents). The carrier_pay_cents equals the buyer charge
// in TEST mode (no marketplace freight markup yet). linehaul/fuel/accessorial are
// deterministic breakdowns of the carrier pay — not real market rates.
export function calculateTestFreightQuote(buyerFreightChargeCents, equipmentType) {
  const carrierPay = buyerFreightChargeCents || 0;
  const linehaul = Math.round(carrierPay * 0.80);
  const fuel = Math.round(carrierPay * 0.12);
  const accessorial = carrierPay - linehaul - fuel;
  return {
    linehaul_cents: linehaul,
    fuel_surcharge_cents: fuel,
    accessorial_cents: accessorial,
    carrier_pay_cents: carrierPay,
    buyer_freight_charge_cents: carrierPay,
    equipment_type: equipmentType || "flatbed",
  };
}

// Find a verified TEST carrier. In TEST MODE, the first verified carrier is assigned.
// This is NOT real FMCSA/insurance verification — it is a TEST compliance gate.
export async function findVerifiedCarrier(svc) {
  const carriers = await svc.entities.CarrierProfile.filter({ verification_status: "verified" }, "business_name", 10);
  return (carriers || [])[0] || null;
}

// Auto-assign freight for a third_party_carrier shipment.
// Called after the order reaches delivery_assigned and a Shipment exists.
// Steps:
//   1. Create/confirm FreightQuote (deterministic TEST rates, locked to buyer-paid amount)
//   2. Assign verified TEST carrier
//   3. Update Shipment with carrier_id, freight_quote_id, delivery_price_cents
//   4. Notify carrier, vendor, buyer (via notifySafely — never rolls back)
// On failure: retry via runTransactionMaintenance, then SystemException.
export async function autoAssignFreight(svc, order, cq, shipment) {
  if (!shipment) throw new Error("Shipment required for freight assignment");
  if (order.fulfillment_method !== "third_party_carrier") return { skipped: true };

  // Idempotency: if shipment already has carrier_id and freight_quote_id, skip
  if (shipment.carrier_id && shipment.freight_quote_id) {
    const existing = await svc.entities.FreightQuote.get(shipment.freight_quote_id);
    if (existing && existing.status === "assigned") return { freightQuote: existing, alreadyAssigned: true };
  }

  // 1. Find a verified carrier
  const carrier = await findVerifiedCarrier(svc);
  if (!carrier) {
    await raiseExceptionOnce(svc, {
      severity: "ACTION_REQUIRED",
      exception_type: "freight_assignment_failed",
      order_id: order.id,
      shipment_id: shipment.id,
      buyer_id: order.buyer_id,
      vendor_id: order.vendor_id,
      reason: "No verified TEST carrier available for " + order.order_number,
      recommended_action: "Verify a carrier in admin, then re-run transaction maintenance.",
      requires_admin: true,
      status: "ADMIN_REVIEW",
      retry_count: 0, max_retries: 3,
      next_retry_at: new Date(Date.now() + 3600000).toISOString(),
    });
    throw new Error("No verified TEST carrier available");
  }

  // 2. Create FreightQuote — locked to the buyer-paid delivery amount
  const freight = calculateTestFreightQuote(cq.delivery_amount_cents || 0, shipment.equipment_requirement);
  const quoteRef = genFreightQuoteReference();
  const expiresAt = new Date(Date.now() + FREIGHT_QUOTE_TTL_HOURS * 3600000).toISOString();
  const freightQuote = await svc.entities.FreightQuote.create({
    order_id: order.id,
    checkout_quote_id: cq.id,
    carrier_id: carrier.id,
    carrier_owner_id: carrier.created_by_id,
    buyer_id: order.buyer_id,
    vendor_owner_id: order.vendor_owner_id,
    provider: TEST_FREIGHT_PROVIDER,
    quote_reference: quoteRef,
    linehaul_cents: freight.linehaul_cents,
    fuel_surcharge_cents: freight.fuel_surcharge_cents,
    accessorial_cents: freight.accessorial_cents,
    carrier_pay_cents: freight.carrier_pay_cents,
    buyer_freight_charge_cents: freight.buyer_freight_charge_cents,
    equipment_type: freight.equipment_type,
    pickup_window: shipment.pickup_window || null,
    delivery_window: shipment.delivery_window || null,
    estimated_transit_days: 2,
    expires_at: expiresAt,
    status: "assigned",
  });

  // 3. Update Shipment with carrier assignment + freight quote reference
  await svc.entities.Shipment.update(shipment.id, {
    carrier_id: carrier.id,
    freight_quote_id: freightQuote.id,
    delivery_price_cents: freight.buyer_freight_charge_cents,
    equipment_requirement: freight.equipment_type,
  });
  // Update the carrier delivery payable in the allocation ledger with the carrier_id
  // (at payment time, no carrier was assigned yet, so party_id was null)
  try { await updateCarrierPayablePartyId(svc, order.id, carrier.id); } catch { /* best-effort */ }

  // 4. Notify carrier, vendor, buyer — via notifySafely (never rolls back)
  await notifySafely(svc, {
    user_id: carrier.created_by_id, type: "new_order", eventType: "freight_assigned",
    title: "New freight load assigned", body: order.order_number + " — " + (shipment.delivery_location || ""),
    reference_type: "shipment", reference_id: shipment.id,
    order_id: order.id, carrier_id: carrier.id, buyer_id: order.buyer_id, vendor_id: order.vendor_id,
  });
  await notifySafely(svc, {
    user_id: order.vendor_owner_id, type: "order_shipped", eventType: "freight_assigned",
    title: "Freight carrier assigned", body: order.order_number + " — " + (carrier.business_name || "TEST carrier"),
    reference_type: "order", reference_id: order.id,
    order_id: order.id, carrier_id: carrier.id, buyer_id: order.buyer_id, vendor_id: order.vendor_id,
  });
  await notifySafely(svc, {
    user_id: order.buyer_id, type: "order_shipped", eventType: "freight_assigned",
    title: "Freight carrier assigned", body: order.order_number + " — " + (carrier.business_name || "TEST carrier"),
    reference_type: "order", reference_id: order.id,
    order_id: order.id, carrier_id: carrier.id, buyer_id: order.buyer_id, vendor_id: order.vendor_id,
  });

  return { freightQuote, carrier, alreadyAssigned: false };
}

// Retry freight assignment for orders stuck in delivery_assigned without a carrier.
// Called by runTransactionMaintenance.
export async function retryFreightAssignment(svc) {
  let assigned = 0, failed = 0;
  const shipments = await svc.entities.Shipment.filter({ shipment_status: "assigned", delivery_method: "third_party_carrier" }, "-created_date", 100);
  for (const sh of (shipments || [])) {
    if (sh.carrier_id && sh.freight_quote_id) continue; // already assigned
    const order = await svc.entities.Order.get(sh.order_id);
    if (!order) continue;
    const cq = order.checkout_quote_id ? await svc.entities.CheckoutQuote.get(order.checkout_quote_id) : null;
    if (!cq) continue;
    try {
      await autoAssignFreight(svc, order, cq, sh);
      assigned++;
    } catch {
      failed++;
    }
  }
  return { assigned, failed };
}