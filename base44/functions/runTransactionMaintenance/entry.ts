import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  transitionOrder, createSettlementLedgerEntry, rollbackExpiredRFQCheckout,
  hasBlockingException, closeDeliveryOptions, raiseExceptionOnce,
} from "../../shared/transactions.ts";
import { releaseForOrder, checkoutHoldsInventory } from "../../shared/inventory.ts";
import { generateAndStoreDocument } from "../../shared/documents.ts";

// Single source of truth for all recurring transaction maintenance.
//
// AUTHORIZATION: privileged, service-role work. Any authenticated caller must be
// an admin; ordinary buyers/vendors are refused. Unauthenticated calls are only
// possible from the platform's scheduled workflow execution context.
//
// IDEMPOTENCY: every section is guarded by durable state —
//   inventory   -> InventoryReservation.status (released exactly once)
//   settlement  -> TransactionLedgerEntry.transaction_id group (written exactly once)
//   exceptions  -> raiseExceptionOnce (never stacks duplicates)
// Re-running after a partial failure continues safely instead of duplicating.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);

    let caller = null;
    try { caller = await base44.auth.me(); } catch { caller = null; }
    if (caller && caller.role !== "admin") {
      return Response.json({ error: "Transaction maintenance is restricted to administrators." }, { status: 403 });
    }
    const actorId = caller ? caller.id : "scheduled_workflow";

    const svc = base44.asServiceRole;
    const now = new Date();
    let released = 0, escalated = 0, completed = 0, settled = 0, reminders = 0, rolledBack = 0;

    // ---- 1. Release expired reservations (awaiting_payment past expiry) ----
    const awaiting = await svc.entities.Order.filter({ order_status: "awaiting_payment" }, "-created_date", 200);
    for (const order of (awaiting || [])) {
      if (!order.reservation_expires_at || new Date(order.reservation_expires_at) > now) continue;
      const cq = order.checkout_quote_id ? await svc.entities.CheckoutQuote.get(order.checkout_quote_id) : null;
      // Idempotent: only reservations still in `reserved` move.
      if (checkoutHoldsInventory(cq)) {
        const qty = await releaseForOrder(svc, order.id, "Reservation expired — payment not received", true);
        if (qty > 0) released++;
      }
      if (cq && cq.source_type === "accepted_quote") {
        await rollbackExpiredRFQCheckout(svc, cq);
        rolledBack++;
      }
      await transitionOrder(svc, order.id, "cancelled", { type: "system", id: actorId, description: "Reservation expired - payment not received" });
    }

    // ---- 2. Roll back expired CheckoutQuotes that never produced an order ----
    const draftQuotes = await svc.entities.CheckoutQuote.filter({ pricing_status: "draft" }, "-created_date", 200);
    for (const cq of (draftQuotes || [])) {
      if (!cq.expiration_at || new Date(cq.expiration_at) > now) continue;
      if (cq.order_id) continue;
      if (cq.source_type === "accepted_quote") {
        await rollbackExpiredRFQCheckout(svc, cq);
        rolledBack++;
      } else {
        await svc.entities.CheckoutQuote.update(cq.id, { pricing_status: "expired" });
        await closeDeliveryOptions(svc, cq.id);
      }
    }

    // ---- 3. Vendor confirmation reminders + escalation ----
    const reserved = await svc.entities.Order.filter({ order_status: "inventory_reserved" }, "-created_date", 200);
    for (const order of (reserved || [])) {
      if (!order.vendor_confirm_deadline) continue;
      const deadline = new Date(order.vendor_confirm_deadline);
      const excs = await svc.entities.SystemException.filter({ order_id: order.id, exception_type: "vendor_confirmation_reminder" });
      const exc = (excs || []).find((e) => e.status !== "RESOLVED" && e.status !== "CLOSED");
      if (!exc) continue;

      if (now >= deadline) {
        if (exc.status !== "ADMIN_REVIEW") {
          await svc.entities.SystemException.update(exc.id, {
            severity: "ACTION_REQUIRED", status: "ADMIN_REVIEW", requires_admin: true,
            reason: "Vendor did not confirm " + order.order_number + " before the deadline",
            recommended_action: "Contact vendor or cancel fulfillment.",
          });
          escalated++;
        }
      } else if (exc.next_retry_at && now >= new Date(exc.next_retry_at) && exc.retry_count < exc.max_retries) {
        await svc.entities.Notification.create({
          user_id: order.vendor_owner_id, type: "general",
          title: "Reminder: Please confirm order " + order.order_number,
          body: "Confirmation deadline: " + deadline.toLocaleString(),
          reference_type: "order", reference_id: order.id, read: false,
        });
        const nextRetry = new Date(deadline.getTime() - (exc.max_retries - exc.retry_count - 1) * 4 * 3600000);
        await svc.entities.SystemException.update(exc.id, {
          retry_count: exc.retry_count + 1, next_retry_at: nextRetry.toISOString(),
        });
        reminders++;
      }
    }

    // ---- 4. THE SYSTEM owns completion: delivered -> completed ----
    const delivered = await svc.entities.Order.filter({ order_status: "delivered" }, "-created_date", 100);
    for (const order of (delivered || [])) {
      if (order.payment_status !== "paid") continue;
      if (await hasBlockingException(svc, order.id)) continue;
      // Delivery must actually be recorded (shipment delivered/confirmed, or pickup).
      const shipments = await svc.entities.Shipment.filter({ order_id: order.id });
      const isPickup = order.fulfillment_method === "buyer_pickup" || order.fulfillment_method === "pickup";
      const shipmentOk = isPickup || !(shipments || []).length ||
        (shipments || []).every((s) => ["delivered", "confirmed"].includes(s.shipment_status));
      if (!shipmentOk) continue;
      await transitionOrder(svc, order.id, "completed", { type: "system", id: actorId, description: "Auto-completed after delivery" });
      await svc.entities.Order.update(order.id, { completed_at: new Date().toISOString() });
      for (const s of (shipments || [])) {
        if (s.shipment_status === "delivered") {
          await svc.entities.Shipment.update(s.id, { shipment_status: "confirmed", buyer_confirmed: true });
        }
      }
      completed++;
    }

    // ---- 5. Settlement (TEST) — process `completed` AND `settlement_pending` so a
    //         partially-failed settlement resumes instead of getting stuck. ----
    const settleable = [
      ...(await svc.entities.Order.filter({ order_status: "completed" }, "-created_date", 100) || []),
      ...(await svc.entities.Order.filter({ order_status: "settlement_pending" }, "-created_date", 100) || []),
    ];
    for (const order of settleable) {
      try {
        if (order.order_status === "completed") {
          await transitionOrder(svc, order.id, "settlement_pending", { type: "system", id: actorId, description: "Settlement prepared" });
        }
        const cq = order.checkout_quote_id ? await svc.entities.CheckoutQuote.get(order.checkout_quote_id) : null;
        if (!cq) {
          await raiseExceptionOnce(svc, {
            severity: "ACTION_REQUIRED", exception_type: "settlement_failed", order_id: order.id,
            buyer_id: order.buyer_id, vendor_id: order.vendor_id,
            reason: "Cannot settle " + order.order_number + " — no pricing snapshot found.",
            recommended_action: "Investigate the order's checkout quote.", requires_admin: true,
          });
          continue;
        }
        // Idempotent: the settlement ledger group is written at most once.
        await createSettlementLedgerEntry(svc, order, cq);
        await generateAndStoreDocument(svc, order, "vendor_settlement_statement", cq);
        await transitionOrder(svc, order.id, "settled", { type: "system", id: actorId, description: "Settled (TEST)" });
        settled++;
      } catch (err) {
        await raiseExceptionOnce(svc, {
          severity: "ACTION_REQUIRED", exception_type: "settlement_failed", order_id: order.id,
          buyer_id: order.buyer_id, vendor_id: order.vendor_id,
          reason: "Settlement failed for " + order.order_number + ": " + err.message,
          technical_details_private: err.message,
          recommended_action: "Re-run maintenance after resolving the underlying issue.", requires_admin: true,
        });
      }
    }

    return Response.json({ released, escalated, completed, settled, reminders, rolledBack, ranBy: actorId });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}