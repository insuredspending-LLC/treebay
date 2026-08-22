// Tree Marketplace reliable commercial notification helper.
// A notification failure must NEVER make a commercial action appear to have failed
// after the commercial state already changed.
//
// Usage: await notifySafely(svc, { user_id, type, title, body, reference_type, reference_id,
//   order_id, buyer_id, vendor_id, carrier_id, eventType });
//
// Behavior:
//   - Bounded retry (3 attempts)
//   - Never throws after the commercial action has committed
//   - On ultimate failure, creates a SystemException (notification_delivery_failed)
//   - requires_admin: true only when automatic retry cannot recover it

import { raiseExceptionOnce } from "./transactions.ts";

export async function notifySafely(svc, p) {
  let ok = false;
  let lastErr = null;
  for (let attempt = 0; attempt < 3 && !ok; attempt++) {
    try {
      await svc.entities.Notification.create({
        user_id: p.user_id,
        type: p.type,
        title: p.title || "",
        body: p.body || "",
        reference_type: p.reference_type || null,
        reference_id: p.reference_id || null,
        read: false,
      });
      ok = true;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!ok) {
    await raiseExceptionOnce(svc, {
      severity: "ACTION_REQUIRED",
      exception_type: "notification_delivery_failed",
      order_id: p.order_id || null,
      shipment_id: p.shipment_id || null,
      buyer_id: p.buyer_id || null,
      vendor_id: p.vendor_id || null,
      carrier_id: p.carrier_id || null,
      reason: "Notification delivery failed (" + (p.eventType || p.type) + ") for user " + p.user_id,
      technical_details_private: "Event: " + (p.eventType || p.type) + ", Error: " + (lastErr?.message || "unknown"),
      recommended_action: "Review notification delivery. Commercial state was NOT rolled back.",
      requires_admin: true,
      status: "ADMIN_REVIEW",
    });
  }
  return { delivered: ok };
}