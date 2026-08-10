// TreEbay authoritative transaction engine — shared by all backend functions.
// All monetary amounts are integer CENTS (minor units) for decimal safety.
// The browser never computes authoritative totals; it only displays values from a CheckoutQuote.

import { genOrderNumber } from "./marketplace.ts";

export const TEST_TAX_RATE = 0.0825; // 8.25% placeholder — TEST / ESTIMATED MODE, not production.
export const RESERVATION_TTL_MINUTES = 30;
export const VENDOR_CONFIRM_HOURS = 24;

export function toCents(dollars) {
  return Math.round((dollars || 0) * 100);
}
export function fromCents(cents) {
  return Math.round(cents || 0) / 100;
}

// ---- Marketplace fee ----
export async function getActiveFeeRule(svc) {
  try {
    const rules = await svc.entities.MarketplaceFeeRule.filter({ active: true }, "-effective_date", 10);
    if (rules && rules.length) return rules[0];
  } catch {}
  return { rule_name: "dev_default", percentage_fee: 4, flat_fee_cents: 0, minimum_fee_cents: 500, maximum_fee_cents: 0 };
}

export function calculateMarketplaceFeeCents(merchandiseCents, rule) {
  const pct = (rule.percentage_fee || 0) / 100;
  let fee = Math.round(merchandiseCents * pct) + (rule.flat_fee_cents || 0);
  if (rule.minimum_fee_cents && fee < rule.minimum_fee_cents) fee = rule.minimum_fee_cents;
  if (rule.maximum_fee_cents && fee > rule.maximum_fee_cents) fee = rule.maximum_fee_cents;
  return fee;
}

// ---- TEST tax ----
export function calculateTestTaxCents(taxableCents) {
  const rate = TEST_TAX_RATE;
  return { taxCents: Math.round(taxableCents * rate), rate, provider: "trebay_test", status: "test_estimated" };
}

// ---- Delivery options ----
export function calculateDeliveryOptionsCents(product) {
  const options = [];
  if (!product || product.pickup_eligible !== false) {
    options.push({ provider_type: "buyer_pickup", delivery_price_cents: 0, service_type: "Customer Pickup", estimated_delivery_days: 0 });
  }
  if (!product || product.delivery_eligible !== false) {
    options.push({ provider_type: "vendor_delivery", delivery_price_cents: 50000, service_type: "Vendor Delivery", estimated_delivery_days: 3 });
  }
  options.push({ provider_type: "third_party_carrier", delivery_price_cents: 90000, service_type: "Third Party Carrier", estimated_delivery_days: 2 });
  return options;
}

// ---- Bulk pricing ----
export function unitPriceCentsForQty(product, qty) {
  const baseCents = toCents(product.unit_price || 0);
  if (!product.bulk_price_tiers || !product.bulk_price_tiers.length) return baseCents;
  let best = baseCents;
  for (const tier of product.bulk_price_tiers) {
    if (tier.min_qty && qty >= tier.min_qty) {
      if (tier.request_quote) return null;
      if (tier.unit_price != null) {
        const t = toCents(tier.unit_price);
        if (t < best) best = t;
      }
    }
  }
  return best;
}

// ---- Checkout assembly ----
// deliveryMethod may be omitted — delivery options are generated and the buyer
// selects one later via selectDeliveryOption. Total excludes delivery until selected.
export async function assembleCheckout(svc, p) {
  const feeRule = await getActiveFeeRule(svc);
  const feeCents = calculateMarketplaceFeeCents(p.merchandise_cents, feeRule);
  const deliveryOptions = calculateDeliveryOptionsCents(p.product || { pickup_eligible: true, delivery_eligible: true });
  const selected = p.deliveryMethod ? deliveryOptions.find((o) => o.provider_type === p.deliveryMethod) : null;
  const deliveryCents = selected ? selected.delivery_price_cents : 0;
  const deliveryMethod = selected ? selected.provider_type : null;
  const taxableCents = p.merchandise_cents;
  const tax = calculateTestTaxCents(taxableCents);
  const totalCents = p.merchandise_cents + deliveryCents + tax.taxCents + feeCents;
  const expiresAt = new Date(Date.now() + RESERVATION_TTL_MINUTES * 60000).toISOString();
  const dest = p.destination || {};
  const quote = await svc.entities.CheckoutQuote.create({
    buyer_id: p.buyer_id, vendor_id: p.vendor_id, vendor_owner_id: p.vendor_owner_id,
    source_type: p.source_type, product_id: p.product_id || null, quote_id: p.quote_id || null, rfq_id: p.rfq_id || null,
    items: p.items, merchandise_subtotal_cents: p.merchandise_cents, bulk_discount_cents: 0,
    delivery_amount_cents: deliveryCents, taxable_amount_cents: taxableCents, tax_amount_cents: tax.taxCents,
    marketplace_fee_cents: feeCents, other_fees_cents: 0, total_amount_cents: totalCents,
    currency: "USD", delivery_method: deliveryMethod,
    tax_status: tax.status, pricing_status: "draft",
    destination_name: dest.name || null, destination_street: dest.street || null,
    destination_city: dest.city || null, destination_state: dest.state || null, destination_zip: dest.zip || null,
    delivery_instructions: dest.instructions || null, contact_name: dest.contact_name || null, contact_phone: dest.contact_phone || null,
    expiration_at: expiresAt,
  });
  await svc.entities.TaxCalculation.create({
    checkout_quote_id: quote.id, provider: tax.provider, jurisdiction: dest.state || null,
    taxable_amount_cents: taxableCents, tax_amount_cents: tax.taxCents, rate: tax.rate, status: tax.status,
  });
  const destLabel = [dest.city, dest.state].filter(Boolean).join(", ");
  for (const opt of deliveryOptions) {
    await svc.entities.DeliveryOption.create({
      checkout_quote_id: quote.id, buyer_id: p.buyer_id, provider_type: opt.provider_type, service_type: opt.service_type,
      delivery_price_cents: opt.delivery_price_cents, status: "available",
      expires_at: expiresAt, delivery_location: destLabel,
    });
  }
  return { checkoutQuote: quote, deliveryOptions };
}

// Recalculate a CheckoutQuote after delivery option selection + delivery address.
export async function applyDeliveryOption(svc, quoteId, optionId, address) {
  const quote = await svc.entities.CheckoutQuote.get(quoteId);
  if (!quote) throw new Error("Checkout quote not found");
  if (quote.expiration_at && new Date(quote.expiration_at) < new Date()) throw new Error("This checkout quote has expired. Please recalculate.");
  const option = await svc.entities.DeliveryOption.get(optionId);
  if (!option || option.checkout_quote_id !== quoteId) throw new Error("Invalid delivery option for this quote.");
  if (option.status === "expired" || option.status === "unavailable") throw new Error("This delivery option is no longer available.");
  const feeCents = quote.marketplace_fee_cents;
  const deliveryCents = option.delivery_price_cents;
  const taxableCents = quote.merchandise_subtotal_cents;
  const tax = calculateTestTaxCents(taxableCents);
  const totalCents = quote.merchandise_subtotal_cents + deliveryCents + tax.taxCents + feeCents;
  const updated = await svc.entities.CheckoutQuote.update(quoteId, {
    delivery_method: option.provider_type,
    delivery_amount_cents: deliveryCents,
    tax_amount_cents: tax.taxCents,
    total_amount_cents: totalCents,
    destination_name: address?.name || quote.destination_name || null,
    destination_street: address?.street || quote.destination_street || null,
    delivery_instructions: address?.instructions || quote.delivery_instructions || null,
    contact_name: address?.contact_name || quote.contact_name || null,
    contact_phone: address?.contact_phone || quote.contact_phone || null,
  });
  await svc.entities.DeliveryOption.update(optionId, { status: "selected" });
  const others = await svc.entities.DeliveryOption.filter({ checkout_quote_id: quoteId, status: "available" });
  for (const o of (others || [])) await svc.entities.DeliveryOption.update(o.id, { status: "expired" });
  return updated;
}

// ---- Inventory semantics ----
// reserve: available -> reserved (at order creation)
// commit: reserved -> sold (at vendor confirmation)
// release: reserved -> available (cancel/expiry before vendor confirmation)
// reverseCommitted: sold -> available (cancel after vendor confirmation)
export async function reserveInventory(svc, productId, qty) {
  const p = await svc.entities.Product.get(productId);
  if (!p) throw new Error("Product not found");
  const available = p.quantity_available || 0;
  const reserved = p.quantity_reserved || 0;
  if (available < qty) throw new Error("Insufficient inventory: " + available + " available, " + qty + " requested");
  await svc.entities.Product.update(productId, {
    quantity_available: Math.max(0, available - qty),
    quantity_reserved: reserved + qty,
  });
}

export async function releaseInventory(svc, productId, qty) {
  const p = await svc.entities.Product.get(productId);
  if (!p) return;
  const reserved = Math.max(0, (p.quantity_reserved || 0) - qty);
  const available = (p.quantity_available || 0) + qty;
  const patch = { quantity_reserved: reserved, quantity_available: available };
  if (reserved === 0 && (p.quantity_sold || 0) === 0 && available > 0) patch.listing_status = "active";
  await svc.entities.Product.update(productId, patch);
}

export async function commitInventory(svc, productId, qty) {
  const p = await svc.entities.Product.get(productId);
  if (!p) return;
  const reserved = Math.max(0, (p.quantity_reserved || 0) - qty);
  const sold = (p.quantity_sold || 0) + qty;
  const patch = { quantity_reserved: reserved, quantity_sold: sold };
  if ((p.quantity_available || 0) === 0 && reserved === 0) patch.listing_status = "sold_out";
  await svc.entities.Product.update(productId, patch);
}

export async function reverseCommittedInventory(svc, productId, qty) {
  const p = await svc.entities.Product.get(productId);
  if (!p) return;
  const sold = Math.max(0, (p.quantity_sold || 0) - qty);
  const available = (p.quantity_available || 0) + qty;
  const patch = { quantity_sold: sold, quantity_available: available };
  if (available > 0) patch.listing_status = "active";
  await svc.entities.Product.update(productId, patch);
}

// ---- Audit trail ----
export async function recordOrderEvent(svc, e) {
  return svc.entities.OrderEvent.create({
    order_id: e.order_id, event_type: e.event_type,
    previous_status: e.previous_status || null, new_status: e.new_status || null,
    actor_type: e.actor_type, actor_id: e.actor_id || null,
    description: e.description || "", metadata: e.metadata || {},
  });
}

// ---- Ledger accounting ----
// CONVENTION: debit = money received FROM a party; credit = money payable TO a party.
// Buyer payment: debit buyer (money in).
// Vendor merchandise payable = merchandise_subtotal - marketplace_fee (credit vendor).
// Vendor delivery: credit vendor (when vendor_delivery selected).
// Carrier delivery: credit carrier (when third_party_carrier selected).
// Tax: credit tax_authority. Marketplace fee: credit marketplace.
// Payout: debit vendor payable (settling).
// Reconciliation: buyer debit = sum of all credits = total_amount_cents.
// party_id for vendor = VendorProfile.id (vendor_id), consistent everywhere.
export async function createLedgerEntry(svc, e) {
  return svc.entities.TransactionLedgerEntry.create({
    order_id: e.order_id, entry_type: e.entry_type,
    party_type: e.party_type || null, party_id: e.party_id || null,
    description: e.description || "", debit_cents: e.debit_cents || 0, credit_cents: e.credit_cents || 0,
    currency: "USD", payment_reference: e.payment_reference || null,
    created_at: new Date().toISOString(),
  });
}

export async function createOrderLedger(svc, order, cq) {
  const vendorMerchPayable = cq.merchandise_subtotal_cents - cq.marketplace_fee_cents;
  await createLedgerEntry(svc, { order_id: order.id, entry_type: "merchandise", party_type: "vendor", party_id: cq.vendor_id, description: "Vendor merchandise payable", credit_cents: vendorMerchPayable });
  if (cq.delivery_amount_cents > 0) {
    if (cq.delivery_method === "vendor_delivery") {
      await createLedgerEntry(svc, { order_id: order.id, entry_type: "delivery", party_type: "vendor", party_id: cq.vendor_id, description: "Vendor delivery payable", credit_cents: cq.delivery_amount_cents });
    } else if (cq.delivery_method === "third_party_carrier") {
      await createLedgerEntry(svc, { order_id: order.id, entry_type: "delivery", party_type: "carrier", description: "Carrier delivery payable", credit_cents: cq.delivery_amount_cents });
    }
  }
  await createLedgerEntry(svc, { order_id: order.id, entry_type: "tax", party_type: "tax_authority", description: "Sales tax (TEST/ESTIMATED)", credit_cents: cq.tax_amount_cents });
  await createLedgerEntry(svc, { order_id: order.id, entry_type: "marketplace_fee", party_type: "marketplace", description: "TreEbay marketplace fee", credit_cents: cq.marketplace_fee_cents });
}

export async function createPaymentLedgerEntry(svc, order, paymentRef) {
  await createLedgerEntry(svc, { order_id: order.id, entry_type: "payment", party_type: "buyer", party_id: order.buyer_id, description: "Buyer payment (TEST MODE)", debit_cents: order.total_cents, payment_reference: paymentRef });
}

export async function createSettlementLedgerEntry(svc, order, cq) {
  const vendorPayable = (cq.merchandise_subtotal_cents - cq.marketplace_fee_cents) + (cq.delivery_method === "vendor_delivery" ? cq.delivery_amount_cents : 0);
  await createLedgerEntry(svc, { order_id: order.id, entry_type: "payout", party_type: "vendor", party_id: cq.vendor_id, description: "Vendor settlement payout (TEST)", debit_cents: vendorPayable });
}

// ---- Exception engine ----
export async function raiseException(svc, e) {
  return svc.entities.SystemException.create({
    severity: e.severity || "WARNING", exception_type: e.exception_type,
    order_id: e.order_id || null, shipment_id: e.shipment_id || null,
    payment_id: e.payment_id || null, buyer_id: e.buyer_id || null,
    vendor_id: e.vendor_id || null, carrier_id: e.carrier_id || null,
    reason: e.reason || "", technical_details_private: e.technical_details_private || "",
    recommended_action: e.recommended_action || "",
    retry_count: e.retry_count || 0, max_retries: e.max_retries || 3, next_retry_at: e.next_retry_at || null,
    requires_admin: !!e.requires_admin, status: e.requires_admin ? "ADMIN_REVIEW" : (e.status || "OPEN"),
    created_at: new Date().toISOString(), resolved_at: null, resolved_by: null,
  });
}

export async function resolveException(svc, id, reason, resolvedBy) {
  return svc.entities.SystemException.update(id, {
    status: "RESOLVED", resolved_at: new Date().toISOString(),
    resolved_by: resolvedBy || "system", resolution: reason || "auto-resolved",
  });
}

export async function resolveExceptionsForOrder(svc, orderId, reason) {
  const excs = await svc.entities.SystemException.filter({ order_id: orderId }, "-created_date", 50);
  for (const ex of (excs || [])) {
    if (ex.status !== "RESOLVED" && ex.status !== "CLOSED") {
      await resolveException(svc, ex.id, reason, "system");
    }
  }
}

// Auto-resolve vendor confirmation timeout/reminder exceptions when vendor confirms.
export async function resolveVendorTimeoutException(svc, orderId) {
  const excs = await svc.entities.SystemException.filter({ order_id: orderId }, "-created_date", 50);
  for (const ex of (excs || [])) {
    if (ex.exception_type === "vendor_confirmation_timeout" || ex.exception_type === "vendor_confirmation_reminder") {
      if (ex.status !== "RESOLVED" && ex.status !== "CLOSED") {
        await resolveException(svc, ex.id, "Vendor confirmed order — exception auto-resolved", "system");
      }
    }
  }
}

// ---- Shipment helpers ----
export async function createShipment(svc, order, cq) {
  const vendor = await svc.entities.VendorProfile.get(order.vendor_id);
  const pickupLocation = vendor ? [vendor.address, vendor.city, vendor.state, vendor.zip_code].filter(Boolean).join(", ") : "";
  const deliveryLocation = [cq.destination_name, cq.destination_street, cq.destination_city, cq.destination_state, cq.destination_zip].filter(Boolean).join(", ");
  const shipment = await svc.entities.Shipment.create({
    order_id: order.id, buyer_id: order.buyer_id, vendor_owner_id: order.vendor_owner_id,
    pickup_location: pickupLocation, delivery_location: deliveryLocation,
    delivery_method: cq.delivery_method, delivery_price_cents: cq.delivery_amount_cents,
    shipment_status: "pending",
    cargo_description: (cq.items || []).map((i) => i.line_name + " x" + i.quantity).join("; "),
    delivery_notes: cq.delivery_instructions || "",
    receiver_name: cq.contact_name || "",
  });
  await recordShipmentEvent(svc, { shipment_id: shipment.id, event_type: "shipment_created", new_status: "pending", actor_type: "system", description: "Shipment record created" });
  return shipment;
}

export async function recordShipmentEvent(svc, e) {
  return svc.entities.ShipmentEvent.create({
    shipment_id: e.shipment_id, event_type: e.event_type,
    previous_status: e.previous_status || null, new_status: e.new_status || null,
    actor_type: e.actor_type, actor_id: e.actor_id || null,
    description: e.description || "", metadata: e.metadata || {},
  });
}

export async function updateShipmentStatus(svc, shipmentId, newStatus, actor) {
  const shipment = await svc.entities.Shipment.get(shipmentId);
  if (!shipment) return null;
  const prev = shipment.shipment_status;
  if (prev === newStatus) return shipment;
  await svc.entities.Shipment.update(shipmentId, { shipment_status: newStatus });
  await recordShipmentEvent(svc, { shipment_id: shipmentId, event_type: "status_transition", previous_status: prev, new_status: newStatus, actor_type: actor.type, actor_id: actor.id, description: actor.description || (prev + " -> " + newStatus) });
  return await svc.entities.Shipment.get(shipmentId);
}

// ---- RFQ finalization (only on order creation) ----
export async function finalizeAcceptedRFQ(svc, cq) {
  if (!cq.rfq_id || !cq.quote_id) return;
  const quotes = await svc.entities.VendorQuote.filter({ rfq_id: cq.rfq_id });
  for (const q of (quotes || [])) {
    if (q.id === cq.quote_id) {
      await svc.entities.VendorQuote.update(q.id, { status: "accepted" });
    } else if (q.status === "submitted" || q.status === "revised" || q.status === "pending_acceptance") {
      await svc.entities.VendorQuote.update(q.id, { status: "declined" });
    }
  }
  await svc.entities.RFQ.update(cq.rfq_id, { status: "awarded" });
}

// Rollback RFQ when checkout expires without an order (accepted-quote path).
export async function rollbackExpiredRFQCheckout(svc, cq) {
  if (!cq.rfq_id || !cq.quote_id) return;
  const quote = await svc.entities.VendorQuote.get(cq.quote_id);
  if (quote && quote.status === "pending_acceptance") {
    await svc.entities.VendorQuote.update(cq.quote_id, { status: "submitted" });
  }
  const rfq = await svc.entities.RFQ.get(cq.rfq_id);
  if (rfq && rfq.status === "checkout_pending") {
    await svc.entities.RFQ.update(cq.rfq_id, { status: "quotes_received" });
  }
  await svc.entities.CheckoutQuote.update(cq.id, { pricing_status: "expired" });
}

// ---- Order creation from CheckoutQuote (shared authoritative path) ----
export async function createOrderFromQuote(svc, checkoutQuoteId, user) {
  const cq = await svc.entities.CheckoutQuote.get(checkoutQuoteId);
  if (!cq) throw new Error("Checkout quote not found");
  if (cq.buyer_id !== user.id) throw new Error("This checkout quote belongs to another buyer.");
  // Idempotency: if this quote already produced an order, return it.
  if (cq.order_id) {
    const existing = await svc.entities.Order.get(cq.order_id);
    if (existing) return { order: existing, checkoutQuote: cq };
  }
  if (cq.expiration_at && new Date(cq.expiration_at) < new Date()) throw new Error("This checkout quote has expired. Please recalculate.");
  if (!cq.delivery_method) throw new Error("Please select a delivery option before placing your order.");

  // Reserve inventory for direct listings (accepted quotes rely on vendor-offered stock).
  if (cq.source_type === "direct_listing" && cq.product_id) {
    const qty = (cq.items || []).reduce((s, i) => s + (i.quantity || 0), 0);
    await reserveInventory(svc, cq.product_id, qty);
  }

  const vendor = await svc.entities.VendorProfile.get(cq.vendor_id);
  const orderNumber = genOrderNumber();
  const order = await svc.entities.Order.create({
    order_number: orderNumber, buyer_id: cq.buyer_id, vendor_id: cq.vendor_id, vendor_owner_id: cq.vendor_owner_id,
    vendor_name: vendor?.business_name || "", quote_id: cq.quote_id || "", rfq_id: cq.rfq_id || "", checkout_quote_id: cq.id,
    items: (cq.items || []).map((i) => ({ line_name: i.line_name, quantity: i.quantity, unit_price: fromCents(i.unit_price_cents), subtotal: fromCents(i.subtotal_cents) })),
    subtotal: fromCents(cq.merchandise_subtotal_cents), delivery_charges: fromCents(cq.delivery_amount_cents),
    taxes: fromCents(cq.tax_amount_cents), platform_fees: fromCents(cq.marketplace_fee_cents),
    total: fromCents(cq.total_amount_cents), total_cents: cq.total_amount_cents,
    fulfillment_method: cq.delivery_method,
    destination_name: cq.destination_name, destination_street: cq.destination_street,
    destination_city: cq.destination_city, destination_state: cq.destination_state, destination_zip: cq.destination_zip,
    destination_instructions: cq.delivery_instructions, contact_name: cq.contact_name, contact_phone: cq.contact_phone,
    payment_status: "pending", order_status: "awaiting_payment",
    reservation_expires_at: new Date(Date.now() + RESERVATION_TTL_MINUTES * 60000).toISOString(),
  });
  await svc.entities.CheckoutQuote.update(cq.id, { pricing_status: "consumed", order_id: order.id });
  await recordOrderEvent(svc, { order_id: order.id, event_type: "order_created", new_status: "awaiting_payment", actor_type: "buyer", actor_id: user.id, description: "Order created from checkout quote " + cq.id });
  await createOrderLedger(svc, order, cq);
  // Finalize RFQ/quote only now that an authoritative Order exists.
  if (cq.source_type === "accepted_quote") await finalizeAcceptedRFQ(svc, cq);
  await svc.entities.Notification.create({ user_id: cq.vendor_owner_id, type: "new_order", title: "New order received", body: orderNumber, reference_type: "order", reference_id: order.id, read: false });
  return { order, checkoutQuote: cq };
}

// ---- Order state machine: ONE source of truth ----
export const ORDER_TRANSITIONS = {
  draft: ["pricing_confirmed", "cancelled"],
  pricing_confirmed: ["awaiting_payment", "cancelled"],
  awaiting_payment: ["payment_confirmed", "payment_failed", "cancelled"],
  payment_failed: ["awaiting_payment", "cancelled"],
  payment_confirmed: ["inventory_reserved", "fulfillment_exception"],
  inventory_reserved: ["vendor_confirmed", "fulfillment_exception", "cancelled"],
  vendor_confirmed: ["preparing"],
  preparing: ["ready_for_pickup"],
  ready_for_pickup: ["delivery_assigned", "picked_up"],
  delivery_assigned: ["picked_up", "delivery_exception"],
  picked_up: ["in_transit"],
  in_transit: ["delivered", "delivery_exception"],
  delivered: ["completed"],
  completed: ["settlement_pending"],
  settlement_pending: ["settled"],
  fulfillment_exception: ["vendor_confirmed", "cancelled"],
  delivery_exception: ["in_transit", "delivered", "cancelled"],
  disputed: ["settled", "cancelled"],
  refund_pending: ["refunded", "cancelled"],
  refunded: [],
  settled: [],
  cancelled: [],
};

export function canTransition(from, to) {
  const allowed = ORDER_TRANSITIONS[from] || [];
  return allowed.includes(to);
}

export async function transitionOrder(svc, orderId, newStatus, actor) {
  const order = await svc.entities.Order.get(orderId);
  if (!order) throw new Error("Order not found");
  const prev = order.order_status;
  if (prev === newStatus) return order;
  if (!canTransition(prev, newStatus)) throw new Error("Invalid transition: " + prev + " -> " + newStatus);
  await svc.entities.Order.update(orderId, { order_status: newStatus });
  await recordOrderEvent(svc, {
    order_id: orderId, event_type: "status_transition",
    previous_status: prev, new_status: newStatus,
    actor_type: actor.type, actor_id: actor.id,
    description: actor.description || ("Order " + prev + " -> " + newStatus),
    metadata: actor.metadata || {},
  });
  return await svc.entities.Order.get(orderId);
}