import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  transitionOrder, createSettlementLedgerEntry, verifyAllocationForSettlement, rollbackExpiredRFQCheckout,
  hasBlockingException, closeDeliveryOptions, raiseExceptionOnce, updateShipmentStatus,
} from "../../shared/transactions.ts";
import { releaseForOrder, checkoutHoldsInventory } from "../../shared/inventory.ts";
import { recoverStaleInventoryReservation } from "../../shared/inventoryRecovery.ts";
import { generateAndStoreDocument } from "../../shared/documents.ts";
import { resumePendingRefund } from "../../shared/refunds.ts";
import { retryFreightAssignment } from "../../shared/freight.ts";
import { notifySafely } from "../../shared/notifications.ts";

// Single source of truth for all recurring transaction maintenance.
//
// AUTHORIZATION: privileged, service-role work. Every caller must authenticate as
// an admin; ordinary buyers/vendors and anonymous HTTP/workflow calls are refused.
//
// IDEMPOTENCY: every section is guarded by durable state —
//   inventory   -> InventoryReservation.status (released exactly once)
//   settlement  -> TransactionLedgerEntry.transaction_id group (written exactly once)
//   exceptions  -> raiseExceptionOnce (never stacks duplicates)
// Re-running after a partial failure continues safely instead of duplicating.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);

    let caller;
    try {
      caller = await base44.auth.me();
    } catch {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }
    if (!caller) return Response.json({ error: "Authentication required." }, { status: 401 });
    if (caller.role !== "admin") {
      return Response.json({ error: "Transaction maintenance is restricted to administrators." }, { status: 403 });
    }
    const actorId = caller.id;

    const svc = base44.asServiceRole;
    const now = new Date();
    const staleCutoff = new Date(now.getTime() - 5 * 60000);
    let released = 0, escalated = 0, completed = 0, settled = 0, reminders = 0, rolledBack = 0, refundsRecovered = 0;
    let checkoutLocksRecovered = 0, inventoryTransientsRecovered = 0, inventoryExceptions = 0;
    let freightAssigned = 0, freightFailed = 0;

    // ---- 1. Recover stale CheckoutQuote order-creation locks ----
    const consumingQuotes = await svc.entities.CheckoutQuote.filter({ processing_status: "consuming" }, "-processing_locked_at", 200);
    for (const cq of (consumingQuotes || [])) {
      const linkedOrders = await svc.entities.Order.filter({ checkout_quote_id: cq.id });
      const referencedOrders = cq.order_id ? await svc.entities.Order.filter({ id: cq.order_id }) : [];
      const candidates = [...new Map([...(linkedOrders || []), ...(referencedOrders || [])].map((o) => [o.id, o])).values()];
      const valid = candidates.filter((o) => o.checkout_quote_id === cq.id);
      const inconsistentReference = candidates.some((o) => o.checkout_quote_id !== cq.id);

      if (valid.length === 1 && !inconsistentReference) {
        const result = await svc.entities.CheckoutQuote.updateMany(
          { id: cq.id, processing_status: "consuming" },
          { $set: { processing_status: "consumed", pricing_status: "consumed", order_id: valid[0].id } },
        );
        const count = typeof result === "number" ? result : Array.isArray(result) ? result.length : (result?.updated ?? result?.updated_count ?? result?.modified_count ?? result?.modifiedCount ?? result?.matched_count ?? result?.count ?? 0);
        if (count) checkoutLocksRecovered++;
        continue;
      }

      if (valid.length > 1 || inconsistentReference || !cq.processing_locked_at || Number.isNaN(new Date(cq.processing_locked_at).getTime())) {
        await raiseExceptionOnce(svc, {
          severity: "CRITICAL", exception_type: "checkout_lock_recovery_failed", order_id: cq.order_id || cq.id,
          buyer_id: cq.buyer_id, vendor_id: cq.vendor_id,
          reason: "CheckoutQuote " + cq.id + " has an ambiguous consuming lock and was not reset.",
          technical_details_private: "Candidate order count: " + candidates.length + "; processing_locked_at: " + (cq.processing_locked_at || "missing"),
          recommended_action: "Inspect the CheckoutQuote and linked Orders before changing the processing lock.", requires_admin: true,
        });
        continue;
      }

      if (new Date(cq.processing_locked_at) > staleCutoff) continue;
      const result = await svc.entities.CheckoutQuote.updateMany(
        { id: cq.id, processing_status: "consuming", processing_locked_at: cq.processing_locked_at },
        { $set: { processing_status: "available", processing_locked_at: null } },
      );
      const count = typeof result === "number" ? result : Array.isArray(result) ? result.length : (result?.updated ?? result?.updated_count ?? result?.modified_count ?? result?.modifiedCount ?? result?.matched_count ?? result?.count ?? 0);
      if (count) checkoutLocksRecovered++;
    }

    // ---- 2. Recover stale transient inventory operations without guessing ----
    for (const status of ["reserving", "committing", "releasing", "reversing"]) {
      const rows = await svc.entities.InventoryReservation.filter({ status }, "-updated_date", 200);
      for (const reservation of (rows || [])) {
        if (!reservation.updated_date || new Date(reservation.updated_date) > staleCutoff) continue;
        const recovery = await recoverStaleInventoryReservation(svc, reservation);
        if (recovery.recovered) inventoryTransientsRecovered++;
        if (recovery.exception) inventoryExceptions++;
      }
    }

    // ---- 3. Release expired reservations (awaiting_payment past expiry) ----
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

    // ---- 4. Resume staged refunds across ALL legitimate partial states. The helper
    //         is idempotent and leaves failures pending. Recoverable combinations:
    //         A. Order refund_pending + Payment not fully finalized
    //         B. Order refund_pending + PaymentRecord refunded/full
    //         C. Order refunded       + PaymentRecord not yet refunded/full
    //         A completely reconciled Order=refunded + Payment=refunded/full is NOT reprocessed. ----
    const refundCandidates = [
      ...((await svc.entities.Order.filter({ order_status: "refund_pending" }, "-created_date", 100)) || []),
      ...((await svc.entities.Order.filter({ order_status: "refunded" }, "-created_date", 100)) || []),
    ];
    for (const order of refundCandidates) {
      try {
        const payments = await svc.entities.PaymentRecord.filter({ order_id: order.id });
        const payment = (payments || [])[0];
        // Skip a completely reconciled transaction — nothing to recover.
        if (order.order_status === "refunded" && payment && payment.status === "refunded" && payment.refund_status === "full") continue;
        await resumePendingRefund(svc, order.id, { type: "system", id: actorId });
        refundsRecovered++;
      } catch {
        // resumePendingRefund records the CRITICAL reconciliation exception.
      }
    }

    // ---- 5. THE SYSTEM owns completion: delivered -> completed ----
    const delivered = await svc.entities.Order.filter({ order_status: "delivered" }, "-created_date", 100);
    for (const order of (delivered || [])) {
      if (order.payment_status !== "paid") continue;
      if (await hasBlockingException(svc, order.id)) continue;
      // Delivery must actually be recorded (shipment delivered/confirmed, or pickup).
      const shipments = await svc.entities.Shipment.filter({ order_id: order.id });
      const isPickup = order.fulfillment_method === "buyer_pickup" || order.fulfillment_method === "pickup";
      const shipmentOk = isPickup || ((shipments || []).length > 0 &&
        (shipments || []).every((s) => ["delivered", "confirmed"].includes(s.shipment_status)));
      if (!shipmentOk) continue;
      await transitionOrder(svc, order.id, "completed", { type: "system", id: actorId, description: "Auto-completed after delivery" });
      await svc.entities.Order.update(order.id, { completed_at: new Date().toISOString() });
      for (const s of (shipments || [])) {
        if (s.shipment_status === "delivered") {
          await updateShipmentStatus(svc, s.id, "confirmed", { type: "system", id: actorId, description: "Shipment confirmed during automatic completion" });
          await svc.entities.Shipment.update(s.id, { buyer_confirmed: true });
        }
      }
      completed++;
    }

    // ---- 4b. Retry freight assignment for orders stuck without a carrier ----
    const freightResult = await retryFreightAssignment(svc);
    freightAssigned = freightResult.assigned;
    freightFailed = freightResult.failed;

    // ---- 5. Settlement (TEST) — process `completed` AND `settlement_pending` so a
    //         partially-failed settlement resumes instead of getting stuck. ----
    const settleable = [
      ...(await svc.entities.Order.filter({ order_status: "completed" }, "-created_date", 100) || []),
      ...(await svc.entities.Order.filter({ order_status: "settlement_pending" }, "-created_date", 100) || []),
    ];
    for (const order of settleable) {
      try {
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
        await verifyAllocationForSettlement(svc, order, cq);
        if (order.order_status === "completed") {
          await transitionOrder(svc, order.id, "settlement_pending", { type: "system", id: actorId, description: "Settlement prepared after financial reconciliation" });
        }
        // Idempotent: the settlement ledger group is written at most once.
        await createSettlementLedgerEntry(svc, order, cq);
        await generateAndStoreDocument(svc, order, "vendor_settlement_statement", cq);
        // Carrier settlement statement + notification (only for third_party_carrier)
        if (cq.delivery_method === "third_party_carrier") {
          const shipRows = await svc.entities.Shipment.filter({ order_id: order.id });
          const sh = (shipRows || [])[0];
          if (sh && sh.carrier_id && sh.freight_quote_id) {
            const carrier = await svc.entities.CarrierProfile.get(sh.carrier_id);
            const freightQuote = await svc.entities.FreightQuote.get(sh.freight_quote_id);
            await generateAndStoreDocument(svc, order, "carrier_settlement_statement", cq, { freightQuote, carrier });
            await notifySafely(svc, { user_id: carrier?.created_by_id, type: "general", eventType: "carrier_settlement", title: "Freight settlement statement ready", body: order.order_number, reference_type: "order", reference_id: order.id, order_id: order.id, carrier_id: sh.carrier_id, buyer_id: order.buyer_id, vendor_id: order.vendor_id });
          }
        }
        await notifySafely(svc, { user_id: order.vendor_owner_id, type: "general", eventType: "vendor_settlement", title: "Settlement statement ready", body: order.order_number, reference_type: "order", reference_id: order.id, order_id: order.id, buyer_id: order.buyer_id, vendor_id: order.vendor_id });
        await transitionOrder(svc, order.id, "settled", { type: "system", id: actorId, description: "Settled (TEST)" });
        settled++;
      } catch (err) {
        await raiseExceptionOnce(svc, {
          severity: err.message?.startsWith("Financial reconciliation:") ? "CRITICAL" : "ACTION_REQUIRED",
          exception_type: err.message?.startsWith("Financial reconciliation:") ? "financial_reconciliation" : "settlement_failed", order_id: order.id,
          buyer_id: order.buyer_id, vendor_id: order.vendor_id,
          reason: "Settlement failed for " + order.order_number + ": " + err.message,
          technical_details_private: err.message,
          recommended_action: "Re-run maintenance after resolving the underlying issue.", requires_admin: true,
        });
      }
    }

    return Response.json({ released, escalated, completed, settled, reminders, rolledBack, refundsRecovered, checkoutLocksRecovered, inventoryTransientsRecovered, inventoryExceptions, freightAssigned, freightFailed, ranBy: actorId });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}