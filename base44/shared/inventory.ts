// TreEbay order-level inventory authority.
//
// InventoryReservation is the RECORD OF TRUTH for every inventory movement.
// Product.quantity_available / quantity_reserved / quantity_sold are cached
// aggregate totals kept in sync from here — they are NEVER used for idempotency.
//
// Lifecycle: reserved -> committed (vendor confirms)
//            reserved -> released/expired (cancel, payment failure, expiry)
//            committed -> released (reversal when policy permits)
//
// Every operation below is idempotent: repeating it does not move stock twice.

export const RESERVATION_TTL_MINUTES = 30;

export function checkoutQuantity(cq) {
  return (cq?.items || []).reduce((s, i) => s + (i.quantity || 0), 0);
}

// Only direct-listing checkouts hold platform inventory. Accepted quotes rely on
// vendor-declared stock that TreEbay does not track as listing quantity.
export function checkoutHoldsInventory(cq) {
  return !!(cq && cq.source_type === "direct_listing" && cq.product_id);
}

async function reservationsForOrder(svc, orderId, productId) {
  const query = { order_id: orderId };
  if (productId) query.product_id = productId;
  const rows = await svc.entities.InventoryReservation.filter(query);
  return rows || [];
}

export async function getActiveReservation(svc, orderId, productId) {
  const rows = await reservationsForOrder(svc, orderId, productId);
  return rows.find((r) => r.status === "reserved") || null;
}

export async function getReservation(svc, orderId, productId) {
  const rows = await reservationsForOrder(svc, orderId, productId);
  return rows.find((r) => r.status === "reserved" || r.status === "committed") || rows[0] || null;
}

export function isReservationExpired(reservation) {
  return !!(reservation && reservation.expires_at && new Date(reservation.expires_at) < new Date());
}

export async function extendReservation(svc, reservationId, minutes) {
  return svc.entities.InventoryReservation.update(reservationId, {
    expires_at: new Date(Date.now() + (minutes || RESERVATION_TTL_MINUTES) * 60000).toISOString(),
  });
}

// ---- reserve: available -> reserved ----
// Idempotent per (order_id, product_id): an existing reserved/committed
// reservation short-circuits and NO additional stock is moved.
export async function reserveForOrder(svc, p) {
  const existing = await reservationsForOrder(svc, p.order_id, p.product_id);
  const active = existing.find((r) => r.status === "reserved" || r.status === "committed");
  if (active) return { reservation: active, created: false };

  const product = await svc.entities.Product.get(p.product_id);
  if (!product) throw new Error("Product not found");
  const available = product.quantity_available || 0;
  if (available < p.quantity) {
    throw new Error("Insufficient inventory: " + available + " available, " + p.quantity + " requested");
  }

  await svc.entities.Product.update(p.product_id, {
    quantity_available: available - p.quantity,
    quantity_reserved: (product.quantity_reserved || 0) + p.quantity,
  });

  const reservation = await svc.entities.InventoryReservation.create({
    order_id: p.order_id,
    checkout_quote_id: p.checkout_quote_id || null,
    product_id: p.product_id,
    buyer_id: p.buyer_id || null,
    vendor_id: p.vendor_id || null,
    quantity: p.quantity,
    status: "reserved",
    reserved_at: new Date().toISOString(),
    expires_at: p.expires_at || new Date(Date.now() + RESERVATION_TTL_MINUTES * 60000).toISOString(),
  });
  return { reservation, created: true };
}

// Reserve the inventory described by a CheckoutQuote for an Order.
export async function reserveForCheckout(svc, order, cq, expiresAt) {
  if (!checkoutHoldsInventory(cq)) return null;
  const { reservation } = await reserveForOrder(svc, {
    order_id: order.id, checkout_quote_id: cq.id, product_id: cq.product_id,
    buyer_id: order.buyer_id, vendor_id: order.vendor_id,
    quantity: checkoutQuantity(cq), expires_at: expiresAt,
  });
  return reservation;
}

// ---- release: reserved -> available ----
// Only `reserved` rows move. Never returns more units than the product actually
// holds as reserved, and never releases the same reservation twice.
export async function releaseForOrder(svc, orderId, reason, markExpired) {
  const rows = await reservationsForOrder(svc, orderId);
  let releasedQty = 0;
  for (const r of rows) {
    if (r.status !== "reserved") continue; // already released/committed/expired — no-op
    const product = await svc.entities.Product.get(r.product_id);
    if (product) {
      const reserved = product.quantity_reserved || 0;
      const qty = Math.min(r.quantity, reserved); // safety clamp
      const patch = {
        quantity_reserved: reserved - qty,
        quantity_available: (product.quantity_available || 0) + qty,
      };
      if (patch.quantity_available > 0 && product.listing_status === "sold_out") patch.listing_status = "active";
      await svc.entities.Product.update(r.product_id, patch);
      releasedQty += qty;
    }
    await svc.entities.InventoryReservation.update(r.id, {
      status: markExpired ? "expired" : "released",
      released_at: new Date().toISOString(),
      release_reason: reason || "",
    });
  }
  return releasedQty;
}

// ---- commit: reserved -> sold ----
// Throws if the product does not actually hold enough reserved units — the
// caller must surface that as a fulfillment exception, never swallow it.
export async function commitForOrder(svc, orderId) {
  const rows = await reservationsForOrder(svc, orderId);
  const pending = rows.filter((r) => r.status === "reserved");
  if (!pending.length) {
    return { committed: 0, alreadyCommitted: rows.some((r) => r.status === "committed") };
  }
  let committed = 0;
  for (const r of pending) {
    const product = await svc.entities.Product.get(r.product_id);
    if (!product) throw new Error("Product missing for reservation " + r.id);
    const reserved = product.quantity_reserved || 0;
    if (reserved < r.quantity) {
      throw new Error("Cannot commit " + r.quantity + " units — only " + reserved + " reserved on this listing.");
    }
    const patch = {
      quantity_reserved: reserved - r.quantity,
      quantity_sold: (product.quantity_sold || 0) + r.quantity,
    };
    if ((product.quantity_available || 0) === 0 && patch.quantity_reserved === 0) patch.listing_status = "sold_out";
    await svc.entities.Product.update(r.product_id, patch);
    await svc.entities.InventoryReservation.update(r.id, {
      status: "committed", committed_at: new Date().toISOString(),
    });
    committed += r.quantity;
  }
  return { committed, alreadyCommitted: false };
}

// ---- reverse a commit: sold -> available ----
// Never restores more units than were actually committed.
export async function reverseCommitForOrder(svc, orderId, reason) {
  const rows = await reservationsForOrder(svc, orderId);
  let reversed = 0;
  for (const r of rows) {
    if (r.status !== "committed") continue;
    const product = await svc.entities.Product.get(r.product_id);
    if (product) {
      const sold = product.quantity_sold || 0;
      const qty = Math.min(r.quantity, sold); // safety clamp
      const patch = {
        quantity_sold: sold - qty,
        quantity_available: (product.quantity_available || 0) + qty,
      };
      if (patch.quantity_available > 0) patch.listing_status = "active";
      await svc.entities.Product.update(r.product_id, patch);
      reversed += qty;
    }
    await svc.entities.InventoryReservation.update(r.id, {
      status: "released", released_at: new Date().toISOString(),
      release_reason: reason || "Reversed after vendor commit",
    });
  }
  return reversed;
}

// ---- refund inventory policy ----
// Explicit rules — inventory is NOT blindly moved on every refund.
//   before vendor confirmation (reserved)  -> release back to available
//   after confirmation, before delivery    -> reverse the commit (restock)
//   delivered / completed / settled        -> NO automatic restock (goods shipped)
export function refundInventoryAction(orderStatus) {
  const preConfirm = ["draft", "pricing_confirmed", "awaiting_payment", "payment_confirmed", "inventory_reserved", "payment_failed"];
  const preDelivery = ["vendor_confirmed", "preparing", "ready_for_pickup", "delivery_assigned", "picked_up", "in_transit", "fulfillment_exception"];
  if (preConfirm.includes(orderStatus)) return "release";
  if (preDelivery.includes(orderStatus)) return "reverse_commit";
  return "none"; // delivered and beyond — plants already handed over
}

export async function applyRefundInventoryPolicy(svc, order, reason) {
  const action = refundInventoryAction(order.order_status);
  if (action === "release") {
    const qty = await releaseForOrder(svc, order.id, reason || "Refund before vendor confirmation");
    return { action, quantity: qty };
  }
  if (action === "reverse_commit") {
    const qty = await reverseCommitForOrder(svc, order.id, reason || "Refund before delivery");
    return { action, quantity: qty };
  }
  return { action: "none", quantity: 0 };
}