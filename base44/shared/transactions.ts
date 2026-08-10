// TreEbay authoritative transaction engine — shared by all backend functions.
// All monetary amounts are integer CENTS (minor units) for decimal safety.
// The browser never computes authoritative totals; it only displays values from a CheckoutQuote.

export const TEST_TAX_RATE = 0.0825; // 8.25% placeholder — TEST / ESTIMATED MODE, not production.
export const RESERVATION_TTL_MINUTES = 30;
export const VENDOR_CONFIRM_HOURS = 24;

export function toCents(dollars) {
  return Math.round((dollars || 0) * 100);
}
export function fromCents(cents) {
  return Math.round(cents || 0) / 100;
}

// Active marketplace fee rule (admin-configured). Falls back to dev default.
export async function getActiveFeeRule(svc) {
  try {
    const rules = await svc.entities.MarketplaceFeeRule.filter({ active: true }, "-effective_date", 10);
    if (rules && rules.length) return rules[0];
  } catch {}
  return { rule_name: "dev_default", percentage_fee: 4, flat_fee_cents: 0, minimum_fee_cents: 500, maximum_fee_cents: 0 };
}

// All fee config values are CENTS. percentage_fee is a percent number (e.g. 4 = 4%).
export function calculateMarketplaceFeeCents(merchandiseCents, rule) {
  const pct = (rule.percentage_fee || 0) / 100;
  let fee = Math.round(merchandiseCents * pct) + (rule.flat_fee_cents || 0);
  if (rule.minimum_fee_cents && fee < rule.minimum_fee_cents) fee = rule.minimum_fee_cents;
  if (rule.maximum_fee_cents && fee > rule.maximum_fee_cents) fee = rule.maximum_fee_cents;
  return fee;
}

// TEST / ESTIMATED tax — clearly labeled, not production. Flat placeholder rate.
export function calculateTestTaxCents(taxableCents) {
  const rate = TEST_TAX_RATE;
  return { taxCents: Math.round(taxableCents * rate), rate, provider: "trebay_test", status: "test_estimated" };
}

// Delivery options — buyer_pickup ($0), vendor_delivery (estimate), third_party (estimate).
// Estimates are placeholders until a real carrier quoting provider is connected.
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

// Bulk pricing — best tier unit price (cents) for a quantity. Returns null if a tier requires a quote.
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

// ---- Checkout assembly (shared by direct-listing and accepted-quote paths) ----
export async function assembleCheckout(svc, p) {
  const feeRule = await getActiveFeeRule(svc);
  const feeCents = calculateMarketplaceFeeCents(p.merchandise_cents, feeRule);
  const deliveryOptions = calculateDeliveryOptionsCents(p.product || { pickup_eligible: true, delivery_eligible: true });
  const selected = deliveryOptions.find((o) => o.provider_type === p.delivery_method) || deliveryOptions[0];
  const deliveryCents = selected ? selected.delivery_price_cents : 0;
  const taxableCents = p.merchandise_cents; // tax on merchandise only (TEST mode)
  const tax = calculateTestTaxCents(taxableCents);
  const totalCents = p.merchandise_cents + deliveryCents + tax.taxCents + feeCents;
  const expiresAt = new Date(Date.now() + RESERVATION_TTL_MINUTES * 60000).toISOString();
  const quote = await svc.entities.CheckoutQuote.create({
    buyer_id: p.buyer_id, vendor_id: p.vendor_id, vendor_owner_id: p.vendor_owner_id,
    source_type: p.source_type, product_id: p.product_id || null, quote_id: p.quote_id || null, rfq_id: p.rfq_id || null,
    items: p.items, merchandise_subtotal_cents: p.merchandise_cents, bulk_discount_cents: 0,
    delivery_amount_cents: deliveryCents, taxable_amount_cents: taxableCents, tax_amount_cents: tax.taxCents,
    marketplace_fee_cents: feeCents, other_fees_cents: 0, total_amount_cents: totalCents,
    currency: "USD", delivery_method: selected ? selected.provider_type : "buyer_pickup",
    tax_status: tax.status, pricing_status: "draft",
    destination_city: (p.destination && p.destination.city) || null,
    destination_state: (p.destination && p.destination.state) || null,
    destination_zip: (p.destination && p.destination.zip) || null,
    expiration_at: expiresAt,
  });
  await svc.entities.TaxCalculation.create({
    checkout_quote_id: quote.id, provider: tax.provider,
    jurisdiction: (p.destination && p.destination.state) || null,
    taxable_amount_cents: taxableCents, tax_amount_cents: tax.taxCents, rate: tax.rate,
    status: tax.status,
  });
  const destLabel = [p.destination && p.destination.city, p.destination && p.destination.state].filter(Boolean).join(", ");
  for (const opt of deliveryOptions) {
    await svc.entities.DeliveryOption.create({
      checkout_quote_id: quote.id, provider_type: opt.provider_type, service_type: opt.service_type,
      delivery_price_cents: opt.delivery_price_cents, status: "available",
      expires_at: expiresAt, delivery_location: destLabel,
    });
  }
  return { checkoutQuote: quote, deliveryOptions };
}

// ---- Inventory reservation (prevents overselling) ----
// NOTE: Base44 does not expose atomic compare-and-set / transactions across entities.
// These helpers do a read-then-write which is safe for typical low-concurrency nursery orders
// but can race under true concurrent checkout of the same last unit. Documented limitation.
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
  const available = p.quantity_available || 0;
  const reserved = Math.max(0, (p.quantity_reserved || 0) - qty);
  await svc.entities.Product.update(productId, {
    quantity_available: available + qty,
    quantity_reserved: reserved,
  });
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

// ---- Audit trail ----
export async function recordOrderEvent(svc, e) {
  return svc.entities.OrderEvent.create({
    order_id: e.order_id, event_type: e.event_type,
    previous_status: e.previous_status || null, new_status: e.new_status || null,
    actor_type: e.actor_type, actor_id: e.actor_id || null,
    description: e.description || "", metadata: e.metadata || {},
  });
}

export async function createLedgerEntry(svc, e) {
  return svc.entities.TransactionLedgerEntry.create({
    order_id: e.order_id, entry_type: e.entry_type,
    party_type: e.party_type || null, party_id: e.party_id || null,
    description: e.description || "", debit_cents: e.debit_cents || 0, credit_cents: e.credit_cents || 0,
    currency: "USD", payment_reference: e.payment_reference || null,
    created_at: new Date().toISOString(),
  });
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
    retry_count: 0, max_retries: e.max_retries || 3, next_retry_at: null,
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