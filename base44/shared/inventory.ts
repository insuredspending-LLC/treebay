// Tree Marketplace order-level inventory authority.
// One InventoryReservation row is reused for the full Order/Product lifecycle.
// Product counter changes use guarded updateMany + $inc; lifecycle transitions use
// conditional status claims so retries cannot move stock twice.

export const RESERVATION_TTL_MINUTES = 30;

export function checkoutQuantity(cq) {
  return (cq?.items || []).reduce((s, i) => s + (i.quantity || 0), 0);
}

export function checkoutHoldsInventory(cq) {
  return !!(cq && cq.source_type === "direct_listing" && cq.product_id);
}

function affectedCount(result) {
  if (typeof result === "number") return result;
  if (Array.isArray(result)) return result.length;
  return result?.updated ?? result?.updated_count ?? result?.modified_count ?? result?.modifiedCount ?? result?.matched_count ?? result?.count ?? 0;
}

async function reservationsForOrder(svc, orderId, productId) {
  const query = { order_id: orderId };
  if (productId) query.product_id = productId;
  return await svc.entities.InventoryReservation.filter(query) || [];
}

async function setCheckoutInventoryState(svc, checkoutQuoteId, fromStates, toState) {
  if (!checkoutQuoteId) return 1;
  const result = await svc.entities.CheckoutQuote.updateMany(
    { id: checkoutQuoteId, inventory_status: { $in: fromStates } },
    { $set: { inventory_status: toState } },
  );
  return affectedCount(result);
}

async function raiseInventoryCritical(svc, p, reason) {
  const existing = await svc.entities.SystemException.filter({ order_id: p.order_id, exception_type: "inventory_reconciliation_failed" });
  if ((existing || []).some((e) => e.status !== "RESOLVED" && e.status !== "CLOSED")) return;
  await svc.entities.SystemException.create({
    severity: "CRITICAL", exception_type: "inventory_reconciliation_failed", order_id: p.order_id,
    buyer_id: p.buyer_id || null, vendor_id: p.vendor_id || null,
    reason, technical_details_private: reason,
    recommended_action: "Reconcile the Product counters and InventoryReservation before processing this order.",
    requires_admin: true, status: "ADMIN_REVIEW",
  });
}

export async function getActiveReservation(svc, orderId, productId) {
  const rows = await reservationsForOrder(svc, orderId, productId);
  return rows.find((r) => r.status === "reserved") || null;
}

export async function getReservation(svc, orderId, productId) {
  const rows = await reservationsForOrder(svc, orderId, productId);
  return rows[0] || null;
}

export function isReservationExpired(reservation) {
  return !!(reservation?.expires_at && new Date(reservation.expires_at) < new Date());
}

export async function extendReservation(svc, reservationId, minutes) {
  return svc.entities.InventoryReservation.update(reservationId, {
    expires_at: new Date(Date.now() + (minutes || RESERVATION_TTL_MINUTES) * 60000).toISOString(),
  });
}

export async function reserveForOrder(svc, p) {
  if (!Number.isInteger(p.quantity) || p.quantity < 1) throw new Error("Reservation quantity must be a positive whole number.");
  const rows = await reservationsForOrder(svc, p.order_id, p.product_id);
  const reservation = rows[0] || null;
  if (reservation && ["reserving", "reserved", "committing", "committed"].includes(reservation.status)) {
    return { reservation, created: false };
  }

  const priorCheckoutState = reservation ? "released" : "available";
  const claimed = await setCheckoutInventoryState(svc, p.checkout_quote_id, [priorCheckoutState], "reserving");
  if (!claimed) {
    const current = await getReservation(svc, p.order_id, p.product_id);
    if (current && ["reserving", "reserved", "committing", "committed"].includes(current.status)) return { reservation: current, created: false };
    throw new Error("Inventory reservation is already being processed for this order.");
  }

  const stockResult = await svc.entities.Product.updateMany(
    { id: p.product_id, quantity_available: { $gte: p.quantity } },
    { $inc: { quantity_available: -p.quantity, quantity_reserved: p.quantity } },
  );
  if (!affectedCount(stockResult)) {
    await setCheckoutInventoryState(svc, p.checkout_quote_id, ["reserving"], priorCheckoutState);
    throw new Error("Insufficient inventory for this reservation.");
  }

  try {
    const data = {
      checkout_quote_id: p.checkout_quote_id || null, buyer_id: p.buyer_id || null, vendor_id: p.vendor_id || null,
      quantity: p.quantity, status: "reserved", reserved_at: new Date().toISOString(), committed_at: null,
      released_at: null, release_reason: "",
      expires_at: p.expires_at || new Date(Date.now() + RESERVATION_TTL_MINUTES * 60000).toISOString(),
    };
    const saved = reservation
      ? await svc.entities.InventoryReservation.update(reservation.id, data)
      : await svc.entities.InventoryReservation.create({ order_id: p.order_id, product_id: p.product_id, ...data });
    await setCheckoutInventoryState(svc, p.checkout_quote_id, ["reserving"], "reserved");
    return { reservation: saved, created: !reservation };
  } catch (error) {
    const compensation = await svc.entities.Product.updateMany(
      { id: p.product_id, quantity_reserved: { $gte: p.quantity } },
      { $inc: { quantity_available: p.quantity, quantity_reserved: -p.quantity } },
    );
    await setCheckoutInventoryState(svc, p.checkout_quote_id, ["reserving"], priorCheckoutState);
    if (!affectedCount(compensation)) {
      await raiseInventoryCritical(svc, p, "Reservation record failed after stock was decremented, and automatic compensation also failed: " + error.message);
    }
    throw error;
  }
}

export async function reserveForCheckout(svc, order, cq, expiresAt) {
  if (!checkoutHoldsInventory(cq)) return null;
  return (await reserveForOrder(svc, {
    order_id: order.id, checkout_quote_id: cq.id, product_id: cq.product_id,
    buyer_id: order.buyer_id, vendor_id: order.vendor_id,
    quantity: checkoutQuantity(cq), expires_at: expiresAt,
  })).reservation;
}

export async function releaseForOrder(svc, orderId, reason, markExpired) {
  const rows = await reservationsForOrder(svc, orderId);
  let released = 0;
  for (const r of rows) {
    const claim = await svc.entities.InventoryReservation.updateMany({ id: r.id, status: "reserved" }, { $set: { status: "releasing" } });
    if (!affectedCount(claim)) continue;
    const moved = await svc.entities.Product.updateMany(
      { id: r.product_id, quantity_reserved: { $gte: r.quantity } },
      { $inc: { quantity_reserved: -r.quantity, quantity_available: r.quantity } },
    );
    if (!affectedCount(moved)) {
      await raiseInventoryCritical(svc, r, "Could not release reserved Product counters for reservation " + r.id);
      continue;
    }
    await svc.entities.InventoryReservation.update(r.id, {
      status: markExpired ? "expired" : "released", released_at: new Date().toISOString(), release_reason: reason || "",
    });
    await setCheckoutInventoryState(svc, r.checkout_quote_id, ["reserved", "releasing"], "released");
    released += r.quantity;
  }
  return released;
}

export async function commitForOrder(svc, orderId) {
  const rows = await reservationsForOrder(svc, orderId);
  const r = rows[0];
  if (!r) return { committed: 0, alreadyCommitted: false };
  if (r.status === "committed") return { committed: 0, alreadyCommitted: true };
  const claim = await svc.entities.InventoryReservation.updateMany({ id: r.id, status: "reserved" }, { $set: { status: "committing" } });
  if (!affectedCount(claim)) return { committed: 0, alreadyCommitted: ["committing", "committed"].includes(r.status) };
  const moved = await svc.entities.Product.updateMany(
    { id: r.product_id, quantity_reserved: { $gte: r.quantity }, physical_quantity: { $gte: r.quantity } },
    { $inc: { quantity_reserved: -r.quantity, physical_quantity: -r.quantity, quantity_sold: r.quantity } },
  );
  if (!affectedCount(moved)) {
    await raiseInventoryCritical(svc, r, "Could not commit Product counters for reservation " + r.id);
    throw new Error("Reserved inventory could not be committed safely.");
  }
  await svc.entities.InventoryReservation.update(r.id, { status: "committed", committed_at: new Date().toISOString(), expires_at: null });
  await setCheckoutInventoryState(svc, r.checkout_quote_id, ["reserved", "committing"], "committed");
  return { committed: r.quantity, alreadyCommitted: false };
}

export async function reverseCommitForOrder(svc, orderId, reason) {
  const rows = await reservationsForOrder(svc, orderId);
  const r = rows[0];
  if (!r) return 0;
  const claim = await svc.entities.InventoryReservation.updateMany({ id: r.id, status: "committed" }, { $set: { status: "reversing" } });
  if (!affectedCount(claim)) return 0;
  const moved = await svc.entities.Product.updateMany(
    { id: r.product_id, quantity_sold: { $gte: r.quantity } },
    { $inc: { quantity_sold: -r.quantity, physical_quantity: r.quantity, quantity_available: r.quantity } },
  );
  if (!affectedCount(moved)) {
    await raiseInventoryCritical(svc, r, "Could not reverse committed Product counters for reservation " + r.id);
    throw new Error("Committed inventory could not be reversed safely.");
  }
  await svc.entities.InventoryReservation.update(r.id, { status: "released", released_at: new Date().toISOString(), release_reason: reason || "Pre-pickup cancellation" });
  await setCheckoutInventoryState(svc, r.checkout_quote_id, ["committed", "reversing"], "released");
  return r.quantity;
}

export function refundInventoryAction(orderStatus) {
  const preConfirm = ["draft", "pricing_confirmed", "awaiting_payment", "payment_confirmed", "inventory_reserved", "payment_failed"];
  const prePickupCommitted = ["vendor_confirmed", "preparing", "ready_for_pickup", "delivery_assigned", "fulfillment_exception"];
  if (preConfirm.includes(orderStatus)) return "release";
  if (prePickupCommitted.includes(orderStatus)) return "reverse_commit";
  return "none";
}

export async function applyRefundInventoryPolicy(svc, order, reason) {
  const action = refundInventoryAction(order.order_status);
  if (action === "release") return { action, quantity: await releaseForOrder(svc, order.id, reason || "Refund before vendor confirmation") };
  if (action === "reverse_commit") return { action, quantity: await reverseCommitForOrder(svc, order.id, reason || "Refund before pickup") };
  return { action: "none", quantity: 0 };
}