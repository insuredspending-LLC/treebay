// Tree Marketplace Stripe Connect integration — BACKEND ONLY.
// Never expose STRIPE_SECRET_KEY or webhook secrets to the frontend or logs.
//
// Design:
//  - Selling is automatic; only PAYOUTS require Stripe Connect KYC.
//  - A checkout is LIVE only when the seller's connected account has payouts_enabled
//    AND details_submitted. Otherwise the order stays in the existing TEST engine.
//  - Live buyer payments use Stripe Checkout (platform account). Seller proceeds
//    are routed to the connected account via a Transfer at settlement — so a seller
//    is never paid before the order is delivered and reconciled.
//  - TEST and LIVE are strictly separated: the TEST engine never touches Stripe,
//    and LIVE orders never use the simulated payment/tax/freight paths.

import {
  transitionOrder, recordOrderEvent, createAllocationLedger, raiseExceptionOnce,
  resolvePaymentExceptions, assertVendorSellable, vendorPayableCents, settlementGroup,
  VENDOR_CONFIRM_HOURS,
} from "./transactions.ts";
import {
  getActiveReservation, isReservationExpired, checkoutHoldsInventory, checkoutQuantity,
  releaseForOrder,
} from "./inventory.ts";
import { generateAndStoreDocument } from "./documents.ts";
import { notifySafely } from "./notifications.ts";
import { confirmOrderPayment } from "./payments.ts";
import { resumePendingRefund } from "./refunds.ts";

const STRIPE_API = "https://api.stripe.com/v1";
const STRIPE_VERSION = "2025-10-29.clover";

function env(name) {
  try { if (typeof Deno !== "undefined" && Deno.env) return Deno.env.get(name); } catch {}
  try { return process.env[name]; } catch {}
  return undefined;
}
function secretKey() {
  const k = env("STRIPE_SECRET_KEY");
  if (!k) throw new Error("Stripe is not configured (STRIPE_SECRET_KEY missing).");
  return k;
}
function appId() { return env("BASE44_APP_ID") || ""; }

// Flatten nested params into Stripe's x-www-form-urlencoded bracket notation.
function flattenParams(params, prefix, out) {
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    const name = prefix ? prefix + "[" + key + "]" : key;
    if (Array.isArray(value)) {
      value.forEach((item, idx) => {
        if (item !== null && typeof item === "object") {
          flattenParams(item, name + "[" + idx + "]", out);
        } else {
          out.append(name, String(item));
        }
      });
    } else if (typeof value === "object") {
      flattenParams(value, name, out);
    } else {
      out.append(name, String(value));
    }
  }
  return out;
}

export async function stripeFetch(path, opts) {
  const method = (opts && opts.method) || "GET";
  const headers = { Authorization: "Bearer " + secretKey(), "Stripe-Version": STRIPE_VERSION };
  let body;
  if (opts && opts.params) {
    body = flattenParams(opts.params, "", new URLSearchParams()).toString();
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }
  if (opts && opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
  const res = await fetch(STRIPE_API + path, { method, headers, body });
  const json = await res.json();
  if (!res.ok) {
    const msg = (json && json.error && json.error.message) || ("Stripe API error " + res.status);
    throw new Error(msg);
  }
  return json;
}

// ---- Seller Connect readiness ----
export function vendorStripeReady(vendor) {
  return !!(vendor && vendor.stripe_account_id && vendor.stripe_payouts_enabled && vendor.stripe_details_submitted);
}
export function commerceModeForVendor(vendor) {
  return vendorStripeReady(vendor) ? "live" : "test";
}
function onboardingStatus(account) {
  if (!account) return "not_started";
  if (account.payouts_enabled && account.details_submitted) return "enabled";
  if (account.details_submitted) return "restricted";
  return "pending";
}

// ---- Connected account management ----
export async function createConnectAccount(svc, vendor, email) {
  if (vendor.stripe_account_id) {
    return await retrieveAccount(svc, vendor.stripe_account_id);
  }
  const account = await stripeFetch("/accounts", {
    method: "POST",
    idempotencyKey: "connect-" + vendor.id,
    params: {
      type: "express",
      country: "US",
      email: email || undefined,
      business_type: "company",
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      metadata: { vendor_id: vendor.id, base44_app_id: appId() },
    },
  });
  await svc.entities.VendorProfile.update(vendor.id, {
    stripe_account_id: account.id,
    stripe_payouts_enabled: !!account.payouts_enabled,
    stripe_details_submitted: !!account.details_submitted,
    stripe_onboarding_status: onboardingStatus(account),
    seller_billing_provider: "stripe",
  });
  return account;
}

export async function retrieveAccount(svc, accountId) {
  const account = await stripeFetch("/accounts/" + accountId);
  await syncVendorFromAccount(svc, accountId, account);
  return account;
}

export async function syncVendorFromAccount(svc, accountId, account) {
  const vendors = await svc.entities.VendorProfile.filter({ stripe_account_id: accountId });
  const vendor = (vendors || [])[0];
  if (!vendor) return null;
  const wasEnabled = !!vendor.stripe_payouts_enabled;
  await svc.entities.VendorProfile.update(vendor.id, {
    stripe_payouts_enabled: !!account.payouts_enabled,
    stripe_details_submitted: !!account.details_submitted,
    stripe_onboarding_status: onboardingStatus(account),
  });
  // Admin visibility: a previously-enabled account that can no longer receive payouts.
  if (wasEnabled && !account.payouts_enabled) {
    await raiseExceptionOnce(svc, {
      severity: "ACTION_REQUIRED", exception_type: "stripe_account_restricted",
      vendor_id: vendor.id,
      reason: "Stripe account for " + vendor.business_name + " can no longer receive payouts.",
      technical_details_private: "requirements=" + JSON.stringify(account.requirements?.currently_due || []),
      recommended_action: "Seller should complete Stripe requirements to restore payouts.",
      requires_admin: false, status: "WAITING_ON_VENDOR",
    });
  }
  return vendor;
}

export async function createAccountLink(svc, vendor, type, origin) {
  if (!vendor.stripe_account_id) throw new Error("No Stripe account connected.");
  const link = await stripeFetch("/account_links", {
    method: "POST",
    idempotencyKey: "link-" + vendor.stripe_account_id + "-" + (type || "onboarding") + "-" + Date.now(),
    params: {
      account: vendor.stripe_account_id,
      refresh_url: origin + "/vendor",
      return_url: origin + "/vendor",
      type: type || "account_onboarding",
    },
  });
  return link;
}

export async function createLoginLink(svc, vendor) {
  if (!vendor.stripe_account_id) throw new Error("No Stripe account connected.");
  return await stripeFetch("/accounts/" + vendor.stripe_account_id + "/login_links", { method: "POST" });
}

// ---- Live buyer checkout ----
export async function createCheckoutSession(svc, order, cq, vendor, origin) {
  if (order.commerce_mode !== "live") throw new Error("A Stripe checkout session requires a live order.");
  if (!vendorStripeReady(vendor)) throw new Error("This seller is not yet ready to receive live payments.");
  if (order.fulfillment_method === "third_party_carrier") throw new Error("Third-party carrier is not available for live orders.");
  const currency = (cq.currency || "usd").toLowerCase();
  const lineItems = (cq.items || []).map((i) => ({
    price_data: { currency, unit_amount: i.unit_price_cents, product_data: { name: i.line_name } },
    quantity: i.quantity,
  }));
  if ((cq.delivery_amount_cents || 0) > 0) {
    lineItems.push({ price_data: { currency, unit_amount: cq.delivery_amount_cents, product_data: { name: "Delivery" } }, quantity: 1 });
  }
  if ((cq.marketplace_fee_cents || 0) > 0) {
    lineItems.push({ price_data: { currency, unit_amount: cq.marketplace_fee_cents, product_data: { name: "Tree Marketplace fee" } }, quantity: 1 });
  }
  // Live tax is not configured — it is not charged (no simulated rate as real money).
  const session = await stripeFetch("/checkout/sessions", {
    method: "POST",
    idempotencyKey: "checkout-" + order.id,
    params: {
      mode: "payment",
      line_items: lineItems,
      payment_intent_data: { metadata: { order_id: order.id, base44_app_id: appId() } },
      success_url: origin + "/orders/" + order.id + "?stripe_success=1",
      cancel_url: origin + "/orders/" + order.id + "?stripe_canceled=1",
      metadata: { order_id: order.id, vendor_id: vendor.id, base44_app_id: appId() },
    },
  });
  await svc.entities.Order.update(order.id, { stripe_checkout_session_id: session.id });
  const payments = await svc.entities.PaymentRecord.filter({ order_id: order.id });
  if (!(payments || []).length) {
    await svc.entities.PaymentRecord.create({
      order_id: order.id, buyer_id: order.buyer_id, vendor_owner_id: order.vendor_owner_id,
      commerce_mode: "live", provider: "stripe", amount: order.total,
      amount_cents: order.total_cents || Math.round((order.total || 0) * 100),
      status: "pending", metadata: { checkout_session_id: session.id },
    });
  }
  return session;
}

// ---- Live payment confirmation (webhook-driven) ----
export async function processLivePaymentSuccess(svc, sessionId) {
  const session = await stripeFetch("/checkout/sessions/" + sessionId);
  if (session.payment_status !== "paid") return { skipped: true };
  const orders = await svc.entities.Order.filter({ stripe_checkout_session_id: sessionId });
  const order = (orders || [])[0];
  if (!order) return { skipped: true, reason: "no order for session" };
  if (order.payment_status === "paid") return { alreadyPaid: true };
  const piId = session.payment_intent;
  let chargeId = piId;
  if (piId) {
    const pi = await stripeFetch("/payment_intents/" + piId);
    chargeId = pi.latest_charge || (pi.charges && pi.charges.data && pi.charges.data[0] && pi.charges.data[0].id) || piId;
  }
  await confirmOrderPayment(svc, order.id, {
    provider: "stripe", paymentRef: chargeId, providerPaymentId: piId,
    actor: { type: "payment_provider", id: "stripe" },
  });
  await svc.entities.Order.update(order.id, { stripe_payment_intent_id: piId || null });
  return { ok: true, orderId: order.id };
}

export async function processLivePaymentFailure(svc, orderId, reason) {
  const order = await svc.entities.Order.get(orderId);
  if (!order || order.commerce_mode !== "live") return;
  if (order.payment_status === "paid") return;
  const cq = order.checkout_quote_id ? await svc.entities.CheckoutQuote.get(order.checkout_quote_id) : null;
  const payments = await svc.entities.PaymentRecord.filter({ order_id: orderId });
  const payment = (payments || [])[0];
  if (payment) await svc.entities.PaymentRecord.update(payment.id, { status: "failed", failed_at: new Date().toISOString() });
  try {
    await transitionOrder(svc, orderId, "payment_failed", { type: "payment_provider", id: "stripe", description: "Stripe payment failed: " + reason });
  } catch { /* may already be payment_failed */ }
  await recordOrderEvent(svc, { order_id: orderId, event_type: "payment_failed", actor_type: "payment_provider", actor_id: "stripe", description: "Stripe payment failed: " + reason });
  if (checkoutHoldsInventory(cq)) await releaseForOrder(svc, orderId, "Stripe payment failed: " + reason);
  await raiseExceptionOnce(svc, {
    severity: "WARNING", exception_type: "payment_failed", order_id: orderId,
    buyer_id: order.buyer_id, vendor_id: order.vendor_id,
    reason: "Stripe payment failed: " + reason, recommended_action: "Buyer may retry payment from the order.",
    requires_admin: false, status: "WAITING_ON_BUYER",
  });
}

// ---- Settlement transfer to the connected account ----
export async function createVendorTransfer(svc, order, cq) {
  if (order.commerce_mode !== "live") return null;
  if (order.stripe_transfer_id) return { alreadyTransferred: true, transferId: order.stripe_transfer_id };
  const vendor = await svc.entities.VendorProfile.get(order.vendor_id);
  if (!vendor || !vendor.stripe_account_id) throw new Error("Seller has no connected Stripe account for payout.");
  if (!vendor.stripe_payouts_enabled) throw new Error("Seller Stripe account is not enabled for payouts.");
  const amount = vendorPayableCents(cq);
  if (amount <= 0) return { skipped: true };
  const transfer = await stripeFetch("/transfers", {
    method: "POST",
    idempotencyKey: "transfer-" + order.id,
    params: {
      amount, currency: (cq.currency || "usd").toLowerCase(),
      destination: vendor.stripe_account_id,
      transfer_group: order.id,
      metadata: { order_id: order.id, vendor_id: vendor.id, base44_app_id: appId() },
    },
  });
  await svc.entities.Order.update(order.id, { stripe_transfer_id: transfer.id });
  const group = settlementGroup(order.id);
  const rows = await svc.entities.TransactionLedgerEntry.filter({ order_id: order.id, transaction_id: group, entry_key: "payout" });
  const payoutEntry = (rows || [])[0];
  if (payoutEntry) await svc.entities.TransactionLedgerEntry.update(payoutEntry.id, { payout_reference: transfer.id });
  return { transferId: transfer.id };
}

// ---- Live refunds ----
export async function refundLivePayment(svc, orderId, chargeId) {
  return await stripeFetch("/refunds", {
    method: "POST",
    idempotencyKey: "refund-" + orderId,
    params: {
      charge: chargeId,
      reason: "requested_by_customer",
      metadata: { order_id: orderId, base44_app_id: appId() },
    },
  });
}

export async function handleChargeRefunded(svc, charge) {
  const piId = charge.payment_intent;
  let order = null;
  if (piId) {
    const orders = await svc.entities.Order.filter({ stripe_payment_intent_id: piId });
    order = (orders || [])[0];
  }
  if (!order && charge.metadata?.order_id) {
    order = await svc.entities.Order.get(charge.metadata.order_id);
  }
  if (!order) return;
  const payments = await svc.entities.PaymentRecord.filter({ order_id: order.id });
  const payment = (payments || [])[0];
  if (payment) await svc.entities.PaymentRecord.update(payment.id, { status: "refunded", refunded_amount: order.total, refund_status: "full" });
  if (!["refund_pending", "refunded"].includes(order.order_status)) {
    try { await transitionOrder(svc, order.id, "refund_pending", { type: "system", id: "stripe", description: "Stripe refund (webhook)" }); } catch {}
  }
  try {
    await resumePendingRefund(svc, order.id, { type: "system", id: "stripe" });
  } catch (e) {
    await raiseExceptionOnce(svc, {
      severity: "CRITICAL", exception_type: "refund_reconciliation", order_id: order.id,
      buyer_id: order.buyer_id, vendor_id: order.vendor_id, payment_id: payment?.id,
      reason: "Stripe refund webhook reconciliation failed: " + e.message,
      technical_details_private: e.message, recommended_action: "Run Transaction Maintenance.", requires_admin: true,
    });
  }
}

export async function handleDisputeCreated(svc, dispute) {
  const piId = dispute.payment_intent;
  let order = null;
  if (piId) {
    const orders = await svc.entities.Order.filter({ stripe_payment_intent_id: piId });
    order = (orders || [])[0];
  }
  if (!order && dispute.metadata?.order_id) order = await svc.entities.Order.get(dispute.metadata.order_id);
  if (!order) return;
  await svc.entities.Order.update(order.id, { payment_status: "disputed" });
  if (!["settled", "refunded", "cancelled", "disputed"].includes(order.order_status)) {
    try { await transitionOrder(svc, order.id, "disputed", { type: "system", id: "stripe", description: "Stripe dispute opened" }); } catch {}
  }
  await raiseExceptionOnce(svc, {
    severity: "CRITICAL", exception_type: "stripe_dispute", order_id: order.id,
    buyer_id: order.buyer_id, vendor_id: order.vendor_id,
    reason: "A payment dispute was opened for " + order.order_number,
    technical_details_private: "Dispute id: " + dispute.id,
    recommended_action: "Submit evidence in the Stripe dashboard.", requires_admin: true,
  });
}

export async function handleTransferFailed(svc, transfer) {
  const orderId = transfer.metadata?.order_id || transfer.transfer_group;
  if (!orderId) return;
  await raiseExceptionOnce(svc, {
    severity: "ACTION_REQUIRED", exception_type: "stripe_transfer_failed", order_id: orderId,
    reason: "Settlement transfer to the seller failed.",
    technical_details_private: "Transfer id: " + transfer.id,
    recommended_action: "Re-run Transaction Maintenance after resolving the Stripe issue.", requires_admin: true,
  });
}

export async function handlePayoutEvent(svc, event) {
  const payout = event.data.object;
  const accountId = payout.destination;
  const vendors = await svc.entities.VendorProfile.filter({ stripe_account_id: accountId });
  const vendor = (vendors || [])[0];
  if (!vendor) return;
  if (event.type === "payout.failed") {
    await raiseExceptionOnce(svc, {
      severity: "ACTION_REQUIRED", exception_type: "stripe_payout_failed", vendor_id: vendor.id,
      reason: "Payout to " + vendor.business_name + " failed.",
      technical_details_private: "Payout id: " + payout.id,
      recommended_action: "Seller should check their Stripe dashboard.", requires_admin: false, status: "WAITING_ON_VENDOR",
    });
  } else if (event.type === "payout.paid") {
    await notifySafely(svc, { user_id: vendor.owner_id, type: "general", eventType: "stripe_payout_paid", title: "Payout sent", body: "Your Stripe payout has been sent.", reference_type: "vendor", reference_id: vendor.id, vendor_id: vendor.id });
  }
}

// ---- Webhook signature verification (Web Crypto, available in Deno) ----
export async function verifyWebhookSignature(rawBody, sigHeader) {
  if (!sigHeader) return false;
  const parts = {};
  for (const part of sigHeader.split(",")) {
    const [k, v] = part.split("=");
    if (k && v) parts[k.trim()] = v.trim();
  }
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > 300) return false;
  const secret = env("STRIPE_WEBHOOK_SECRET");
  if (!secret) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const data = new TextEncoder().encode(timestamp + "." + rawBody);
  const sigBuf = await crypto.subtle.sign("HMAC", key, data);
  const expected = [...new Uint8Array(sigBuf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (expected.length !== signature.length) return false;
  let match = true;
  for (let i = 0; i < expected.length; i++) { if (expected[i] !== signature[i]) match = false; }
  return match;
}