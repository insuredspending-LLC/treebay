import { raiseExceptionOnce } from "./transactions.ts";

const TRANSIENT = ["reserving", "committing", "releasing", "reversing"];

function affectedCount(result) {
  if (typeof result === "number") return result;
  if (Array.isArray(result)) return result.length;
  return result?.updated ?? result?.updated_count ?? result?.modified_count ?? result?.modifiedCount ?? result?.matched_count ?? result?.count ?? 0;
}

async function fail(svc, reservation, reason) {
  await raiseExceptionOnce(svc, {
    severity: "CRITICAL", exception_type: "inventory_reconciliation_failed",
    order_id: reservation.order_id, buyer_id: reservation.buyer_id, vendor_id: reservation.vendor_id,
    reason, technical_details_private: reason,
    recommended_action: "Reconcile Product counters, CheckoutQuote inventory state, and the reservation before retrying.",
    requires_admin: true,
  });
  return { recovered: false, exception: true };
}

async function finalize(svc, reservation, checkout, status) {
  const fields = status === "committed"
    ? { status, committed_at: new Date().toISOString(), expires_at: null }
    : status === "reserved"
      ? { status, reserved_at: reservation.reserved_at || new Date().toISOString() }
      : { status, released_at: new Date().toISOString(), release_reason: reservation.release_reason || "Recovered interrupted inventory operation" };
  const result = await svc.entities.InventoryReservation.updateMany(
    { id: reservation.id, status: reservation.status }, { $set: fields },
  );
  if (!affectedCount(result)) return { recovered: false, raced: true };
  if (checkout) {
    await svc.entities.CheckoutQuote.updateMany(
      { id: checkout.id, inventory_status: { $in: [reservation.status, checkout.inventory_status] } },
      { $set: { inventory_status: status } },
    );
  }
  return { recovered: true, status };
}

export async function recoverStaleInventoryReservation(svc, reservation) {
  if (!TRANSIENT.includes(reservation.status)) return { recovered: false, skipped: true };
  const [product, checkout, order, productReservations] = await Promise.all([
    svc.entities.Product.get(reservation.product_id),
    reservation.checkout_quote_id ? svc.entities.CheckoutQuote.get(reservation.checkout_quote_id) : null,
    svc.entities.Order.get(reservation.order_id),
    svc.entities.InventoryReservation.filter({ product_id: reservation.product_id }),
  ]);
  if (!product || !checkout || !order) {
    return fail(svc, reservation, "Cannot recover transient reservation " + reservation.id + " because its Product, CheckoutQuote, or Order is missing.");
  }
  if (checkout.order_id && checkout.order_id !== order.id) {
    return fail(svc, reservation, "CheckoutQuote and InventoryReservation point to different Orders for reservation " + reservation.id + ".");
  }
  const otherTransient = (productReservations || []).find((r) => r.id !== reservation.id && TRANSIENT.includes(r.status));
  if (otherTransient) {
    return fail(svc, reservation, "Multiple transient operations affect Product " + product.id + "; automatic recovery is ambiguous.");
  }

  const quantity = reservation.quantity || 0;
  const otherReserved = (productReservations || []).filter((r) => r.id !== reservation.id && r.status === "reserved").reduce((sum, r) => sum + (r.quantity || 0), 0);
  const otherCommitted = (productReservations || []).filter((r) => r.id !== reservation.id && r.status === "committed").reduce((sum, r) => sum + (r.quantity || 0), 0);
  let moved = false;

  if (reservation.status === "reserving" && order.order_status === "awaiting_payment" && ["reserving", "reserved"].includes(checkout.inventory_status)) {
    if (product.quantity_reserved === otherReserved) {
      const result = await svc.entities.Product.updateMany(
        { id: product.id, quantity_available: { $gte: quantity }, quantity_reserved: otherReserved },
        { $inc: { quantity_available: -quantity, quantity_reserved: quantity } },
      );
      if (!affectedCount(result)) return fail(svc, reservation, "Product counters changed while recovering reservation " + reservation.id + ".");
      moved = true;
    } else if (product.quantity_reserved !== otherReserved + quantity) {
      return fail(svc, reservation, "Product reserved counters do not identify whether reservation " + reservation.id + " was applied.");
    }
    return { ...(await finalize(svc, reservation, checkout, "reserved")), moved };
  }

  if (reservation.status === "committing" && ["awaiting_payment", "payment_confirmed", "inventory_reserved"].includes(order.order_status) && ["reserved", "committing", "committed"].includes(checkout.inventory_status)) {
    if (product.quantity_reserved === otherReserved + quantity) {
      const result = await svc.entities.Product.updateMany(
        { id: product.id, quantity_reserved: { $gte: quantity }, physical_quantity: { $gte: quantity } },
        { $inc: { quantity_reserved: -quantity, physical_quantity: -quantity, quantity_sold: quantity } },
      );
      if (!affectedCount(result)) return fail(svc, reservation, "Product counters changed while recovering commit " + reservation.id + ".");
      moved = true;
    } else if (product.quantity_reserved !== otherReserved) {
      return fail(svc, reservation, "Product reserved counters do not identify whether commit " + reservation.id + " completed.");
    }
    return { ...(await finalize(svc, reservation, checkout, "committed")), moved };
  }

  if (reservation.status === "releasing" && ["awaiting_payment", "payment_failed", "cancelled", "refund_pending"].includes(order.order_status) && ["reserved", "releasing", "released"].includes(checkout.inventory_status)) {
    if (product.quantity_reserved === otherReserved + quantity) {
      const result = await svc.entities.Product.updateMany(
        { id: product.id, quantity_reserved: { $gte: quantity } },
        { $inc: { quantity_reserved: -quantity, quantity_available: quantity } },
      );
      if (!affectedCount(result)) return fail(svc, reservation, "Product counters changed while recovering release " + reservation.id + ".");
      moved = true;
    } else if (product.quantity_reserved !== otherReserved) {
      return fail(svc, reservation, "Product reserved counters do not identify whether release " + reservation.id + " completed.");
    }
    return { ...(await finalize(svc, reservation, checkout, "released")), moved };
  }

  if (reservation.status === "reversing" && ["inventory_reserved", "vendor_confirmed", "preparing", "ready_for_pickup", "delivery_assigned", "fulfillment_exception", "refund_pending", "cancelled"].includes(order.order_status) && ["committed", "reversing", "released"].includes(checkout.inventory_status)) {
    if (product.quantity_sold === otherCommitted + quantity) {
      const result = await svc.entities.Product.updateMany(
        { id: product.id, quantity_sold: { $gte: quantity } },
        { $inc: { quantity_sold: -quantity, physical_quantity: quantity, quantity_available: quantity } },
      );
      if (!affectedCount(result)) return fail(svc, reservation, "Product counters changed while recovering reversal " + reservation.id + ".");
      moved = true;
    } else if (product.quantity_sold !== otherCommitted) {
      return fail(svc, reservation, "Product sold counters do not identify whether reversal " + reservation.id + " completed.");
    }
    return { ...(await finalize(svc, reservation, checkout, "released")), moved };
  }

  return fail(svc, reservation, "Reservation " + reservation.id + " has a transient status inconsistent with its CheckoutQuote or Order state.");
}