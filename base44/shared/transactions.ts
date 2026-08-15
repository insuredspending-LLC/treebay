// TreEbay authoritative transaction engine — shared by all backend functions.
// All monetary amounts are integer CENTS (minor units) for decimal safety.
// The browser never computes authoritative totals; it only displays values from a CheckoutQuote.

import { genOrderNumber } from "./marketplace.ts";
import { reserveForCheckout, checkoutQuantity, RESERVATION_TTL_MINUTES } from "./inventory.ts";
import { notifySafely } from "./notifications.ts";

export const TEST_TAX_RATE = 0.0825; // 8.25% placeholder — TEST / ESTIMATED MODE, not production.
export const VENDOR_CONFIRM_HOURS = 24;
export { RESERVATION_TTL_MINUTES };

// ---- Fee payer model ----
// TEST MODE: the BUYER pays the displayed TreEbay marketplace fee.
// Buyer total = merchandise + delivery + tax + marketplace fee.
// The vendor therefore receives the FULL merchandise subtotal — the fee is never
// deducted a second time from vendor proceeds.
export const FEE_PAYER_BUYER = "buyer";
export const FEE_PAYER_VENDOR = "vendor";
export const FEE_PAYER_SPLIT = "split";
export const DEFAULT_FEE_PAYER = FEE_PAYER_BUYER;

export function feePayerOf(rule) {
  return (rule && rule.fee_payer) || DEFAULT_FEE_PAYER;
}

export function toCents(dollars) {
  return Math.round((dollars || 0) * 100);
}
export function fromCents(cents) {
  return Math.round(cents || 0) / 100;
}

// ---- Marketplace fee ----
export async function getActiveFeeRule(svc) {
  const rules = await svc.entities.MarketplaceFeeRule.filter({ active: true }, "-effective_date", 10);
  if (rules && rules.length) return rules[0];
  return { rule_name: "dev_default", percentage_fee: 4, flat_fee_cents: 0, minimum_fee_cents: 0, maximum_fee_cents: 0, fee_payer: DEFAULT_FEE_PAYER };
}

export function calculateMarketplaceFeeCents(merchandiseCents, rule) {
  const pct = (rule.percentage_fee || 0) / 100;
  let fee = Math.round(merchandiseCents * pct) + (rule.flat_fee_cents || 0);
  if (rule.minimum_fee_cents && fee < rule.minimum_fee_cents) fee = rule.minimum_fee_cents;
  if (rule.maximum_fee_cents && fee > rule.maximum_fee_cents) fee = rule.maximum_fee_cents;
  return fee;
}

// How much of the fee the BUYER is charged on top of merchandise.
export function buyerFeePortionCents(feeCents, feePayer) {
  if (feePayer === FEE_PAYER_VENDOR) return 0;
  if (feePayer === FEE_PAYER_SPLIT) return Math.round(feeCents / 2);
  return feeCents;
}

// How much of the fee is withheld from VENDOR proceeds.
export function vendorFeePortionCents(feeCents, feePayer) {
  return feeCents - buyerFeePortionCents(feeCents, feePayer);
}

// ---- TEST tax ----
export function calculateTestTaxCents(taxableCents) {
  const rate = TEST_TAX_RATE;
  return { taxCents: Math.round(taxableCents * rate), rate, provider: "trebay_test", status: "test_estimated" };
}

// Deterministic TEST freight quote breakdown. buyer_freight_charge_cents is LOCKED to
// what the buyer paid at checkout. carrier_pay_cents is a SEPARATE authoritative value
// (equals buyer charge in TEST mode — no marketplace freight markup yet).
export function genFreightQuoteReference() {
  return "FQ-TEST-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
}
export function calculateTestFreightQuote(buyerFreightChargeCents, equipmentType) {
  const carrierPay = buyerFreightChargeCents || 0;
  const linehaul = Math.round(carrierPay * 0.80);
  const fuel = Math.round(carrierPay * 0.12);
  const accessorial = carrierPay - linehaul - fuel;
  return {
    linehaul_cents: linehaul, fuel_surcharge_cents: fuel, accessorial_cents: accessorial,
    carrier_pay_cents: carrierPay, buyer_freight_charge_cents: carrierPay,
    equipment_type: equipmentType || "flatbed",
  };
}

// ---- Delivery options ----
export function calculateDeliveryOptionsCents(product, vendorDeliveryCents, vendorDeliveryAvailable) {
  const options = [];
  if (!product || product.pickup_eligible !== false) {
    options.push({ provider_type: "buyer_pickup", delivery_price_cents: 0, service_type: "Customer Pickup", estimated_delivery_days: 0 });
  }
  // Vendor delivery: for accepted quotes, vendorDeliveryAvailable controls whether the
  // vendor offered delivery. For direct listings, product.delivery_eligible controls it.
  // If the vendor did not offer delivery, DO NOT create a vendor_delivery option.
  const vendorDeliveryOk = vendorDeliveryAvailable === false ? false : (!product || product.delivery_eligible !== false);
  if (vendorDeliveryOk) {
    options.push({ provider_type: "vendor_delivery", delivery_price_cents: vendorDeliveryCents ?? 50000, service_type: "Vendor Delivery", estimated_delivery_days: 3 });
  }
  options.push({ provider_type: "third_party_carrier", delivery_price_cents: 90000, service_type: "TEST FREIGHT — Third Party Carrier", estimated_delivery_days: 2 });
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
  const feePayer = feePayerOf(feeRule);
  const feeCents = calculateMarketplaceFeeCents(p.merchandise_cents, feeRule);
  const buyerFeeCents = buyerFeePortionCents(feeCents, feePayer);
  const deliveryOptions = calculateDeliveryOptionsCents(p.product || { pickup_eligible: true, delivery_eligible: true }, p.vendor_delivery_cents, p.vendor_delivery_available);
  const selected = p.deliveryMethod ? deliveryOptions.find((o) => o.provider_type === p.deliveryMethod) : null;
  const deliveryCents = selected ? selected.delivery_price_cents : 0;
  const deliveryMethod = selected ? selected.provider_type : null;
  const taxableCents = p.merchandise_cents;
  const tax = calculateTestTaxCents(taxableCents);
  const totalCents = p.merchandise_cents + deliveryCents + tax.taxCents + buyerFeeCents;
  const expiresAt = new Date(Date.now() + RESERVATION_TTL_MINUTES * 60000).toISOString();
  const dest = p.destination || {};
  const quote = await svc.entities.CheckoutQuote.create({
    buyer_id: p.buyer_id, vendor_id: p.vendor_id, vendor_owner_id: p.vendor_owner_id,
    source_type: p.source_type, product_id: p.product_id || null, quote_id: p.quote_id || null, rfq_id: p.rfq_id || null,
    items: p.items, merchandise_subtotal_cents: p.merchandise_cents, bulk_discount_cents: 0,
    delivery_amount_cents: deliveryCents, taxable_amount_cents: taxableCents, tax_amount_cents: tax.taxCents,
    marketplace_fee_cents: feeCents, fee_payer: feePayer, other_fees_cents: 0, total_amount_cents: totalCents,
    currency: "USD", delivery_method: deliveryMethod,
    tax_status: tax.status, pricing_status: "draft", processing_status: "available", inventory_status: "available",
    destination_name: dest.name || null, destination_street: dest.street || null,
    destination_city: dest.city || null, destination_state: dest.state || null, destination_zip: dest.zip || null,
    delivery_instructions: dest.instructions || null, contact_name: dest.contact_name || null, contact_phone: dest.contact_phone || null,
    expiration_at: expiresAt,
  });
  // Complete TEST tax snapshot — all authoritative fields populated.
  const taxableDeliveryCents = 0; // TEST policy: delivery is not taxable
  const totalTaxableCents = taxableCents + taxableDeliveryCents;
  await svc.entities.TaxCalculation.create({
    checkout_quote_id: quote.id, provider: tax.provider, jurisdiction: dest.state || null,
    taxable_amount_cents: taxableCents, taxable_delivery_amount_cents: taxableDeliveryCents,
    total_taxable_amount_cents: totalTaxableCents, tax_amount_cents: tax.taxCents, rate: tax.rate,
    status: tax.status, collection_party: "trebay_test", remittance_responsibility: "trebay_test",
  });
  const destLabel = [dest.city, dest.state].filter(Boolean).join(", ");
  // Return the PERSISTED options (with ids) — the buyer selects one by id.
  const createdOptions = [];
  for (const opt of deliveryOptions) {
    let freightQuoteId = null;
    // Create a TEST FreightQuote at checkout time for third-party carrier (no carrier assigned yet).
    // The buyer's freight price is locked here and never changes after payment.
    if (opt.provider_type === "third_party_carrier") {
      const freight = calculateTestFreightQuote(opt.delivery_price_cents, "flatbed");
      const fq = await svc.entities.FreightQuote.create({
        order_id: null, checkout_quote_id: quote.id, carrier_id: null, carrier_owner_id: null,
        buyer_id: p.buyer_id, vendor_owner_id: p.vendor_owner_id,
        provider: "trebay_test_freight", quote_reference: genFreightQuoteReference(),
        linehaul_cents: freight.linehaul_cents, fuel_surcharge_cents: freight.fuel_surcharge_cents,
        accessorial_cents: freight.accessorial_cents, carrier_pay_cents: freight.carrier_pay_cents,
        buyer_freight_charge_cents: freight.buyer_freight_charge_cents, equipment_type: freight.equipment_type,
        estimated_transit_days: opt.estimated_delivery_days || 2,
        expires_at: new Date(Date.now() + 48 * 3600000).toISOString(), status: "quoted",
      });
      freightQuoteId = fq.id;
    }
    const created = await svc.entities.DeliveryOption.create({
      checkout_quote_id: quote.id, buyer_id: p.buyer_id, provider_type: opt.provider_type, service_type: opt.service_type,
      delivery_price_cents: opt.delivery_price_cents, freight_quote_id: freightQuoteId, status: "available",
      expires_at: expiresAt, delivery_location: destLabel,
    });
    createdOptions.push({ ...created, estimated_delivery_days: opt.estimated_delivery_days });
  }
  return { checkoutQuote: quote, deliveryOptions: createdOptions };
}

// Recalculate a CheckoutQuote after delivery option selection + delivery address.
// The buyer MAY switch delivery options freely until the quote is consumed or expires:
// the previously selected option returns to `available`, the new one becomes `selected`.
// Nothing is marked `expired` here — expiry belongs to quote expiry/consumption.
export async function applyDeliveryOption(svc, quoteId, optionId, address) {
  const quote = await svc.entities.CheckoutQuote.get(quoteId);
  if (!quote) throw new Error("Checkout quote not found");
  if (quote.pricing_status === "consumed") throw new Error("This checkout has already produced an order.");
  if (quote.expiration_at && new Date(quote.expiration_at) < new Date()) throw new Error("This checkout quote has expired. Please recalculate.");
  const option = await svc.entities.DeliveryOption.get(optionId);
  if (!option || option.checkout_quote_id !== quoteId) throw new Error("Invalid delivery option for this quote.");
  if (option.status === "expired" || option.status === "unavailable") throw new Error("This delivery option is no longer available.");

  const feePayer = quote.fee_payer || DEFAULT_FEE_PAYER;
  const buyerFeeCents = buyerFeePortionCents(quote.marketplace_fee_cents || 0, feePayer);
  const deliveryCents = option.delivery_price_cents;
  const taxableCents = quote.merchandise_subtotal_cents;
  const tax = calculateTestTaxCents(taxableCents);
  const totalCents = quote.merchandise_subtotal_cents + deliveryCents + tax.taxCents + buyerFeeCents;

  // Lock the submitted destination onto the quote. The submitted checkout address
  // is authoritative — including city/state/zip, which must NOT silently fall back
  // to the buyer profile address the quote was seeded with.
  const a = address || {};
  const isPickup = option.provider_type === "buyer_pickup";
  const patch = {
    delivery_method: option.provider_type,
    delivery_amount_cents: deliveryCents,
    tax_amount_cents: tax.taxCents,
    total_amount_cents: totalCents,
  };
  if (!isPickup) {
    patch.destination_name = a.name || a.contact_name || quote.destination_name || null;
    patch.destination_street = a.street || quote.destination_street || null;
    patch.destination_city = a.city || quote.destination_city || null;
    patch.destination_state = a.state || quote.destination_state || null;
    patch.destination_zip = a.zip || quote.destination_zip || null;
  } else {
    patch.destination_name = a.name || a.contact_name || quote.destination_name || null;
  }
  patch.delivery_instructions = a.instructions || quote.delivery_instructions || null;
  patch.contact_name = a.contact_name || a.name || quote.contact_name || null;
  patch.contact_phone = a.contact_phone || quote.contact_phone || null;

  const updated = await svc.entities.CheckoutQuote.update(quoteId, patch);

  // Update the authoritative TaxCalculation snapshot when delivery address/state changes.
  const taxRows = await svc.entities.TaxCalculation.filter({ checkout_quote_id: quoteId });
  const taxCalc = (taxRows || [])[0];
  if (taxCalc) {
    const newTaxableDeliveryCents = 0; // TEST policy: delivery is not taxable
    const newTotalTaxableCents = quote.merchandise_subtotal_cents + newTaxableDeliveryCents;
    const newTax = calculateTestTaxCents(quote.merchandise_subtotal_cents);
    await svc.entities.TaxCalculation.update(taxCalc.id, {
      taxable_delivery_amount_cents: newTaxableDeliveryCents,
      total_taxable_amount_cents: newTotalTaxableCents,
      tax_amount_cents: newTax.taxCents,
      jurisdiction: a.state || taxCalc.jurisdiction || null,
    });
  }

  // Selection is switchable: release any previously selected option, select this one.
  const siblings = await svc.entities.DeliveryOption.filter({ checkout_quote_id: quoteId });
  for (const o of (siblings || [])) {
    if (o.id === optionId) continue;
    if (o.status === "selected") {
      await svc.entities.DeliveryOption.update(o.id, { status: "available" });
      if (o.freight_quote_id) {
        const previousFreight = await svc.entities.FreightQuote.get(o.freight_quote_id);
        if (previousFreight && previousFreight.status === "selected") {
          await svc.entities.FreightQuote.update(o.freight_quote_id, { status: "quoted" });
        }
      }
    }
  }
  await svc.entities.DeliveryOption.update(optionId, { status: "selected" });
  // Mark the checkout FreightQuote as "selected" when the buyer selects the third-party option.
  if (option.freight_quote_id) {
    await svc.entities.FreightQuote.update(option.freight_quote_id, { status: "selected" });
  }
  return updated;
}

// Close out delivery options once the quote is consumed or expired.
export async function closeDeliveryOptions(svc, quoteId) {
  const options = await svc.entities.DeliveryOption.filter({ checkout_quote_id: quoteId });
  for (const o of (options || [])) {
    if (o.status === "available") await svc.entities.DeliveryOption.update(o.id, { status: "expired" });
  }
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
// Entries are grouped by `transaction_id` so each financial event is written EXACTLY ONCE:
//   alloc:<orderId>    buyer payment debit + vendor/carrier/tax/marketplace credits
//   settle:<orderId>   vendor payout debit (clears the payable)
//   refund:<orderId>   reversal entries (never edits or deletes history)
// Reconciliation within the `alloc` group:
//   buyer debit = vendor credit + carrier credit + tax credit + marketplace credit
export function allocationGroup(orderId) { return "alloc:" + orderId; }
export function settlementGroup(orderId) { return "settle:" + orderId; }
export function refundGroup(orderId) { return "refund:" + orderId; }

export async function ledgerGroupExists(svc, orderId, transactionId) {
  const rows = await svc.entities.TransactionLedgerEntry.filter({ order_id: orderId, transaction_id: transactionId });
  return !!(rows && rows.length);
}

// Per-entry idempotency: each expected ledger entry has a unique durable key within
// its transaction group. Retries create only the missing entries — a partially-written
// group is completed, not skipped.
export async function ledgerEntryExists(svc, orderId, transactionId, entryKey) {
  const rows = await svc.entities.TransactionLedgerEntry.filter({ order_id: orderId, transaction_id: transactionId, entry_key: entryKey });
  return !!(rows && rows.length);
}

export async function createLedgerEntry(svc, e) {
  if (e.entry_key && await ledgerEntryExists(svc, e.order_id, e.transaction_id, e.entry_key)) {
    return null; // already created — per-entry idempotency
  }
  return svc.entities.TransactionLedgerEntry.create({
    order_id: e.order_id, transaction_id: e.transaction_id || null, entry_key: e.entry_key || null, entry_type: e.entry_type,
    party_type: e.party_type || null, party_id: e.party_id || null,
    description: e.description || "", debit_cents: e.debit_cents || 0, credit_cents: e.credit_cents || 0,
    currency: "USD", payment_reference: e.payment_reference || null,
    created_at: new Date().toISOString(),
  });
}

// The ONE financial allocation, written only after payment is confirmed.
// An unpaid or abandoned order never carries vendor/carrier/tax payables.
// Per-entry idempotency: each entry has a unique durable key; retries create only
// missing entries, so a partially-written allocation is completed — not skipped.
export async function createAllocationLedger(svc, order, cq, paymentRef) {
  const group = allocationGroup(order.id);

  const feePayer = cq.fee_payer || DEFAULT_FEE_PAYER;
  const feeCents = cq.marketplace_fee_cents || 0;
  const vendorFeeCents = vendorFeePortionCents(feeCents, feePayer);
  // Vendor receives the full merchandise subtotal minus only the portion of the
  // fee the VENDOR is contractually responsible for (zero in buyer-pays TEST mode).
  const vendorMerchPayable = (cq.merchandise_subtotal_cents || 0) - vendorFeeCents;

  // Money in.
  await createLedgerEntry(svc, {
    order_id: order.id, transaction_id: group, entry_key: "payment", entry_type: "payment", party_type: "buyer", party_id: order.buyer_id,
    description: "Buyer payment (TEST MODE)", debit_cents: order.total_cents || cq.total_amount_cents, payment_reference: paymentRef || null,
  });
  // Money out (payables).
  await createLedgerEntry(svc, {
    order_id: order.id, transaction_id: group, entry_key: "merchandise", entry_type: "merchandise", party_type: "vendor", party_id: cq.vendor_id,
    description: "Vendor merchandise payable", credit_cents: vendorMerchPayable, payment_reference: paymentRef || null,
  });
  if ((cq.delivery_amount_cents || 0) > 0) {
    if (cq.delivery_method === "vendor_delivery") {
      await createLedgerEntry(svc, {
        order_id: order.id, transaction_id: group, entry_key: "delivery", entry_type: "delivery", party_type: "vendor", party_id: cq.vendor_id,
        description: "Vendor delivery payable", credit_cents: cq.delivery_amount_cents, payment_reference: paymentRef || null,
      });
    } else if (cq.delivery_method === "third_party_carrier") {
      let carrierId = null;
      const shipRows = await svc.entities.Shipment.filter({ order_id: order.id });
      if (shipRows && shipRows.length) carrierId = shipRows[0].carrier_id || null;
      await createLedgerEntry(svc, {
        order_id: order.id, transaction_id: group, entry_key: "delivery", entry_type: "delivery", party_type: "carrier", party_id: carrierId,
        description: "Carrier delivery payable", credit_cents: cq.delivery_amount_cents, payment_reference: paymentRef || null,
      });
    }
  }
  await createLedgerEntry(svc, {
    order_id: order.id, transaction_id: group, entry_key: "tax", entry_type: "tax", party_type: "tax_authority",
    description: "Sales tax (TEST/ESTIMATED)", credit_cents: cq.tax_amount_cents || 0, payment_reference: paymentRef || null,
  });
  await createLedgerEntry(svc, {
    order_id: order.id, transaction_id: group, entry_key: "marketplace_fee", entry_type: "marketplace_fee", party_type: "marketplace",
    description: "TreEbay marketplace fee", credit_cents: feeCents, payment_reference: paymentRef || null,
  });
  return { created: true };
}

export async function verifyAllocationForSettlement(svc, order, cq) {
  const totalCents = order.total_cents || Math.round((order.total || 0) * 100);
  const payments = await svc.entities.PaymentRecord.filter({ order_id: order.id });
  const paid = (payments || []).find((p) => p.status === "paid");
  if (!paid) throw new Error("Financial reconciliation: no paid PaymentRecord exists.");
  if ((paid.amount_cents || Math.round((paid.amount || 0) * 100)) !== totalCents) {
    throw new Error("Financial reconciliation: paid amount does not equal Order.total_cents.");
  }

  // Ensure all expected allocation entries exist (creates only missing ones via per-entry idempotency).
  await createAllocationLedger(svc, order, cq, paid.transaction_ref || paid.provider_payment_id);
  const group = allocationGroup(order.id);
  const rows = await svc.entities.TransactionLedgerEntry.filter({ order_id: order.id, transaction_id: group });
  const debitTotal = (rows || []).reduce((sum, row) => sum + (row.debit_cents || 0), 0);
  const creditTotal = (rows || []).reduce((sum, row) => sum + (row.credit_cents || 0), 0);
  if (debitTotal !== totalCents || creditTotal !== totalCents) {
    throw new Error("Financial reconciliation: allocation debits " + debitTotal + ", credits " + creditTotal + ", expected " + totalCents + ".");
  }
  return { paid, debitTotal, creditTotal };
}

// Verify refund reversal entries reconcile before refund finalization.
// Refund debits (reversals) and credits (buyer repayment) must each equal Order.total_cents.
export async function verifyRefundReconciliation(svc, order, cq) {
  const totalCents = order.total_cents || Math.round((order.total || 0) * 100);
  const group = refundGroup(order.id);
  const rows = await svc.entities.TransactionLedgerEntry.filter({ order_id: order.id, transaction_id: group });
  if (!(rows || []).length) {
    throw new Error("Refund reconciliation: no refund ledger entries found.");
  }
  const debitTotal = (rows || []).reduce((sum, row) => sum + (row.debit_cents || 0), 0);
  const creditTotal = (rows || []).reduce((sum, row) => sum + (row.credit_cents || 0), 0);
  if (debitTotal !== totalCents || creditTotal !== totalCents) {
    throw new Error("Refund reconciliation: reversal debits " + debitTotal + ", credits " + creditTotal + ", expected " + totalCents + ".");
  }
  return { debitTotal, creditTotal };
}

// Net amount owed to the vendor at settlement.
export function vendorPayableCents(cq) {
  const feePayer = cq.fee_payer || DEFAULT_FEE_PAYER;
  const vendorFee = vendorFeePortionCents(cq.marketplace_fee_cents || 0, feePayer);
  const delivery = cq.delivery_method === "vendor_delivery" ? (cq.delivery_amount_cents || 0) : 0;
  return (cq.merchandise_subtotal_cents || 0) - vendorFee + delivery;
}

export async function createSettlementLedgerEntry(svc, order, cq) {
  const group = settlementGroup(order.id);
  // Vendor payout (existing key "payout" preserves idempotency for already-settled orders)
  await createLedgerEntry(svc, {
    order_id: order.id, transaction_id: group, entry_key: "payout", entry_type: "payout", party_type: "vendor", party_id: cq.vendor_id,
    description: "Vendor settlement payout (TEST)", debit_cents: vendorPayableCents(cq),
  });
  // Carrier payout — only for third_party_carrier. Uses FreightQuote.carrier_pay_cents
  // (NOT cq.delivery_amount_cents) so buyer freight charge and carrier pay stay distinct.
  // Idempotent per-entry: retries create only the missing entry.
  if (cq.delivery_method === "third_party_carrier" && (cq.delivery_amount_cents || 0) > 0) {
    const shipRows = await svc.entities.Shipment.filter({ order_id: order.id });
    const shipment = (shipRows || [])[0];
    if (!shipment?.carrier_id) throw new Error("Financial reconciliation: shipment has no carrier assigned.");
    if (!shipment?.freight_quote_id) throw new Error("Financial reconciliation: shipment has no freight quote.");
    const fq = await svc.entities.FreightQuote.get(shipment.freight_quote_id);
    if (!fq) throw new Error("Financial reconciliation: freight quote not found.");
    if (fq.carrier_id !== shipment.carrier_id) throw new Error("Financial reconciliation: freight quote carrier mismatch.");
    await createLedgerEntry(svc, {
      order_id: order.id, transaction_id: group, entry_key: "carrier_payout", entry_type: "carrier_payable", party_type: "carrier", party_id: shipment.carrier_id,
      description: "Carrier freight payout (TEST)", debit_cents: fq.carrier_pay_cents || 0,
    });
  }
  return { created: true };
}

// Verify settlement reconciliation before marking an order as settled.
// For vendor payout: expected = vendorPayableCents(cq)
// For third-party freight: expected carrier payout = FreightQuote.carrier_pay_cents
// If a required entry is missing: idempotently create ONLY the missing correct entry.
// If an existing entry has wrong amount/party/carrier: raise CRITICAL, do NOT overwrite.
export async function verifySettlementReconciliation(svc, order, cq) {
  const group = settlementGroup(order.id);
  const rows = await svc.entities.TransactionLedgerEntry.filter({ order_id: order.id, transaction_id: group });

  // --- Vendor payout reconciliation ---
  const expectedVendorPayout = vendorPayableCents(cq);
  const vendorEntry = (rows || []).find((e) => e.entry_key === "payout" && e.party_type === "vendor");
  if (!vendorEntry) {
    await createLedgerEntry(svc, {
      order_id: order.id, transaction_id: group, entry_key: "payout", entry_type: "payout", party_type: "vendor", party_id: cq.vendor_id,
      description: "Vendor settlement payout (reconciliation)", debit_cents: expectedVendorPayout,
    });
  } else if (vendorEntry.debit_cents !== expectedVendorPayout || vendorEntry.party_id !== cq.vendor_id) {
    throw new Error("Financial reconciliation: vendor payout entry has wrong amount (" + vendorEntry.debit_cents + " vs " + expectedVendorPayout + ") or party (" + vendorEntry.party_id + " vs " + cq.vendor_id + ").");
  }

  // --- Carrier payout reconciliation (only for third_party_carrier) ---
  if (cq.delivery_method === "third_party_carrier" && (cq.delivery_amount_cents || 0) > 0) {
    const shipRows = await svc.entities.Shipment.filter({ order_id: order.id });
    const shipment = (shipRows || [])[0];
    if (!shipment) throw new Error("Financial reconciliation: no shipment for third-party carrier order.");
    if (!shipment.carrier_id) throw new Error("Financial reconciliation: shipment has no carrier assigned.");
    if (!shipment.freight_quote_id) throw new Error("Financial reconciliation: shipment has no freight quote.");

    const freightQuote = await svc.entities.FreightQuote.get(shipment.freight_quote_id);
    if (!freightQuote) throw new Error("Financial reconciliation: freight quote not found.");
    if (freightQuote.carrier_id !== shipment.carrier_id) throw new Error("Financial reconciliation: freight quote carrier mismatch.");

    const expectedCarrierPayout = freightQuote.carrier_pay_cents || 0;
    const carrierEntry = (rows || []).find((e) => e.entry_key === "carrier_payout" && e.party_type === "carrier");
    if (!carrierEntry) {
      await createLedgerEntry(svc, {
        order_id: order.id, transaction_id: group, entry_key: "carrier_payout", entry_type: "carrier_payable", party_type: "carrier", party_id: shipment.carrier_id,
        description: "Carrier freight payout (reconciliation)", debit_cents: expectedCarrierPayout,
      });
    } else if (carrierEntry.debit_cents !== expectedCarrierPayout || carrierEntry.party_id !== shipment.carrier_id) {
      throw new Error("Financial reconciliation: carrier payout entry has wrong amount (" + carrierEntry.debit_cents + " vs " + expectedCarrierPayout + ") or party (" + carrierEntry.party_id + " vs " + shipment.carrier_id + ").");
    }
  }

  return { reconciled: true };
}

// Update the carrier delivery payable party_id after freight assignment.
// At payment time no carrier is assigned yet, so the allocation entry has party_id=null.
// Called from autoAssignFreight once a carrier is assigned to the shipment.
export async function updateCarrierPayablePartyId(svc, orderId, carrierId) {
  const group = allocationGroup(orderId);
  const rows = await svc.entities.TransactionLedgerEntry.filter({ order_id: orderId, transaction_id: group, entry_key: "delivery", party_type: "carrier" });
  for (const row of (rows || [])) {
    // Carrier assignment happens after payment and may change if a carrier declines.
    // Keep the current carrier payable associated with the authoritative replacement carrier.
    if (row.party_id !== carrierId) await svc.entities.TransactionLedgerEntry.update(row.id, { party_id: carrierId });
  }
}

// Refunds NEVER edit or delete history — they add explicit reversal entries.
// Per-entry idempotency: each reversal entry has a unique durable key; retries create
// only missing entries, so an interrupted refund ledger is completed — not skipped.
export async function createRefundLedger(svc, order, cq, amountCents, reason) {
  const group = refundGroup(order.id);
  await createLedgerEntry(svc, {
    order_id: order.id, transaction_id: group, entry_key: "buyer_refund", entry_type: "refund", party_type: "buyer", party_id: order.buyer_id,
    description: "Refund to buyer (TEST) — " + (reason || "buyer refund"), credit_cents: amountCents,
  });
  if (cq) {
    // Reverse the payables that were allocated at payment.
    const feePayer = cq.fee_payer || DEFAULT_FEE_PAYER;
    const vendorFee = vendorFeePortionCents(cq.marketplace_fee_cents || 0, feePayer);
    await createLedgerEntry(svc, {
      order_id: order.id, transaction_id: group, entry_key: "vendor_merchandise_reversal", entry_type: "adjustment", party_type: "vendor", party_id: cq.vendor_id,
      description: "Reversal of vendor merchandise payable (refund)", debit_cents: (cq.merchandise_subtotal_cents || 0) - vendorFee,
    });
    if ((cq.delivery_amount_cents || 0) > 0) {
      await createLedgerEntry(svc, {
        order_id: order.id, transaction_id: group, entry_key: "delivery_reversal", entry_type: "adjustment",
        party_type: cq.delivery_method === "third_party_carrier" ? "carrier" : "vendor",
        party_id: cq.delivery_method === "third_party_carrier" ? null : cq.vendor_id,
        description: "Reversal of delivery payable (refund)", debit_cents: cq.delivery_amount_cents,
      });
    }
    await createLedgerEntry(svc, {
      order_id: order.id, transaction_id: group, entry_key: "tax_reversal", entry_type: "adjustment", party_type: "tax_authority",
      description: "Reversal of sales tax liability (refund)", debit_cents: cq.tax_amount_cents || 0,
    });
    await createLedgerEntry(svc, {
      order_id: order.id, transaction_id: group, entry_key: "marketplace_fee_reversal", entry_type: "adjustment", party_type: "marketplace",
      description: "Reversal of TreEbay marketplace fee (refund)", debit_cents: cq.marketplace_fee_cents || 0,
    });
  }
  return { created: true };
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

// Idempotent raise: don't stack duplicates of the same open exception type.
export async function raiseExceptionOnce(svc, e) {
  const existing = await svc.entities.SystemException.filter({ order_id: e.order_id, exception_type: e.exception_type }, "-created_date", 20);
  const open = (existing || []).find((x) => x.status !== "RESOLVED" && x.status !== "CLOSED");
  if (open) return open;
  return raiseException(svc, e);
}

export async function resolveException(svc, id, reason, resolvedBy) {
  return svc.entities.SystemException.update(id, {
    status: "RESOLVED", resolved_at: new Date().toISOString(),
    resolved_by: resolvedBy || "system", resolution: reason || "auto-resolved",
  });
}

// TARGETED resolution only. An unrelated ACTION_REQUIRED / CRITICAL exception is
// never closed as a side effect of some other step succeeding.
async function resolveExceptionTypes(svc, orderId, types, reason) {
  const excs = await svc.entities.SystemException.filter({ order_id: orderId }, "-created_date", 50);
  let resolved = 0;
  for (const ex of (excs || [])) {
    if (!types.includes(ex.exception_type)) continue;
    if (ex.status === "RESOLVED" || ex.status === "CLOSED") continue;
    await resolveException(svc, ex.id, reason, "system");
    resolved++;
  }
  return resolved;
}

export const PAYMENT_EXCEPTION_TYPES = ["payment_failed", "payment_timeout", "payment_declined"];
export const VENDOR_CONFIRMATION_EXCEPTION_TYPES = ["vendor_confirmation_reminder", "vendor_confirmation_timeout"];
export const DELIVERY_EXCEPTION_TYPES = ["delivery_delayed", "delivery_failed", "pickup_delayed", "delivery_exception"];
export const INVENTORY_EXCEPTION_TYPES = ["inventory_unavailable", "inventory_commit_failed"];

export async function resolvePaymentExceptions(svc, orderId, reason) {
  return resolveExceptionTypes(svc, orderId, PAYMENT_EXCEPTION_TYPES, reason || "Payment succeeded — payment exception resolved");
}
export async function resolveVendorConfirmationExceptions(svc, orderId, reason) {
  return resolveExceptionTypes(svc, orderId, VENDOR_CONFIRMATION_EXCEPTION_TYPES, reason || "Vendor confirmed — exception resolved");
}
export async function resolveDeliveryExceptions(svc, orderId, reason) {
  return resolveExceptionTypes(svc, orderId, DELIVERY_EXCEPTION_TYPES, reason || "Delivery recovered — exception resolved");
}
export async function resolveInventoryExceptions(svc, orderId, reason) {
  return resolveExceptionTypes(svc, orderId, INVENTORY_EXCEPTION_TYPES, reason || "Inventory secured — exception resolved");
}

export async function hasBlockingException(svc, orderId) {
  const excs = await svc.entities.SystemException.filter({ order_id: orderId }, "-created_date", 50);
  return (excs || []).some((e) =>
    e.status !== "RESOLVED" && e.status !== "CLOSED" &&
    (e.severity === "ACTION_REQUIRED" || e.severity === "CRITICAL"));
}

// ---- Shipment state machine: ONE transition table ----
export const SHIPMENT_TRANSITIONS = {
  pending: ["quoted", "assigned", "cancelled", "exception"],
  quoted: ["assigned", "cancelled", "exception"],
  assigned: ["pickup_scheduled", "picked_up", "pickup_delayed", "cancelled", "exception"],
  pickup_scheduled: ["picked_up", "pickup_delayed", "cancelled", "exception"],
  pickup_delayed: ["pickup_scheduled", "picked_up", "cancelled", "exception"],
  picked_up: ["in_transit", "delivery_delayed", "damaged", "exception"],
  in_transit: ["delivered", "delivery_delayed", "delivery_failed", "damaged", "exception"],
  delivery_delayed: ["in_transit", "delivered", "delivery_failed", "exception"],
  delivery_failed: ["in_transit", "cancelled", "exception"],
  damaged: ["exception", "cancelled", "confirmed"],
  delivered: ["confirmed", "damaged", "exception"],
  confirmed: [],
  cancelled: [],
  exception: ["assigned", "pickup_scheduled", "in_transit", "delivered", "cancelled"],
};

export function canTransitionShipment(from, to) {
  return (SHIPMENT_TRANSITIONS[from] || []).includes(to);
}

export async function createShipment(svc, order, cq) {
  const existing = await svc.entities.Shipment.filter({ order_id: order.id });
  if (existing && existing.length) return existing[0]; // idempotent
  const vendor = await svc.entities.VendorProfile.get(order.vendor_id);
  const pickupLocation = vendor ? [vendor.address, vendor.city, vendor.state, vendor.zip_code].filter(Boolean).join(", ") : "";
  // The Order carries the final LOCKED destination — use it, not a stale profile address.
  const deliveryLocation = [order.destination_name, order.destination_street, order.destination_city, order.destination_state, order.destination_zip].filter(Boolean).join(", ");
  const shipment = await svc.entities.Shipment.create({
    order_id: order.id, buyer_id: order.buyer_id, vendor_owner_id: order.vendor_owner_id,
    pickup_location: pickupLocation, delivery_location: deliveryLocation,
    delivery_method: order.fulfillment_method || cq?.delivery_method,
    delivery_price_cents: cq?.delivery_amount_cents || 0,
    shipment_status: "pending",
    cargo_description: ((cq?.items) || order.items || []).map((i) => i.line_name + " x" + i.quantity).join("; "),
    delivery_notes: order.destination_instructions || "",
    receiver_name: order.contact_name || order.destination_name || "",
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

// Validated shipment transition. Arbitrary jumps (pending -> delivered) are refused
// unless an explicit, audited admin override is supplied.
export async function updateShipmentStatus(svc, shipmentId, newStatus, actor) {
  const shipment = await svc.entities.Shipment.get(shipmentId);
  if (!shipment) return null;
  const prev = shipment.shipment_status;
  if (prev === newStatus) return shipment;
  const allowed = canTransitionShipment(prev, newStatus);
  if (!allowed && !actor.adminOverride) {
    throw new Error("Invalid shipment transition: " + prev + " -> " + newStatus);
  }
  await svc.entities.Shipment.update(shipmentId, { shipment_status: newStatus });
  await recordShipmentEvent(svc, {
    shipment_id: shipmentId, event_type: allowed ? "status_transition" : "admin_override_transition",
    previous_status: prev, new_status: newStatus,
    actor_type: actor.type, actor_id: actor.id,
    description: (allowed ? "" : "ADMIN OVERRIDE: ") + (actor.description || (prev + " -> " + newStatus)),
    metadata: allowed ? {} : { override: true, reason: actor.overrideReason || "" },
  });
  return await svc.entities.Shipment.get(shipmentId);
}

// Order status -> the shipment status it implies (null = leave shipment alone).
export function shipmentStatusForOrder(orderStatus) {
  const map = {
    delivery_assigned: "assigned",
    picked_up: "picked_up",
    in_transit: "in_transit",
    delivered: "delivered",
    completed: "confirmed",
  };
  return map[orderStatus] || null;
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
  await closeDeliveryOptions(svc, cq.id);
}

// ---- Seller trust ----
// Direct listings and RFQ-sourced orders follow the SAME seller-trust requirement.
export async function assertVendorSellable(svc, vendorId) {
  const vendor = await svc.entities.VendorProfile.get(vendorId);
  if (!vendor) throw new Error("Seller profile not found.");
  if (vendor.verification_status !== "verified") {
    throw new Error("This seller is not currently verified and cannot accept new orders.");
  }
  return vendor;
}

// ---- Order creation from CheckoutQuote (shared authoritative path) ----
export async function createOrderFromQuote(svc, checkoutQuoteId, user) {
  let cq = await svc.entities.CheckoutQuote.get(checkoutQuoteId);
  if (!cq) throw new Error("Checkout quote not found");
  if (cq.buyer_id !== user.id) throw new Error("This checkout quote belongs to another buyer.");
  if (cq.processing_status === "consumed" && cq.order_id) {
    const existing = await svc.entities.Order.get(cq.order_id);
    if (existing) return { order: existing, checkoutQuote: cq, existing: true };
  }
  if (cq.processing_status === "consuming") throw new Error("Checkout is processing. Please retry shortly.");
  if (cq.expiration_at && new Date(cq.expiration_at) < new Date()) throw new Error("This checkout quote has expired. Please recalculate.");
  if (!cq.delivery_method) throw new Error("Please select a delivery option before placing your order.");
  if (cq.delivery_method !== "buyer_pickup") {
    if (!cq.destination_street || !cq.destination_city || !cq.destination_state || !cq.destination_zip) {
      throw new Error("A complete delivery address is required before placing your order.");
    }
  }
  // Re-verify the seller before claiming the durable single-winner lock.
  const vendor = await assertVendorSellable(svc, cq.vendor_id);
  const lockResult = await svc.entities.CheckoutQuote.updateMany(
    { id: cq.id, processing_status: "available" },
    { $set: { processing_status: "consuming", processing_locked_at: new Date().toISOString() } },
  );
  const lockCount = typeof lockResult === "number" ? lockResult : Array.isArray(lockResult) ? lockResult.length : (lockResult?.updated ?? lockResult?.updated_count ?? lockResult?.modified_count ?? lockResult?.modifiedCount ?? lockResult?.count ?? 0);
  if (!lockCount) {
    cq = await svc.entities.CheckoutQuote.get(checkoutQuoteId);
    if (cq.processing_status === "consumed" && cq.order_id) {
      const existing = await svc.entities.Order.get(cq.order_id);
      if (existing) return { order: existing, checkoutQuote: cq, existing: true };
    }
    throw new Error("Checkout is processing. Please retry shortly.");
  }

  const orderNumber = genOrderNumber();
  const reservationExpiry = new Date(Date.now() + RESERVATION_TTL_MINUTES * 60000).toISOString();
  let order = null;
  try {
    order = await svc.entities.Order.create({
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
    reservation_expires_at: reservationExpiry,
  });

    // Persist the created order id while the quote remains consuming. Concurrent callers
    // still receive a safe processing response and can never create another Order.
    await svc.entities.CheckoutQuote.update(cq.id, { order_id: order.id });
    // Link the selected checkout FreightQuote to the durable Order. This preserves
    // decline history, carrier financial reporting, and later settlement traceability.
    if (cq.delivery_method === "third_party_carrier") {
      const deliveryOptions = await svc.entities.DeliveryOption.filter({ checkout_quote_id: cq.id, provider_type: "third_party_carrier" });
      const freightOption = (deliveryOptions || []).find((o) => o.status === "selected") || (deliveryOptions || [])[0];
      if (freightOption?.freight_quote_id) {
        const freightQuote = await svc.entities.FreightQuote.get(freightOption.freight_quote_id);
        if (freightQuote) {
          await svc.entities.FreightQuote.update(freightQuote.id, {
            order_id: order.id,
            status: freightQuote.status === "quoted" ? "selected" : freightQuote.status,
          });
        }
      }
    }
    if (cq.source_type === "direct_listing" && cq.product_id) {
      await reserveForCheckout(svc, order, cq, reservationExpiry);
    }
    await svc.entities.CheckoutQuote.update(cq.id, { pricing_status: "consumed", processing_status: "consumed", order_id: order.id });
  } catch (err) {
    if (!order) {
      await svc.entities.CheckoutQuote.updateMany(
        { id: cq.id, processing_status: "consuming" },
        { $set: { processing_status: "available", processing_locked_at: null } },
      );
    } else {
      await svc.entities.Order.update(order.id, { order_status: "cancelled" });
      await svc.entities.CheckoutQuote.update(cq.id, { pricing_status: "consumed", processing_status: "consumed", order_id: order.id });
      await recordOrderEvent(svc, { order_id: order.id, event_type: "order_cancelled", new_status: "cancelled", actor_type: "system", description: "Order creation failed after durable id assignment: " + err.message });
    }
    throw err;
  }
  await closeDeliveryOptions(svc, cq.id);
  await recordOrderEvent(svc, { order_id: order.id, event_type: "order_created", new_status: "awaiting_payment", actor_type: "buyer", actor_id: user.id, description: "Order created from checkout quote " + cq.id });
  // NOTE: no payable ledger here. The financial allocation is written only once
  // payment is confirmed — an unpaid order must never look like money was received.
  if (cq.source_type === "accepted_quote") await finalizeAcceptedRFQ(svc, cq);
  await notifySafely(svc, { user_id: cq.vendor_owner_id, type: "new_order", eventType: "order_created", title: "New order received", body: order.order_number, reference_type: "order", reference_id: order.id, order_id: order.id, buyer_id: order.buyer_id, vendor_id: order.vendor_id });
  return { order: await svc.entities.Order.get(order.id), checkoutQuote: await svc.entities.CheckoutQuote.get(cq.id) };
}

// ---- Order state machine: ONE source of truth ----
// Buyer pickup is simplified: ready_for_pickup -> picked_up -> delivered.
// Only the SYSTEM may move delivered -> completed (see runTransactionMaintenance).
export const ORDER_TRANSITIONS = {
  draft: ["pricing_confirmed", "cancelled"],
  pricing_confirmed: ["awaiting_payment", "cancelled"],
  awaiting_payment: ["payment_confirmed", "payment_failed", "cancelled"],
  payment_failed: ["awaiting_payment", "cancelled"],
  payment_confirmed: ["inventory_reserved", "fulfillment_exception"],
  inventory_reserved: ["vendor_confirmed", "fulfillment_exception", "cancelled", "refund_pending"],
  vendor_confirmed: ["preparing", "fulfillment_exception", "cancelled", "refund_pending"],
  preparing: ["ready_for_pickup", "fulfillment_exception", "cancelled", "refund_pending"],
  ready_for_pickup: ["delivery_assigned", "picked_up", "delivery_exception", "cancelled", "refund_pending"],
  delivery_assigned: ["picked_up", "delivery_exception", "cancelled", "refund_pending"],
  picked_up: ["in_transit", "delivered", "delivery_exception", "refund_pending"],
  in_transit: ["delivered", "delivery_exception", "refund_pending"],
  delivered: ["completed", "delivery_exception", "disputed", "refund_pending"],
  completed: ["settlement_pending", "disputed", "refund_pending"],
  settlement_pending: ["settled", "disputed", "refund_pending"],
  fulfillment_exception: ["vendor_confirmed", "preparing", "cancelled", "refund_pending"],
  delivery_exception: ["in_transit", "delivered", "cancelled", "refund_pending"],
  disputed: ["settled", "refund_pending", "cancelled"],
  refund_pending: ["refunded", "cancelled"],
  refunded: [],
  settled: ["disputed", "refund_pending"],
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