import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  verifyWebhookSignature, syncVendorFromAccount, processLivePaymentSuccess,
  processLivePaymentFailure, handleChargeRefunded, handleDisputeCreated,
  handleTransferFailed, handlePayoutEvent,
} from "../../shared/stripe.ts";

// Stripe webhook endpoint. Signature-verified and idempotent (StripeEvent records).
// Handles account updates, payment success/failure, refunds, disputes, transfers, payouts.
export default async function(req) {
  try {
    const rawBody = await req.text();
    const sig = req.headers.get("stripe-signature");
    const ok = await verifyWebhookSignature(rawBody, sig);
    if (!ok) return Response.json({ error: "Invalid signature" }, { status: 400 });
    const event = JSON.parse(rawBody);
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;

    // Idempotency: skip already-processed events.
    const existing = await svc.entities.StripeEvent.filter({ event_id: event.id });
    if (existing && existing.length) return Response.json({ received: true, duplicate: true });

    let orderId = null, accountId = null;
    try {
      const obj = event.data && event.data.object;
      switch (event.type) {
        case "account.updated":
          accountId = obj.id;
          await syncVendorFromAccount(svc, obj.id, obj);
          break;
        case "checkout.session.completed":
          orderId = obj.metadata?.order_id;
          await processLivePaymentSuccess(svc, obj.id);
          break;
        case "checkout.session.expired":
          if (obj.metadata?.order_id) { orderId = obj.metadata.order_id; await processLivePaymentFailure(svc, orderId, "Checkout session expired"); }
          break;
        case "payment_intent.payment_failed":
          if (obj.metadata?.order_id) { orderId = obj.metadata.order_id; await processLivePaymentFailure(svc, orderId, obj.last_payment_error?.message || "Payment failed"); }
          break;
        case "charge.refunded":
          await handleChargeRefunded(svc, obj);
          orderId = obj.metadata?.order_id;
          break;
        case "charge.dispute.created":
          await handleDisputeCreated(svc, obj);
          orderId = obj.metadata?.order_id;
          break;
        case "transfer.failed":
          await handleTransferFailed(svc, obj);
          orderId = obj.metadata?.order_id;
          break;
        case "payout.paid":
        case "payout.failed":
          await handlePayoutEvent(svc, event);
          break;
        default:
          break;
      }
    } catch (handlerError) {
      console.error("stripeWebhook handler error:", event.type, handlerError.message);
    }

    await svc.entities.StripeEvent.create({
      event_id: event.id, event_type: event.type, processed_at: new Date().toISOString(),
      order_id: orderId, account_id: accountId, summary: event.type,
    });
    return Response.json({ received: true });
  } catch (error) {
    console.error("stripeWebhook error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}