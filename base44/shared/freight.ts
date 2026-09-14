// TreEbay TEST freight provider — deterministic, repeatable quotes.
// NOT real market freight rates. Architecture testing only.
// Every UI location must clearly label: TEST FREIGHT until a real freight integration exists.

import { notifySafely } from "./notifications.ts";
import {
  raiseExceptionOnce, updateCarrierPayablePartyId,
  genFreightQuoteReference, calculateTestFreightQuote,
  transitionOrder, updateShipmentStatus,
} from "./transactions.ts";

export const TEST_FREIGHT_PROVIDER = "trebay_test_freight";
export const FREIGHT_QUOTE_TTL_HOURS = 48;
export const FREIGHT_RETRY_INTERVAL_MS = 3600000; // 1 hour

// Find a verified TEST carrier, optionally excluding previously declined carriers.
// This is NOT real FMCSA/insurance verification — it is a TEST compliance gate.
export async function findVerifiedCarrier(svc, excludeCarrierIds = []) {
  const carriers = await svc.entities.CarrierProfile.filter({ verification_status: "verified" }, "business_name", 50);
  const exclude = new Set(excludeCarrierIds);
  return (carriers || []).find((c) => !exclude.has(c.id)) || null;
}

// Get carrier IDs that have declined freight for this order (decline history).
export async function getDeclinedCarrierIds(svc, orderId) {
  const quotes = await svc.entities.FreightQuote.filter({ order_id: orderId, status: "declined" });
  return (quotes || []).map((q) => q.carrier_id).filter(Boolean);
}

// Resolve all open freight_assignment_failed exceptions for an order.
// A recovered freight failure must NOT continue blocking automatic order completion.
export async function resolveFreightExceptions(svc, orderId, reason) {
  const excs = await svc.entities.SystemException.filter({ order_id: orderId, exception_type: "freight_assignment_failed" }, "-created_date", 20);
  let resolved = 0;
  for (const ex of (excs || [])) {
    if (ex.status === "RESOLVED" || ex.status === "CLOSED") continue;
    await svc.entities.SystemException.update(ex.id, {
      status: "RESOLVED", requires_admin: false,
      resolved_at: new Date().toISOString(), resolved_by: "system",
      resolution: reason || "Verified carrier assigned automatically.",
    });
    resolved++;
  }
  return resolved;
}

// Auto-assign freight for a third_party_carrier order.
// Called after the seller reaches ready_for_pickup.
// Steps:
//   1. Find the checkout FreightQuote (status "selected" or "quoted")
//   2. Find a verified TEST carrier (excluding declined carriers for this order)
//   3. Associate the FreightQuote with the carrier (set carrier_id, carrier_owner_id, status "assigned")
//   4. Update Shipment with carrier_id, carrier_owner_id, freight_quote_id
//   5. Update the carrier delivery payable party_id in the allocation ledger
//   6. Notify carrier, vendor, buyer (via notifySafely — never rolls back)
//   7. Resolve any open freight_assignment_failed exceptions
// On failure: raise WARNING/AUTO_RETRYING exception (NOT immediate admin escalation)
export async function autoAssignFreight(svc, order, cq, shipment) {
  if (order?.commerce_mode !== "test") throw new Error("The internal freight simulator is restricted to approved TEST orders.");
  if (!shipment) throw new Error("Shipment required for freight assignment");
  if (order.fulfillment_method !== "third_party_carrier") return { skipped: true };

  // Idempotency: if shipment already has carrier_id and freight_quote_id, skip
  if (shipment.carrier_id && shipment.freight_quote_id) {
    const existing = await svc.entities.FreightQuote.get(shipment.freight_quote_id);
    if (existing && existing.status === "assigned") return { freightQuote: existing, alreadyAssigned: true };
  }

  // Find declined carriers for this order — don't re-assign the same carrier
  const declinedCarrierIds = await getDeclinedCarrierIds(svc, order.id);

  // Find a verified carrier (excluding declined)
  const carrier = await findVerifiedCarrier(svc, declinedCarrierIds);
  if (!carrier) {
    // First failure: WARNING, AUTO_RETRYING — NOT immediate admin escalation
    await raiseExceptionOnce(svc, {
      severity: "WARNING",
      exception_type: "freight_assignment_failed",
      order_id: order.id, shipment_id: shipment.id,
      buyer_id: order.buyer_id, vendor_id: order.vendor_id,
      reason: "No verified TEST carrier available for " + order.order_number,
      recommended_action: "System will retry automatically. Verify a carrier in admin if retries exhaust.",
      requires_admin: false,
      status: "AUTO_RETRYING",
      retry_count: 0, max_retries: 3,
      next_retry_at: new Date(Date.now() + FREIGHT_RETRY_INTERVAL_MS).toISOString(),
    });
    throw new Error("No verified TEST carrier available");
  }

  // Find the checkout FreightQuote (created at checkout time, status "selected" or "quoted")
  let freightQuote = null;
  let checkoutQuotes = await svc.entities.FreightQuote.filter({ checkout_quote_id: cq.id, status: "selected" });
  if (!checkoutQuotes || !checkoutQuotes.length) {
    checkoutQuotes = await svc.entities.FreightQuote.filter({ checkout_quote_id: cq.id, status: "quoted" });
  }
  if (checkoutQuotes && checkoutQuotes.length) {
    freightQuote = checkoutQuotes[0];
    // Associate the selected FreightQuote with the assigned carrier
    // buyer_freight_charge_cents stays LOCKED — never altered
    await svc.entities.FreightQuote.update(freightQuote.id, {
      order_id: order.id,
      carrier_id: carrier.id,
      carrier_owner_id: carrier.owner_id,
      status: "assigned",
    });
    freightQuote = await svc.entities.FreightQuote.get(freightQuote.id);
  } else {
    // No checkout FreightQuote found — create one (backward compat for existing orders)
    const freight = calculateTestFreightQuote(cq.delivery_amount_cents || 0, shipment.equipment_requirement);
    const quoteRef = genFreightQuoteReference();
    const expiresAt = new Date(Date.now() + FREIGHT_QUOTE_TTL_HOURS * 3600000).toISOString();
    freightQuote = await svc.entities.FreightQuote.create({
      order_id: order.id, checkout_quote_id: cq.id, commerce_mode: order.commerce_mode,
      carrier_id: carrier.id, carrier_owner_id: carrier.owner_id,
      buyer_id: order.buyer_id, vendor_owner_id: order.vendor_owner_id,
      provider: TEST_FREIGHT_PROVIDER, quote_reference: quoteRef,
      linehaul_cents: freight.linehaul_cents, fuel_surcharge_cents: freight.fuel_surcharge_cents,
      accessorial_cents: freight.accessorial_cents, carrier_pay_cents: freight.carrier_pay_cents,
      buyer_freight_charge_cents: freight.buyer_freight_charge_cents,
      equipment_type: freight.equipment_type,
      pickup_window: shipment.pickup_window || null, delivery_window: shipment.delivery_window || null,
      estimated_transit_days: 2, expires_at: expiresAt, status: "assigned",
    });
  }

  // Update Shipment with carrier assignment + freight quote reference + carrier_owner_id for RLS
  await svc.entities.Shipment.update(shipment.id, {
    carrier_id: carrier.id,
    carrier_owner_id: carrier.owner_id,
    freight_quote_id: freightQuote.id,
    delivery_price_cents: freightQuote.buyer_freight_charge_cents,
    equipment_requirement: freightQuote.equipment_type,
  });

  // Update the carrier delivery payable in the allocation ledger with the carrier_id
  try { await updateCarrierPayablePartyId(svc, order.id, carrier.id); } catch { /* best-effort */ }

  // Resolve any open freight_assignment_failed exceptions — recovery succeeded
  await resolveFreightExceptions(svc, order.id, "Verified carrier assigned automatically.");

  // Notify carrier, vendor, buyer — via notifySafely (never rolls back)
  await notifySafely(svc, {
    user_id: carrier.owner_id, type: "new_order", eventType: "freight_assigned",
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

// Reassign freight after carrier decline. Releases the declined carrier assignment,
// finds a different verified carrier, and creates a new assignment.
// Preserves decline history via the declined FreightQuote. Does NOT assign the same
// declined carrier again for the same shipment during the immediate reassignment cycle.
export async function reassignFreight(svc, order, cq, shipment, declinedCarrierId) {
  // Mark current FreightQuote as declined (preserve decline history)
  if (shipment.freight_quote_id) {
    try { await svc.entities.FreightQuote.update(shipment.freight_quote_id, { status: "declined" }); } catch {}
  }
  // Release carrier assignment from Shipment and place it into an exception state
  // until a replacement carrier is secured.
  await svc.entities.Shipment.update(shipment.id, {
    carrier_id: null, carrier_owner_id: null, freight_quote_id: null,
  });
  try {
    await updateShipmentStatus(svc, shipment.id, "exception", { type: "system", description: "Carrier declined — awaiting reassignment" });
  } catch { /* shipment may already be in an exception-compatible state */ }
  // Try to assign a new carrier (autoAssignFreight excludes declined carriers).
  const result = await autoAssignFreight(svc, order, cq, await svc.entities.Shipment.get(shipment.id));
  await updateShipmentStatus(svc, shipment.id, "assigned", { type: "system", description: "Replacement carrier assigned" });
  return result;
}

// Retry freight assignment for orders stuck at ready_for_pickup with third_party_carrier
// that have a shipment but no carrier. Also handles legacy delivery_assigned orders.
// Called by runTransactionMaintenance.
// Uses WARNING/AUTO_RETRYING lifecycle — only escalates to ACTION_REQUIRED after max_retries.
export async function retryFreightAssignment(svc) {
  let assigned = 0, failed = 0, escalated = 0;
  const now = new Date();

  // Find orders at ready_for_pickup with third_party_carrier that need freight assignment
  const readyOrders = await svc.entities.Order.filter({ order_status: "ready_for_pickup" }, "-created_date", 200);
  for (const order of (readyOrders || [])) {
    if (order.commerce_mode !== "test" || order.fulfillment_method !== "third_party_carrier") continue;
    const shipments = await svc.entities.Shipment.filter({ order_id: order.id });
    const shipment = (shipments || [])[0];
    if (!shipment) continue;
    if (shipment.carrier_id && shipment.freight_quote_id) continue; // already assigned

    const cq = order.checkout_quote_id ? await svc.entities.CheckoutQuote.get(order.checkout_quote_id) : null;
    if (!cq) continue;

    // Respect the retry schedule. A transient failure should not exhaust all retries
    // simply because maintenance runs frequently.
    const existingExceptions = await svc.entities.SystemException.filter({ order_id: order.id, exception_type: "freight_assignment_failed" }, "-created_date", 20);
    const activeException = (existingExceptions || []).find((x) => x.status !== "RESOLVED" && x.status !== "CLOSED");
    if (activeException?.status === "AUTO_RETRYING" && activeException.next_retry_at && now < new Date(activeException.next_retry_at)) continue;

    try {
      await autoAssignFreight(svc, order, cq, shipment);
      // Success — transition to delivery_assigned
      await transitionOrder(svc, order.id, "delivery_assigned", { type: "system", description: "Freight assigned automatically" });
      await updateShipmentStatus(svc, shipment.id, "assigned", { type: "system", description: "Freight assigned automatically" });
      assigned++;
    } catch (e) {
      failed++;
      // Increment retry count or escalate
      const excs = await svc.entities.SystemException.filter({ order_id: order.id, exception_type: "freight_assignment_failed" });
      const exc = (excs || []).find((x) => x.status !== "RESOLVED" && x.status !== "CLOSED");
      if (exc) {
        const newRetryCount = (exc.retry_count || 0) + 1;
        if (newRetryCount >= (exc.max_retries || 3)) {
          // Escalate to admin only after max retries exhausted
          await svc.entities.SystemException.update(exc.id, {
            severity: "ACTION_REQUIRED", status: "ADMIN_REVIEW", requires_admin: true,
            retry_count: newRetryCount,
            reason: "Freight assignment failed after " + newRetryCount + " retries for " + order.order_number,
            recommended_action: "Verify a carrier in admin, then re-run transaction maintenance.",
          });
          escalated++;
        } else {
          await svc.entities.SystemException.update(exc.id, {
            retry_count: newRetryCount,
            next_retry_at: new Date(now.getTime() + FREIGHT_RETRY_INTERVAL_MS).toISOString(),
          });
        }
      }
    }
  }

  // Also handle delivery_assigned orders whose carrier assignment was released
  // (for example after a carrier decline). Use the SAME retry/escalation lifecycle.
  const assignedOrders = await svc.entities.Order.filter({ order_status: "delivery_assigned" }, "-created_date", 100);
  for (const order of (assignedOrders || [])) {
    if (order.commerce_mode !== "test" || order.fulfillment_method !== "third_party_carrier") continue;
    const shipments = await svc.entities.Shipment.filter({ order_id: order.id });
    const shipment = (shipments || [])[0];
    if (!shipment || (shipment.carrier_id && shipment.freight_quote_id)) continue;
    const cq = order.checkout_quote_id ? await svc.entities.CheckoutQuote.get(order.checkout_quote_id) : null;
    if (!cq) continue;

    const existingExceptions = await svc.entities.SystemException.filter({ order_id: order.id, exception_type: "freight_assignment_failed" }, "-created_date", 20);
    const activeException = (existingExceptions || []).find((x) => x.status !== "RESOLVED" && x.status !== "CLOSED");
    if (activeException?.status === "AUTO_RETRYING" && activeException.next_retry_at && now < new Date(activeException.next_retry_at)) continue;

    try {
      await autoAssignFreight(svc, order, cq, shipment);
      await updateShipmentStatus(svc, shipment.id, "assigned", { type: "system", description: "Replacement freight assigned automatically" });
      assigned++;
    } catch {
      failed++;
      const excs = await svc.entities.SystemException.filter({ order_id: order.id, exception_type: "freight_assignment_failed" }, "-created_date", 20);
      const exc = (excs || []).find((x) => x.status !== "RESOLVED" && x.status !== "CLOSED");
      if (exc) {
        const newRetryCount = (exc.retry_count || 0) + 1;
        if (newRetryCount >= (exc.max_retries || 3)) {
          await svc.entities.SystemException.update(exc.id, {
            severity: "ACTION_REQUIRED", status: "ADMIN_REVIEW", requires_admin: true,
            retry_count: newRetryCount,
            reason: "Freight reassignment failed after " + newRetryCount + " retries for " + order.order_number,
            recommended_action: "Verify another carrier in admin, then re-run transaction maintenance.",
          });
          escalated++;
        } else {
          await svc.entities.SystemException.update(exc.id, {
            retry_count: newRetryCount,
            next_retry_at: new Date(now.getTime() + FREIGHT_RETRY_INTERVAL_MS).toISOString(),
          });
        }
      }
    }
  }

  return { assigned, failed, escalated };
}