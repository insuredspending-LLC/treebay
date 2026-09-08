import { isStripeCommerceMode, stripeKeyForMode, stripeSandboxEnabled, stripeModeFromObject, assertStripeObjectMode, assertStripeOrderMode, vendorStripeField, vendorStripeAccountId, stripeWebhookSecret } from "./stripeMode.ts";
// TreEbay Stripe Connect integration — BACKEND ONLY.
// Live charging remains fail-closed and requires an explicit production gate plus
// a live Stripe key. Stripe TEST mode is never used as the app's internal simulator.

import {
  transitionOrder, recordOrderEvent, raiseExceptionOnce, vendorPayableCents,
  settlementGroup, buyerFeePortionCents,
} from "./transactions.ts";
import {
  getActiveReservation, isReservationExpired, checkoutHoldsInventory, releaseForOrder,
} from "./inventory.ts";
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

function secretKey(mode = "live") { return stripeKeyForMode(mode); }

function keyIsLive() {
  return /^(sk|rk)_live_/.test(String(env("STRIPE_SECRET_KEY") || ""));
}

function appId() {
  return env("BASE44_APP_ID") || "";
}

export function livePaymentsEnabled() {
  const enabled = String(env("TREE_MARKETPLACE_LIVE_PAYMENTS") || "").toLowerCase() === "enabled";
  return enabled && keyIsLive();
}

export function stripeEventMatchesKeyMode(event) {
  try { stripeKeyForMode(stripeModeFromObject(event)); return true; } catch { return false; }
}

function publicAppOrigin() {
  const configured = env("TREE_MARKETPLACE_PUBLIC_URL") || "https://treebay.insuredspending.org";
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:") throw new Error("Public app URL must use HTTPS.");
    return url.origin;
  } catch {
    return "https://treebay.insuredspending.org";
  }
}

function flattenParams(params, prefix, out) {
  for (const [key, value] of Object.entries(params || {})) {
    if (value === null || value === undefined) continue;
    const name = prefix ? prefix + "[" + key + "]" : key;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (item !== null && typeof item === "object") flattenParams(item, name + "[" + index + "]", out);
        else out.append(name, String(item));
      });
    } else if (typeof value === "object") {
      flattenParams(value, name, out);
    } else {
      out.append(name, String(value));
    }
  }
  return out;
}

export async function stripeFetch(path, opts, mode = "live") {
  const method = opts?.method || "GET";
  const headers = {
    Authorization: "Bearer " + secretKey(mode),
    "Stripe-Version": STRIPE_VERSION,
  };
  let body;
  if (opts?.params) {
    body = flattenParams(opts.params, "", new URLSearchParams()).toString();
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }
  if (opts?.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
  const response = await fetch(STRIPE_API + path, { method, headers, body });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error?.message || ("Stripe API error " + response.status));
  }
  if (typeof json?.livemode === "boolean") assertStripeObjectMode(json, mode);
  return json;
}

// ---- Seller Connect readiness ----
function stripeFetchForMode(mode, path, opts) { return stripeFetch(path, opts, mode); }

export function vendorStripeReady(vendor, mode = "live") {
  return Boolean(vendorStripeAccountId(vendor, mode) &&
    vendor?.[vendorStripeField("stripe_payouts_enabled", mode)] &&
    vendor?.[vendorStripeField("stripe_details_submitted", mode)]);
}

function stripeAccountReady(account) {
  return Boolean(
    account?.payouts_enabled &&
    account?.details_submitted &&
    account?.capabilities?.transfers === "active",
  );
}

export function commerceModeForVendor(vendor, testAuthorized, requestedSandbox = false) {
  if (requestedSandbox) {
    if (!testAuthorized) throw new Error("Stripe sandbox is restricted to approved testers.");
    if (!stripeSandboxEnabled()) throw new Error("Stripe sandbox is not configured.");
    if (vendor?.is_test_fixture !== true) throw new Error("Sandbox checkout requires a dedicated test seller.");
    if (!vendorStripeReady(vendor, "stripe_test")) throw new Error("Complete test seller Stripe onboarding first.");
    return "stripe_test";
  }
  if (vendor?.is_test_fixture === true) return "payments_disabled";
  if (livePaymentsEnabled() && vendorStripeReady(vendor)) return "live";
  return testAuthorized ? "test" : "payments_disabled";
}

function onboardingStatus(account) {
  if (!account) return "not_started";
  if (stripeAccountReady(account)) return "enabled";
  if (account.details_submitted) return "restricted";
  return "pending";
}

export async function createConnectAccount(svc, vendor, email, mode = "live") {
  if (mode === "stripe_test" && (!stripeSandboxEnabled() || vendor.is_test_fixture !== true)) throw new Error("Use an enabled sandbox with a dedicated test seller.");
  if (mode === "live" && vendor.is_test_fixture === true) throw new Error("A fixture cannot create a live seller account.");
  const existingAccountId = vendorStripeAccountId(vendor, mode);
  if (existingAccountId) return retrieveAccount(svc, existingAccountId, mode);
  const account = await stripeFetchForMode(mode, "/accounts", {
    method: "POST",
    idempotencyKey: "connect-" + mode + "-" + vendor.id,
    params: {
      type: "express",
      country: "US",
      email: email || undefined,
      business_type: "company",
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: { vendor_id: vendor.id, base44_app_id: appId() },
    },
  });
  await svc.entities.VendorProfile.update(vendor.id, {
    [vendorStripeField("stripe_account_id", mode)]: account.id,
    [vendorStripeField("stripe_payouts_enabled", mode)]: Boolean(account.payouts_enabled),
    [vendorStripeField("stripe_details_submitted", mode)]: Boolean(account.details_submitted),
    [vendorStripeField("stripe_onboarding_status", mode)]: onboardingStatus(account),
    ...(mode === "live" ? { seller_billing_provider: "stripe" } : {}),
  });
  return account;
}

export async function retrieveAccount(svc, accountId, mode = "live") {
  const account = await stripeFetchForMode(mode, "/accounts/" + accountId);
  await syncVendorFromAccount(svc, accountId, account, mode);
  return account;
}

export async function syncVendorFromAccount(svc, accountId, account, mode = "live") {
  const vendors = await svc.entities.VendorProfile.filter({ [vendorStripeField("stripe_account_id", mode)]: accountId });
  const vendor = (vendors || [])[0];
  if (!vendor) return null;
  const wasEnabled = Boolean(vendor[vendorStripeField("stripe_payouts_enabled", mode)]);
  const isEnabled = stripeAccountReady(account);
  await svc.entities.VendorProfile.update(vendor.id, {
    [vendorStripeField("stripe_payouts_enabled", mode)]: isEnabled,
    [vendorStripeField("stripe_details_submitted", mode)]: Boolean(account.details_submitted),
    [vendorStripeField("stripe_onboarding_status", mode)]: onboardingStatus(account),
  });
  if (wasEnabled && !isEnabled) {
    await raiseExceptionOnce(svc, {
      severity: "ACTION_REQUIRED",
      exception_type: "stripe_account_restricted",
      vendor_id: vendor.id,
      reason: "Stripe account for " + vendor.business_name + " can no longer receive transfers.",
      technical_details_private: "requirements=" + JSON.stringify(account.requirements?.currently_due || []),
      recommended_action: "Seller should complete Stripe requirements before any settlement.",
      requires_admin: false,
      status: "WAITING_ON_VENDOR",
    });
  }
  return vendor;
}

export async function createAccountLink(svc, vendor, type, mode = "live") {
  if (!vendorStripeAccountId(vendor, mode)) throw new Error("No Stripe account connected.");
  const origin = publicAppOrigin();
  return stripeFetchForMode(mode, "/account_links", {
    method: "POST",
    idempotencyKey: "link-" + vendorStripeAccountId(vendor, mode) + "-" + (type || "onboarding") + "-" + Date.now(),
    params: {
      account: vendorStripeAccountId(vendor, mode),
      refresh_url: origin + (mode === "stripe_test" ? "/stripe-sandbox" : "/vendor"),
      return_url: origin + (mode === "stripe_test" ? "/stripe-sandbox" : "/vendor"),
      type: type || "account_onboarding",
    },
  });
}

export async function createLoginLink(svc, vendor, mode = "live") {
  if (!vendorStripeAccountId(vendor, mode)) throw new Error("No Stripe account connected.");
  return stripeFetchForMode(mode, "/accounts/" + vendorStripeAccountId(vendor, mode) + "/login_links", { method: "POST" });
}

// ---- Durable live checkout attempts ----
function affectedCount(result) {
  if (typeof result === "number") return result;
  if (Array.isArray(result)) return result.length;
  return result?.updated ?? result?.updated_count ?? result?.modified_count ??
    result?.modifiedCount ?? result?.matched_count ?? result?.count ?? 0;
}

async function attemptBySession(svc, sessionId) {
  if (!sessionId) return null;
  const rows = await svc.entities.PaymentAttempt.filter({ checkout_session_id: sessionId }, "-attempt_sequence", 5);
  return (rows || [])[0] || null;
}

async function attemptByPaymentIntent(svc, paymentIntentId) {
  if (!paymentIntentId) return null;
  const rows = await svc.entities.PaymentAttempt.filter({ payment_intent_id: paymentIntentId }, "-attempt_sequence", 5);
  return (rows || [])[0] || null;
}

async function currentAttemptForOrder(svc, order) {
  if (order.current_payment_attempt_id) {
    const attempt = await svc.entities.PaymentAttempt.get(order.current_payment_attempt_id);
    if (attempt) return attempt;
  }
  const rows = await svc.entities.PaymentAttempt.filter({ order_id: order.id, is_current: true }, "-attempt_sequence", 10);
  return (rows || [])[0] || null;
}

async function quarantineStalePaidAttempt(svc, order, attempt, detail) {
  if (attempt) {
    await svc.entities.PaymentAttempt.update(attempt.id, {
      status: "quarantined",
      is_current: false,
      failure_reason: detail,
      completed_at: new Date().toISOString(),
    });
  }
  await svc.entities.Order.update(order.id, {
    financial_hold: true,
    financial_hold_reason: "A non-current Stripe attempt received money and requires reconciliation.",
  });
  await raiseExceptionOnce(svc, {
    severity: "CRITICAL",
    exception_type: "stripe_stale_attempt_paid",
    order_id: order.id,
    buyer_id: order.buyer_id,
    vendor_id: order.vendor_id,
    reason: "A non-current Stripe payment attempt was paid for " + order.order_number + ".",
    technical_details_private: detail,
    recommended_action: "Do not fulfill. Reconcile the charge and refund or promote the correct attempt manually.",
    requires_admin: true,
  });
}

export async function createCheckoutSession(svc, order, cq, vendor) {
  const mode = order.commerce_mode;
  if (!isStripeCommerceMode(mode)) throw new Error("This order does not use Stripe.");
  if (mode === "live" && !livePaymentsEnabled()) throw new Error("Live payments are not enabled.");
  if (mode === "stripe_test" && (!stripeSandboxEnabled() || vendor?.is_test_fixture !== true)) throw new Error("Sandbox checkout requires an enabled sandbox and a test seller.");
  stripeKeyForMode(mode);
  if (cq.commerce_mode !== mode || cq.buyer_id !== order.buyer_id || cq.vendor_id !== order.vendor_id) throw new Error("Checkout snapshot ownership or environment mismatch.");
  if (order.order_status !== "awaiting_payment") throw new Error("This order is not awaiting payment.");
  if (order.financial_hold) throw new Error("This order is on a financial hold.");
  if (order.fulfillment_method === "third_party_carrier") {
    throw new Error("Third-party carrier is not available for live orders.");
  }

  if (!vendorStripeAccountId(vendor, mode)) throw new Error("This seller has no connected payout account.");
  const account = await retrieveAccount(svc, vendorStripeAccountId(vendor, mode), mode);
  if (!stripeAccountReady(account)) {
    throw new Error("This seller is not currently eligible to receive Stripe transfers.");
  }

  const existingAttempt = await currentAttemptForOrder(svc, order);
  if (existingAttempt?.checkout_session_id && existingAttempt.is_current) {
    const previousSession = await stripeFetchForMode(mode, "/checkout/sessions/" + existingAttempt.checkout_session_id);
    if (previousSession.status === "open") {
      await svc.entities.PaymentAttempt.update(existingAttempt.id, {
        status: "open",
        provider_status: previousSession.payment_status || previousSession.status,
      });
      return previousSession;
    }
    if (previousSession.payment_status === "paid") {
      throw new Error("This Stripe payment is complete and awaiting authoritative confirmation.");
    }
    await svc.entities.PaymentAttempt.update(existingAttempt.id, {
      status: previousSession.status === "expired" ? "expired" : "superseded",
      is_current: false,
      provider_status: previousSession.payment_status || previousSession.status,
      completed_at: new Date().toISOString(),
    });
  }

  const currentOrder = await svc.entities.Order.get(order.id);
  const previousSequence = Number(currentOrder.payment_attempt_sequence || 0);
  const nextSequence = previousSequence + 1;
  const claim = await svc.entities.Order.updateMany(
    {
      id: order.id,
      order_status: "awaiting_payment",
      payment_attempt_sequence: previousSequence,
    },
    { $set: { payment_attempt_sequence: nextSequence } },
  );
  if (!affectedCount(claim)) {
    const racedOrder = await svc.entities.Order.get(order.id);
    const racedAttempt = await currentAttemptForOrder(svc, racedOrder);
    if (racedAttempt?.checkout_session_id && racedAttempt.is_current) {
      const racedSession = await stripeFetchForMode(mode, "/checkout/sessions/" + racedAttempt.checkout_session_id);
      if (racedSession.status === "open") return racedSession;
    }
    throw new Error("Another checkout attempt is being created. Please retry.");
  }

  const currency = (cq.currency || "usd").toLowerCase();
  const buyerFeeCents = buyerFeePortionCents(cq.marketplace_fee_cents || 0, cq.fee_payer || "vendor");
  const lineItems = (cq.items || []).map((item) => ({
    price_data: {
      currency,
      unit_amount: item.unit_price_cents,
      product_data: { name: item.line_name },
    },
    quantity: item.quantity,
  }));
  if ((cq.delivery_amount_cents || 0) > 0) {
    lineItems.push({
      price_data: {
        currency,
        unit_amount: cq.delivery_amount_cents,
        product_data: { name: "Delivery" },
      },
      quantity: 1,
    });
  }
  if (buyerFeeCents > 0) {
    lineItems.push({
      price_data: {
        currency,
        unit_amount: buyerFeeCents,
        product_data: { name: "TreEbay fee" },
      },
      quantity: 1,
    });
  }

  const checkoutTotal = lineItems.reduce(
    (sum, item) => sum + item.price_data.unit_amount * item.quantity,
    0,
  );
  if (checkoutTotal !== order.total_cents || checkoutTotal !== cq.total_amount_cents) {
    throw new Error("Authoritative checkout total does not match the Stripe line items.");
  }

  const sessionExpiresAt = Math.floor(Date.now() / 1000) + 31 * 60;
  const holdExpiresAt = new Date((sessionExpiresAt + 5 * 60) * 1000).toISOString();
  if (checkoutHoldsInventory(cq)) {
    const reservation = await getActiveReservation(svc, order.id, cq.product_id);
    if (!reservation || isReservationExpired(reservation)) {
      throw new Error("The inventory hold expired. Please restart checkout.");
    }
    await svc.entities.InventoryReservation.update(reservation.id, { expires_at: holdExpiresAt });
  }
  await svc.entities.Order.update(order.id, { reservation_expires_at: holdExpiresAt });

  const idempotencyKey = "checkout-" + order.id + "-attempt-" + nextSequence;
  const attempt = await svc.entities.PaymentAttempt.create({
    order_id: order.id,
    buyer_id: order.buyer_id,
    attempt_sequence: nextSequence,
    provider: "stripe",
    commerce_mode: mode,
    status: "creating",
    is_current: true,
    amount_cents: order.total_cents,
    currency: currency.toUpperCase(),
    idempotency_key: idempotencyKey,
    expires_at: new Date(sessionExpiresAt * 1000).toISOString(),
  });

  await svc.entities.Order.update(order.id, { current_payment_attempt_id: attempt.id });
  const origin = publicAppOrigin();
  try {
    const session = await stripeFetchForMode(mode, "/checkout/sessions", {
      method: "POST",
      idempotencyKey,
      params: {
        mode: "payment",
        payment_method_types: { 0: "card" },
        line_items: lineItems,
        expires_at: sessionExpiresAt,
        payment_intent_data: {
          transfer_group: order.id,
          metadata: {
            order_id: order.id,
            payment_attempt_id: attempt.id,
            payment_attempt_sequence: String(nextSequence),
            base44_app_id: appId(),
          },
        },
        success_url: origin + "/orders/" + order.id + "?stripe_success=1",
        cancel_url: origin + "/orders/" + order.id + "?stripe_canceled=1",
        metadata: {
          order_id: order.id,
          vendor_id: vendor.id,
          payment_attempt_id: attempt.id,
          payment_attempt_sequence: String(nextSequence),
          base44_app_id: appId(),
        },
      },
    });
    await svc.entities.PaymentAttempt.update(attempt.id, {
      status: "open",
      checkout_session_id: session.id,
      provider_status: session.payment_status || session.status,
    });
    await svc.entities.Order.update(order.id, {
      stripe_checkout_session_id: session.id,
      current_payment_attempt_id: attempt.id,
    });

    const payments = await svc.entities.PaymentRecord.filter({ order_id: order.id });
    const payment = (payments || [])[0];
    const metadata = {
      ...(payment?.metadata || {}),
      checkout_session_id: session.id,
      current_payment_attempt_id: attempt.id,
      payment_attempt_sequence: nextSequence,
    };
    if (payment) {
      await svc.entities.PaymentRecord.update(payment.id, {
        commerce_mode: mode,
        provider: "stripe",
        status: payment.status === "paid" ? "paid" : "pending",
        confirmation_status: payment.confirmation_status || "pending",
        metadata,
      });
    } else {
      await svc.entities.PaymentRecord.create({
        order_id: order.id,
        buyer_id: order.buyer_id,
        vendor_owner_id: order.vendor_owner_id,
        commerce_mode: mode,
        provider: "stripe",
        amount: order.total,
        amount_cents: order.total_cents || Math.round((order.total || 0) * 100),
        status: "pending",
        confirmation_status: "pending",
        metadata,
      });
    }
    return session;
  } catch (error) {
    await svc.entities.PaymentAttempt.update(attempt.id, {
      status: "failed",
      is_current: false,
      failure_reason: error.message,
      completed_at: new Date().toISOString(),
    });
    await svc.entities.Order.update(order.id, {
      current_payment_attempt_id: null,
      financial_hold: true,
      financial_hold_reason: "Stripe checkout attempt creation failed and needs a safe retry.",
    });
    throw error;
  }
}

async function validateCurrentPaidSession(svc, session, mode) {
  const attempt = await attemptBySession(svc, session.id);
  const orderId = session.metadata?.order_id || attempt?.order_id;
  const order = orderId ? await svc.entities.Order.get(orderId) : null;
  if (!order) throw new Error("No TreEbay order matches the Stripe Checkout Session.");
  assertStripeOrderMode(order, mode);
  if (!attempt || order.current_payment_attempt_id !== attempt.id || order.stripe_checkout_session_id !== session.id) {
    await quarantineStalePaidAttempt(
      svc,
      order,
      attempt,
      "session=" + session.id + "; current_attempt=" + (order.current_payment_attempt_id || "none"),
    );
    return { quarantined: true, order, attempt };
  }
  return { quarantined: false, order, attempt };
}

export async function processLivePaymentSuccess(svc, sessionId, eventId, mode = "live") {
  const session = await stripeFetchForMode(mode, "/checkout/sessions/" + sessionId);
  if (session.payment_status !== "paid") {
    throw new Error("Stripe reported a completed checkout that is not paid.");
  }
  assertStripeObjectMode(session, mode);

  const current = await validateCurrentPaidSession(svc, session, mode);
  if (current.quarantined) return { quarantined: true, orderId: current.order.id };
  const { order, attempt } = current;
  const cq = order.checkout_quote_id
    ? await svc.entities.CheckoutQuote.get(order.checkout_quote_id)
    : null;
  if (!cq) throw new Error("The order has no authoritative checkout snapshot.");

  const expectedCurrency = (cq.currency || "usd").toLowerCase();
  const expectedTotal = order.total_cents || Math.round((order.total || 0) * 100);
  const integrityErrors = [];
  if (order.commerce_mode !== mode || cq.commerce_mode !== mode || attempt.commerce_mode !== mode) integrityErrors.push("payment environment mismatch");
  if (session.metadata?.order_id !== order.id) integrityErrors.push("session order metadata mismatch");
  if (session.metadata?.payment_attempt_id !== attempt.id) integrityErrors.push("session attempt metadata mismatch");
  if (session.metadata?.base44_app_id && session.metadata.base44_app_id !== appId()) {
    integrityErrors.push("session app metadata mismatch");
  }
  if (session.amount_total !== expectedTotal || session.amount_total !== cq.total_amount_cents) {
    integrityErrors.push("session amount mismatch");
  }
  if ((session.currency || "").toLowerCase() !== expectedCurrency) {
    integrityErrors.push("session currency mismatch");
  }

  const paymentIntentId = session.payment_intent;
  if (!paymentIntentId) integrityErrors.push("missing PaymentIntent");
  let chargeId = paymentIntentId;
  if (paymentIntentId) {
    const intent = await stripeFetchForMode(mode, "/payment_intents/" + paymentIntentId);
    if (intent.livemode !== (mode === "live")) integrityErrors.push("PaymentIntent environment mismatch");
    if (intent.status !== "succeeded") integrityErrors.push("PaymentIntent did not succeed");
    if (intent.amount_received !== expectedTotal) integrityErrors.push("PaymentIntent amount mismatch");
    if ((intent.currency || "").toLowerCase() !== expectedCurrency) integrityErrors.push("PaymentIntent currency mismatch");
    if (intent.metadata?.order_id !== order.id) integrityErrors.push("PaymentIntent order metadata mismatch");
    if (intent.metadata?.payment_attempt_id !== attempt.id) integrityErrors.push("PaymentIntent attempt metadata mismatch");
    chargeId = intent.latest_charge ||
      intent.charges?.data?.[0]?.id ||
      paymentIntentId;
  }

  if (integrityErrors.length) {
    await svc.entities.PaymentAttempt.update(attempt.id, {
      status: "quarantined",
      failure_reason: integrityErrors.join("; "),
      last_provider_event_id: eventId || null,
      last_provider_event_at: new Date().toISOString(),
    });
    await svc.entities.Order.update(order.id, {
      financial_hold: true,
      financial_hold_reason: "Stripe payment failed integrity validation.",
    });
    await raiseExceptionOnce(svc, {
      severity: "CRITICAL",
      exception_type: "stripe_payment_integrity",
      order_id: order.id,
      buyer_id: order.buyer_id,
      vendor_id: order.vendor_id,
      reason: "Stripe payment confirmation failed integrity checks.",
      technical_details_private: integrityErrors.join("; "),
      recommended_action: "Do not fulfill. Reconcile the payment and checkout attempt.",
      requires_admin: true,
    });
    throw new Error("Stripe payment integrity validation failed.");
  }

  await svc.entities.PaymentAttempt.update(attempt.id, {
    status: "paid",
    payment_intent_id: paymentIntentId,
    provider_status: "paid",
    last_provider_event_id: eventId || null,
    last_provider_event_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  });
  await svc.entities.Order.update(order.id, {
    stripe_payment_intent_id: paymentIntentId,
    financial_hold: false,
    financial_hold_reason: null,
  });
  await confirmOrderPayment(svc, order.id, {
    provider: "stripe",
    paymentRef: chargeId,
    providerPaymentId: paymentIntentId,
    actor: { type: "payment_provider", id: "stripe" },
    allowExpiredReservation: true,
  });
  return { ok: true, orderId: order.id, attemptId: attempt.id };
}

export async function processLivePaymentFailure(svc, details) {
  const sessionId = details?.sessionId || null;
  const paymentIntentId = details?.paymentIntentId || null;
  const attempt = sessionId
    ? await attemptBySession(svc, sessionId)
    : await attemptByPaymentIntent(svc, paymentIntentId);
  const orderId = details?.orderId || attempt?.order_id;
  const order = orderId ? await svc.entities.Order.get(orderId) : null;
  if (!order) return { ignored: true };
  assertStripeOrderMode(order, details?.commerceMode || "live");

  if (!attempt || order.current_payment_attempt_id !== attempt.id) {
    if (attempt) {
      await svc.entities.PaymentAttempt.update(attempt.id, {
        status: details?.terminal ? "expired" : "failed",
        is_current: false,
        failure_reason: details?.reason || "Provider attempt failed",
        last_provider_event_id: details?.eventId || null,
        last_provider_event_at: new Date().toISOString(),
      });
    }
    return { ignored: true, staleAttempt: true };
  }
  if (order.payment_status === "paid") return { ignored: true, alreadyPaid: true };

  await svc.entities.PaymentAttempt.update(attempt.id, {
    status: details?.terminal ? "expired" : "failed",
    failure_reason: details?.reason || "Provider attempt failed",
    provider_status: details?.providerStatus || null,
    last_provider_event_id: details?.eventId || null,
    last_provider_event_at: new Date().toISOString(),
    completed_at: details?.terminal ? new Date().toISOString() : null,
  });

  // A PaymentIntent failure inside an open Checkout Session is not terminal; the
  // customer may still retry. Only provider-confirmed session expiry closes/release it.
  if (!details?.terminal) return { ignored: true, waitingForSession: true };

  const payments = await svc.entities.PaymentRecord.filter({ order_id: order.id });
  const payment = (payments || [])[0];
  if (payment) {
    await svc.entities.PaymentRecord.update(payment.id, {
      status: "failed",
      failed_at: new Date().toISOString(),
      confirmation_status: "pending",
    });
  }
  if (order.order_status === "awaiting_payment") {
    await transitionOrder(svc, order.id, "payment_failed", {
      type: "payment_provider",
      id: "stripe",
      description: "Stripe checkout expired without payment",
    });
  }
  const cq = order.checkout_quote_id
    ? await svc.entities.CheckoutQuote.get(order.checkout_quote_id)
    : null;
  if (checkoutHoldsInventory(cq)) {
    await releaseForOrder(svc, order.id, "Stripe confirmed checkout expiry without payment", true);
  }
  await raiseExceptionOnce(svc, {
    severity: "WARNING",
    exception_type: "payment_failed",
    order_id: order.id,
    buyer_id: order.buyer_id,
    vendor_id: order.vendor_id,
    reason: "Stripe checkout expired without payment.",
    recommended_action: "Buyer may begin a new checkout attempt.",
    requires_admin: false,
    status: "WAITING_ON_BUYER",
  });
  return { terminal: true, released: true };
}

export async function reconcileLiveAwaitingPayment(svc, order) {
  if (!order || !isStripeCommerceMode(order.commerce_mode) || order.order_status !== "awaiting_payment") {
    return { safeToRelease: false, ignored: true };
  }
  const mode = order.commerce_mode;
  try {
    const attempt = await currentAttemptForOrder(svc, order);
    if (!attempt?.checkout_session_id) {
      await raiseExceptionOnce(svc, {
        severity: "CRITICAL",
        exception_type: "stripe_attempt_missing",
        order_id: order.id,
        buyer_id: order.buyer_id,
        vendor_id: order.vendor_id,
        reason: "Live awaiting-payment order has no current Stripe attempt.",
        recommended_action: "Do not release inventory until Stripe is reconciled.",
        requires_admin: true,
      });
      return { safeToRelease: false };
    }
    const session = await stripeFetchForMode(mode, "/checkout/sessions/" + attempt.checkout_session_id);
    if (session.payment_status === "paid") {
      await processLivePaymentSuccess(svc, session.id, "maintenance-reconciliation", mode);
      return { safeToRelease: false, paid: true };
    }
    if (session.status === "open") {
      const providerExpiry = session.expires_at
        ? new Date((session.expires_at + 5 * 60) * 1000).toISOString()
        : null;
      if (providerExpiry) {
        await svc.entities.Order.update(order.id, { reservation_expires_at: providerExpiry });
        if (checkoutHoldsInventory(await svc.entities.CheckoutQuote.get(order.checkout_quote_id))) {
          const reservation = await getActiveReservation(svc, order.id);
          if (reservation) await svc.entities.InventoryReservation.update(reservation.id, { expires_at: providerExpiry });
        }
      }
      return { safeToRelease: false, providerOpen: true };
    }
    if (session.status === "expired" || session.status === "complete") {
      await processLivePaymentFailure(svc, {
        commerceMode: mode,
        orderId: order.id,
        sessionId: session.id,
        reason: "Stripe confirmed checkout session " + session.status + " without payment",
        providerStatus: session.status,
        terminal: true,
        eventId: "maintenance-reconciliation",
      });
      return { safeToRelease: true, providerExpired: true };
    }
    return { safeToRelease: false };
  } catch (error) {
    await svc.entities.Order.update(order.id, {
      financial_hold: true,
      financial_hold_reason: "Stripe checkout state could not be reconciled.",
    });
    await raiseExceptionOnce(svc, {
      severity: "CRITICAL",
      exception_type: "stripe_attempt_reconciliation",
      order_id: order.id,
      buyer_id: order.buyer_id,
      vendor_id: order.vendor_id,
      reason: "Could not reconcile current Stripe checkout attempt: " + error.message,
      technical_details_private: error.message,
      recommended_action: "Do not release inventory or cancel the order until Stripe is reachable and reconciled.",
      requires_admin: true,
    });
    return { safeToRelease: false, error: error.message };
  }
}

export async function reconcilePendingLiveRefund(svc, order) {
  if (!order || !isStripeCommerceMode(order.commerce_mode)) return { ignored: true };
  const payments = await svc.entities.PaymentRecord.filter({ order_id: order.id });
  const payment = (payments || [])[0];
  if (!payment?.provider_refund_id) {
    await raiseExceptionOnce(svc, {
      severity: "CRITICAL",
      exception_type: "stripe_refund_reference_missing",
      order_id: order.id,
      buyer_id: order.buyer_id,
      vendor_id: order.vendor_id,
      payment_id: payment?.id,
      reason: "Live refund is pending without a Stripe refund id.",
      recommended_action: "Keep the order quarantined and reconcile it in Stripe.",
      requires_admin: true,
    });
    return { refundPending: true, missingReference: true };
  }
  const refund = await stripeFetchForMode(order.commerce_mode, "/refunds/" + payment.provider_refund_id);
  return reconcileStripeRefund(svc, refund, "maintenance-reconciliation");
}

// ---- Settlement transfer ----
export async function createVendorTransfer(svc, order, cq) {
  const mode = order.commerce_mode;
  if (!isStripeCommerceMode(mode)) return null;
  if (mode === "live" && !livePaymentsEnabled()) throw new Error("Live settlement transfers are paused.");
  if (mode === "stripe_test" && !stripeSandboxEnabled()) throw new Error("Sandbox transfers are paused.");
  if (order.financial_hold) throw new Error("Order is on a financial hold.");
  if (!order.buyer_confirmed_at) throw new Error("Buyer delivery confirmation is required before settlement.");
  if (!order.payout_eligible_at || new Date(order.payout_eligible_at) > new Date()) {
    throw new Error("The payout cooling hold has not elapsed.");
  }
  if (order.stripe_transfer_id) {
    return { alreadyTransferred: true, transferId: order.stripe_transfer_id };
  }

  const vendor = await svc.entities.VendorProfile.get(order.vendor_id);
  if (!vendorStripeAccountId(vendor, mode)) throw new Error("Seller has no connected Stripe account for payout.");
  const account = await retrieveAccount(svc, vendorStripeAccountId(vendor, mode), mode);
  if (!stripeAccountReady(account)) {
    throw new Error("Seller Stripe account is not currently enabled for transfers.");
  }

  if (mode === "stripe_test" && vendor.is_test_fixture !== true) throw new Error("Sandbox seller isolation failed.");
  const amount = vendorPayableCents(cq);
  if (amount <= 0) return { skipped: true };
  let transfer;
  try {
    transfer = await stripeFetchForMode(mode, "/transfers", {
      method: "POST",
      idempotencyKey: "transfer-" + order.id,
      params: {
        amount,
        currency: (cq.currency || "usd").toLowerCase(),
        destination: vendorStripeAccountId(vendor, mode),
        transfer_group: order.id,
        metadata: { order_id: order.id, vendor_id: vendor.id, base44_app_id: appId() },
      },
    });
  } catch (error) {
    await svc.entities.Order.update(order.id, {
      financial_hold: true,
      financial_hold_reason: "Stripe seller transfer failed synchronously.",
    });
    await raiseExceptionOnce(svc, {
      severity: "ACTION_REQUIRED",
      exception_type: "stripe_transfer_failed",
      order_id: order.id,
      buyer_id: order.buyer_id,
      vendor_id: order.vendor_id,
      reason: "Settlement transfer to the seller failed: " + error.message,
      technical_details_private: error.message,
      recommended_action: "Resolve the Stripe transfer issue before retrying settlement.",
      requires_admin: true,
    });
    throw error;
  }

  await svc.entities.Order.update(order.id, { stripe_transfer_id: transfer.id });
  const group = settlementGroup(order.id);
  const rows = await svc.entities.TransactionLedgerEntry.filter({
    order_id: order.id,
    transaction_id: group,
    entry_key: "payout",
  });
  const payoutEntry = (rows || [])[0];
  if (payoutEntry) {
    await svc.entities.TransactionLedgerEntry.update(payoutEntry.id, { payout_reference: transfer.id });
  }
  return { transferId: transfer.id };
}

export async function ensureTransferReversal(svc, order, cq, cumulativeRefundedCents) {
  if (!order.stripe_transfer_id) return { skipped: true, targetCents: 0 };
  const totalCents = order.total_cents || Math.round((order.total || 0) * 100);
  const vendorPayable = vendorPayableCents(cq);
  const targetCents = Math.min(
    vendorPayable,
    Math.round(vendorPayable * Math.min(cumulativeRefundedCents, totalCents) / totalCents),
  );
  const alreadyReversed = Number(order.stripe_transfer_reversed_cents || 0);
  const amount = targetCents - alreadyReversed;
  if (amount <= 0) return { alreadyReversed: true, targetCents };

  try {
    const reversal = await stripeFetchForMode(order.commerce_mode, "/transfers/" + order.stripe_transfer_id + "/reversals", {
      method: "POST",
      idempotencyKey: "transfer-reversal-" + order.id + "-" + targetCents,
      params: {
        amount,
        metadata: {
          order_id: order.id,
          cumulative_refunded_cents: String(cumulativeRefundedCents),
          base44_app_id: appId(),
        },
      },
    });
    const ids = [...new Set([...(order.stripe_transfer_reversal_ids || []), reversal.id])];
    await svc.entities.Order.update(order.id, {
      stripe_transfer_reversed_cents: targetCents,
      stripe_transfer_reversal_ids: ids,
      financial_hold: true,
      financial_hold_reason: "Refund reconciliation in progress.",
    });
    await recordOrderEvent(svc, {
      order_id: order.id,
      event_type: "transfer_reversed",
      actor_type: "payment_provider",
      actor_id: "stripe",
      description: "Seller transfer reversed proportionally for refund",
      metadata: { reversal_id: reversal.id, reversed_cents: amount, cumulative_target_cents: targetCents },
    });
    return { reversalId: reversal.id, targetCents };
  } catch (error) {
    await svc.entities.Order.update(order.id, {
      financial_hold: true,
      financial_hold_reason: "Seller transfer reversal failed; refund quarantined.",
    });
    await raiseExceptionOnce(svc, {
      severity: "CRITICAL",
      exception_type: "stripe_transfer_reversal_failed",
      order_id: order.id,
      buyer_id: order.buyer_id,
      vendor_id: order.vendor_id,
      reason: "Seller transfer reversal failed for " + order.order_number + ": " + error.message,
      technical_details_private: error.message,
      recommended_action: "Keep the order quarantined and recover the seller funds before finalizing the refund.",
      requires_admin: true,
    });
    throw error;
  }
}

// ---- Refund workflow ----
async function stageRefund(svc, order, payment, actor, reason) {
  if (order.order_status !== "refund_pending") {
    await transitionOrder(svc, order.id, "refund_pending", {
      type: actor?.type || "system",
      id: actor?.id,
      description: "Refund initiated: " + reason,
    });
  }
  await svc.entities.PaymentRecord.update(payment.id, {
    refund_status: "pending",
    provider_refund_status: payment.provider_refund_status || "none",
    metadata: {
      ...(payment.metadata || {}),
      refund_origin_status: payment.metadata?.refund_origin_status || order.order_status,
      refund_reason: reason,
    },
  });
  await svc.entities.Order.update(order.id, {
    financial_hold: isStripeCommerceMode(order.commerce_mode),
    financial_hold_reason: isStripeCommerceMode(order.commerce_mode) ? "Stripe refund is awaiting provider reconciliation." : null,
  });
}

export async function initiateRefundWorkflow(svc, orderId, actor, reason) {
  const order = await svc.entities.Order.get(orderId);
  if (!order) throw new Error("Order not found");
  const payments = await svc.entities.PaymentRecord.filter({ order_id: orderId });
  const payment = (payments || [])[0];
  if (!payment) throw new Error("No payment record found for this order.");

  const totalCents = order.total_cents || Math.round((order.total || 0) * 100);
  if (
    order.order_status === "refunded" &&
    payment.status === "refunded" &&
    payment.refund_status === "full"
  ) {
    return { alreadyRefunded: true, order, payment };
  }
  if (!["paid", "partially_refunded", "refunded"].includes(payment.status)) {
    throw new Error("This order has no refundable paid balance.");
  }
  if (["cancelled"].includes(order.order_status)) {
    throw new Error("A cancelled unpaid order cannot enter the refund workflow.");
  }

  await stageRefund(svc, order, payment, actor, reason || "Buyer refund request");

  if (order.commerce_mode === "test") {
    const testPayment = await svc.entities.PaymentRecord.get(payment.id);
    await svc.entities.PaymentRecord.update(payment.id, {
      status: "refunded",
      refund_status: "full",
      refunded_amount: order.total,
      refunded_amount_cents: totalCents,
      provider_refund_status: "succeeded",
      refund_last_event_at: new Date().toISOString(),
    });
    return resumePendingRefund(svc, orderId, actor);
  }

  if (!isStripeCommerceMode(order.commerce_mode)) {
    throw new Error("Payments are disabled for this order.");
  }
  stripeKeyForMode(order.commerce_mode);

  const refreshed = await svc.entities.PaymentRecord.get(payment.id);
  if (refreshed.provider_refund_id && refreshed.provider_refund_status === "pending") {
    const existingRefund = await stripeFetchForMode(order.commerce_mode, "/refunds/" + refreshed.provider_refund_id);
    return reconcileStripeRefund(svc, existingRefund, "refund-retry");
  }
  if (refreshed.provider_refund_status === "succeeded" && refreshed.refund_status === "full") {
    return resumePendingRefund(svc, orderId, actor);
  }

  const chargeId = refreshed.transaction_ref;
  if (!chargeId || !String(chargeId).startsWith("ch_")) {
    throw new Error("No Stripe charge id found for this live payment.");
  }
  let refund;
  try {
    refund = await stripeFetchForMode(order.commerce_mode, "/refunds", {
      method: "POST",
      idempotencyKey: "refund-" + orderId + "-full",
      params: {
        charge: chargeId,
        amount: totalCents,
        reason: "requested_by_customer",
        metadata: {
          order_id: orderId,
          payment_record_id: payment.id,
          refund_scope: "full",
          base44_app_id: appId(),
        },
      },
    });
  } catch (error) {
    await svc.entities.PaymentRecord.update(payment.id, {
      refund_status: "failed",
      provider_refund_status: "failed",
      refund_failure_reason: error.message,
      refund_last_event_at: new Date().toISOString(),
    });
    await raiseExceptionOnce(svc, {
      severity: "ACTION_REQUIRED",
      exception_type: "stripe_refund_failed",
      order_id: orderId,
      buyer_id: order.buyer_id,
      vendor_id: order.vendor_id,
      payment_id: payment.id,
      reason: "Stripe refund could not be issued: " + error.message,
      technical_details_private: error.message,
      recommended_action: "Keep fulfillment and payout frozen; retry after resolving Stripe.",
      requires_admin: true,
    });
    throw error;
  }

  await svc.entities.PaymentRecord.update(payment.id, {
    provider_refund_id: refund.id,
    provider_refund_status: refund.status === "succeeded" ? "succeeded" : "pending",
    refund_status: refund.status === "failed" || refund.status === "canceled" ? "failed" : "pending",
    refund_failure_reason: refund.failure_reason || null,
    refund_last_event_at: new Date().toISOString(),
  });

  if (refund.status === "succeeded") return reconcileStripeRefund(svc, refund, "refund-api");
  if (refund.status === "failed" || refund.status === "canceled") {
    return reconcileStripeRefund(svc, refund, "refund-api");
  }
  return { refundPending: true, providerStatus: refund.status, refundId: refund.id };
}

async function locateOrderForRefund(svc, refund) {
  if (refund.metadata?.order_id) {
    const order = await svc.entities.Order.get(refund.metadata.order_id);
    if (order) return order;
  }
  const payments = await svc.entities.PaymentRecord.filter({ provider_refund_id: refund.id });
  const payment = (payments || [])[0];
  return payment?.order_id ? svc.entities.Order.get(payment.order_id) : null;
}

async function reconcileChargeRefundTruth(svc, order, payment, charge, refund, source) {
  const totalCents = order.total_cents || Math.round((order.total || 0) * 100);
  const cumulativeRefundedCents = Number(charge.amount_refunded || refund?.amount || 0);
  const full = cumulativeRefundedCents >= totalCents;
  const providerStatus = refund?.status || (full || cumulativeRefundedCents > 0 ? "succeeded" : "pending");

  if (providerStatus === "failed" || providerStatus === "canceled") {
    await svc.entities.PaymentRecord.update(payment.id, {
      provider_refund_id: refund?.id || payment.provider_refund_id,
      provider_refund_status: providerStatus,
      refund_status: "failed",
      refund_failure_reason: refund?.failure_reason || "Stripe refund " + providerStatus,
      refund_last_event_at: new Date().toISOString(),
    });
    await svc.entities.Order.update(order.id, {
      financial_hold: true,
      financial_hold_reason: "Stripe refund failed or was canceled.",
    });
    await raiseExceptionOnce(svc, {
      severity: "CRITICAL",
      exception_type: "stripe_refund_failed",
      order_id: order.id,
      buyer_id: order.buyer_id,
      vendor_id: order.vendor_id,
      payment_id: payment.id,
      reason: "Stripe refund " + providerStatus + " for " + order.order_number + ".",
      technical_details_private: "refund=" + (refund?.id || "unknown") + "; source=" + source,
      recommended_action: "Keep the order quarantined and resolve the refund in Stripe.",
      requires_admin: true,
    });
    return { refundFailed: true, providerStatus };
  }

  if (providerStatus !== "succeeded") {
    await svc.entities.PaymentRecord.update(payment.id, {
      provider_refund_id: refund?.id || payment.provider_refund_id,
      provider_refund_status: "pending",
      refund_status: "pending",
      refund_last_event_at: new Date().toISOString(),
    });
    await svc.entities.Order.update(order.id, {
      financial_hold: true,
      financial_hold_reason: "Stripe refund is pending.",
    });
    return { refundPending: true, providerStatus };
  }

  await svc.entities.PaymentRecord.update(payment.id, {
    provider_refund_id: refund?.id || payment.provider_refund_id,
    provider_refund_status: "succeeded",
    status: full ? "refunded" : "partially_refunded",
    refund_status: full ? "full" : "partial",
    refunded_amount: cumulativeRefundedCents / 100,
    refunded_amount_cents: cumulativeRefundedCents,
    refund_failure_reason: null,
    refund_last_event_at: new Date().toISOString(),
  });
  await svc.entities.Order.update(order.id, {
    payment_status: full ? "refunded" : "partially_refunded",
    financial_hold: true,
    financial_hold_reason: full
      ? "Provider-confirmed refund is reconciling."
      : "Partial refund requires administrator reconciliation.",
  });

  const cq = order.checkout_quote_id
    ? await svc.entities.CheckoutQuote.get(order.checkout_quote_id)
    : null;
  if (order.stripe_transfer_id && cq) {
    await ensureTransferReversal(svc, await svc.entities.Order.get(order.id), cq, cumulativeRefundedCents);
  }

  if (!full) {
    await raiseExceptionOnce(svc, {
      severity: "CRITICAL",
      exception_type: "partial_refund_review",
      order_id: order.id,
      buyer_id: order.buyer_id,
      vendor_id: order.vendor_id,
      payment_id: payment.id,
      reason: "A partial Stripe refund was confirmed for " + order.order_number + ".",
      technical_details_private: "refunded_cents=" + cumulativeRefundedCents + "; total_cents=" + totalCents,
      recommended_action: "Keep payout frozen and reconcile inventory, ledger, and remaining refundable balance.",
      requires_admin: true,
    });
    return { partialRefund: true, refundedAmountCents: cumulativeRefundedCents };
  }

  const refreshedOrder = await svc.entities.Order.get(order.id);
  if (!["refund_pending", "refunded"].includes(refreshedOrder.order_status)) {
    await transitionOrder(svc, order.id, "refund_pending", {
      type: "payment_provider",
      id: "stripe",
      description: "Stripe confirmed a full refund",
    });
  }
  return resumePendingRefund(svc, order.id, { type: "payment_provider", id: "stripe" });
}

export async function reconcileStripeRefund(svc, refund, source) {
  const order = await locateOrderForRefund(svc, refund);
  if (!order) return { ignored: true };
  assertStripeOrderMode(order, stripeModeFromObject(refund));
  const payments = await svc.entities.PaymentRecord.filter({ order_id: order.id });
  const payment = (payments || [])[0];
  if (!payment) throw new Error("No PaymentRecord matches the refunded order.");

  let charge;
  if (typeof refund.charge === "string") {
    charge = await stripeFetchForMode(order.commerce_mode, "/charges/" + refund.charge);
  } else if (refund.charge?.id) {
    charge = refund.charge;
  } else if (payment.transaction_ref?.startsWith("ch_")) {
    charge = await stripeFetchForMode(order.commerce_mode, "/charges/" + payment.transaction_ref);
  } else {
    throw new Error("Stripe refund has no charge for cumulative refund verification.");
  }
  assertStripeObjectMode(charge, order.commerce_mode);
  return reconcileChargeRefundTruth(svc, order, payment, charge, refund, source || "webhook");
}

export async function handleChargeRefunded(svc, charge) {
  let order = null;
  if (charge.payment_intent) {
    const orders = await svc.entities.Order.filter({ stripe_payment_intent_id: charge.payment_intent });
    order = (orders || [])[0];
  }
  if (!order && charge.metadata?.order_id) order = await svc.entities.Order.get(charge.metadata.order_id);
  if (!order) return { ignored: true };
  assertStripeOrderMode(order, stripeModeFromObject(charge));
  const payments = await svc.entities.PaymentRecord.filter({ order_id: order.id });
  const payment = (payments || [])[0];
  if (!payment) throw new Error("No PaymentRecord matches the refunded charge.");
  const refund = charge.refunds?.data?.slice(-1)?.[0] || {
    id: payment.provider_refund_id,
    status: "succeeded",
    amount: charge.amount_refunded,
  };
  return reconcileChargeRefundTruth(svc, order, payment, charge, refund, "charge.refunded");
}

// ---- Disputes: always freeze settlement until reviewed ----
async function locateOrderForDispute(svc, dispute) {
  if (dispute.payment_intent) {
    const orders = await svc.entities.Order.filter({ stripe_payment_intent_id: dispute.payment_intent });
    if (orders?.length) return orders[0];
  }
  if (dispute.charge) {
    const payments = await svc.entities.PaymentRecord.filter({ transaction_ref: dispute.charge });
    if (payments?.[0]?.order_id) return svc.entities.Order.get(payments[0].order_id);
  }
  if (dispute.metadata?.order_id) return svc.entities.Order.get(dispute.metadata.order_id);
  return null;
}

export async function handleDisputeEvent(svc, eventType, dispute) {
  const order = await locateOrderForDispute(svc, dispute);
  if (!order) return { ignored: true };
  assertStripeOrderMode(order, stripeModeFromObject(dispute));

  const status = dispute.status || eventType.replace("charge.dispute.", "");
  const payments = await svc.entities.PaymentRecord.filter({ order_id: order.id });
  const payment = (payments || [])[0];
  if (payment) {
    await svc.entities.PaymentRecord.update(payment.id, {
      status: "disputed",
      metadata: {
        ...(payment.metadata || {}),
        stripe_dispute_id: dispute.id,
        stripe_dispute_status: status,
        stripe_dispute_reason: dispute.reason || null,
        stripe_dispute_amount_cents: dispute.amount || null,
        stripe_dispute_event_type: eventType,
        stripe_dispute_updated_at: new Date().toISOString(),
      },
    });
  }

  await svc.entities.Order.update(order.id, {
    payment_status: "disputed",
    financial_hold: true,
    financial_hold_reason: "Stripe dispute " + status + ".",
    stripe_dispute_id: dispute.id,
    stripe_dispute_status: status,
  });
  const refreshed = await svc.entities.Order.get(order.id);
  if (!["disputed", "refunded", "cancelled"].includes(refreshed.order_status)) {
    try {
      await transitionOrder(svc, order.id, "disputed", {
        type: "payment_provider",
        id: "stripe",
        description: "Stripe dispute " + status,
      });
    } catch {
      // Financial hold still blocks payout even if the operational transition is unavailable.
    }
  }

  await raiseExceptionOnce(svc, {
    severity: "CRITICAL",
    exception_type: "stripe_dispute",
    order_id: order.id,
    buyer_id: order.buyer_id,
    vendor_id: order.vendor_id,
    payment_id: payment?.id,
    reason: "Stripe dispute " + status + " for " + order.order_number + ".",
    technical_details_private:
      "dispute=" + dispute.id + "; event=" + eventType +
      "; amount_cents=" + (dispute.amount || "unknown") +
      "; transfer=" + (order.stripe_transfer_id || "not_transferred"),
    recommended_action: order.stripe_transfer_id
      ? "Keep funds quarantined; assess transfer reversal/recovery and submit Stripe evidence."
      : "Keep settlement frozen and submit Stripe evidence.",
    requires_admin: true,
  });
  return { orderId: order.id, disputeId: dispute.id, status, frozen: true };
}

export async function handlePayoutEvent(svc, event) {
  const payout = event.data.object;
  const accountId = event.account;
  if (!accountId) return;
  const vendors = await svc.entities.VendorProfile.filter({ [vendorStripeField("stripe_account_id", stripeModeFromObject(event))]: accountId });
  const vendor = (vendors || [])[0];
  if (!vendor) return;
  if (event.type === "payout.failed") {
    await raiseExceptionOnce(svc, {
      severity: "ACTION_REQUIRED",
      exception_type: "stripe_payout_failed",
      vendor_id: vendor.id,
      reason: "Payout to " + vendor.business_name + " failed.",
      technical_details_private: "Payout id: " + payout.id,
      recommended_action: "Seller should check their Stripe dashboard.",
      requires_admin: false,
      status: "WAITING_ON_VENDOR",
    });
  } else if (event.type === "payout.paid") {
    await notifySafely(svc, {
      user_id: vendor.owner_id,
      type: "general",
      eventType: "stripe_payout_paid",
      title: "Payout sent",
      body: "Your Stripe payout has been sent.",
      reference_type: "vendor",
      reference_id: vendor.id,
      vendor_id: vendor.id,
    });
  }
}

// ---- Webhook signature verification ----
export async function verifyWebhookSignature(rawBody, sigHeader, mode = "live") {
  if (!sigHeader) return false;
  let timestamp = null;
  const signatures = [];
  for (const part of sigHeader.split(",")) {
    const [key, value] = part.split("=");
    if (key?.trim() === "t") timestamp = value?.trim();
    if (key?.trim() === "v1" && value) signatures.push(value.trim());
  }
  if (!timestamp || !signatures.length) return false;
  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) return false;
  if (Math.abs(Date.now() / 1000 - timestampNumber) > 300) return false;
  const secret = stripeWebhookSecret(mode);
  if (!secret) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const data = new TextEncoder().encode(timestamp + "." + rawBody);
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, data);
  const expected = [...new Uint8Array(signatureBuffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return signatures.some((signature) => {
    if (expected.length !== signature.length) return false;
    let mismatch = 0;
    for (let index = 0; index < expected.length; index++) {
      mismatch |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
    }
    return mismatch === 0;
  });
}
