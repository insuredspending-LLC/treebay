import { stripeModeFromObject } from "../../shared/stripeMode.ts";
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  verifyWebhookSignature, stripeEventMatchesKeyMode, syncVendorFromAccount,
  processLivePaymentSuccess, processLivePaymentFailure, reconcileStripeRefund,
  handleChargeRefunded, handleDisputeEvent, handlePayoutEvent,
} from "../../shared/stripe.ts";

// Signature-verified, idempotent Stripe webhook. An event is recorded only after its
// handler succeeds so Stripe retries incomplete financial reconciliation.
export default async function(req) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("stripe-signature");
    const event = JSON.parse(rawBody);
    const mode = stripeModeFromObject(event);
    if (!(await verifyWebhookSignature(rawBody, signature, mode))) {
      return Response.json({ error: "Invalid signature" }, { status: 400 });
    }

    if (!stripeEventMatchesKeyMode(event)) {
      return Response.json({ error: "Stripe event mode does not match the configured key." }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;
    const existing = await svc.entities.StripeEvent.filter({ event_id: event.id });
    if (existing?.length) return Response.json({ received: true, duplicate: true });

    const object = event.data?.object;
    let orderId = object?.metadata?.order_id || null;
    let accountId = event.account || null;
    let summary = event.type;

    switch (event.type) {
      case "account.updated":
        accountId = event.account || object.id;
        await syncVendorFromAccount(svc, object.id, object, mode);
        break;
      case "checkout.session.completed": {
        const result = await processLivePaymentSuccess(svc, object.id, event.id, mode);
        orderId = result?.orderId || orderId;
        summary = result?.quarantined ? "paid stale attempt quarantined" : "payment reconciled";
        break;
      }
      case "checkout.session.expired":
        await processLivePaymentFailure(svc, {
          commerceMode: mode,
          orderId,
          sessionId: object.id,
          reason: "Checkout session expired",
          providerStatus: object.status,
          terminal: true,
          eventId: event.id,
        });
        break;
      case "payment_intent.payment_failed":
        await processLivePaymentFailure(svc, {
          commerceMode: mode,
          orderId,
          paymentIntentId: object.id,
          reason: object.last_payment_error?.message || "PaymentIntent failed",
          providerStatus: object.status,
          terminal: false,
          eventId: event.id,
        });
        break;
      case "refund.created":
      case "refund.updated":
      case "refund.failed": {
        const result = await reconcileStripeRefund(svc, object, event.type);
        orderId = result?.order?.id || orderId;
        break;
      }
      case "charge.refunded": {
        const result = await handleChargeRefunded(svc, object);
        orderId = result?.order?.id || orderId || object.metadata?.order_id;
        break;
      }
      case "charge.dispute.created":
      case "charge.dispute.updated":
      case "charge.dispute.closed":
      case "charge.dispute.funds_withdrawn":
      case "charge.dispute.funds_reinstated": {
        const result = await handleDisputeEvent(svc, event.type, object);
        orderId = result?.orderId || orderId;
        summary = "dispute " + (result?.status || object.status || event.type);
        break;
      }
      case "payout.paid":
      case "payout.failed":
        await handlePayoutEvent(svc, event);
        break;
      default:
        break;
    }

    await svc.entities.StripeEvent.create({
      event_id: event.id,
      event_type: event.type,
      processed_at: new Date().toISOString(),
      order_id: orderId,
      account_id: accountId,
      summary,
    });
    return Response.json({ received: true });
  } catch (error) {
    console.error("stripeWebhook error:", error.message);
    return Response.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
