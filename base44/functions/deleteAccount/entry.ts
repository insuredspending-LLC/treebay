import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const svc = base44.asServiceRole;
    const uid = user.id;

    // Seller identity is part of the financial audit trail. Refuse deletion before
    // changing anything when an order can still be paid, refunded, disputed, or settled.
    const vendorProfiles = await svc.entities.VendorProfile.filter({ owner_id: uid });
    const obligationOrders = [];
    const financiallyOpenPaymentStatuses = new Set(["authorized", "paid", "partially_refunded", "disputed"]);
    const financiallyOpenOrderStatuses = new Set([
      "awaiting_payment", "inventory_reserved", "vendor_confirmed", "preparing",
      "ready_for_pickup", "delivery_assigned", "picked_up", "in_transit", "delivered",
      "completed", "settlement_pending", "refund_pending", "disputed",
      "fulfillment_exception", "delivery_exception",
    ]);
    for (const vendor of (vendorProfiles || [])) {
      const orders = await svc.entities.Order.filter({ vendor_id: vendor.id }, "-created_date", 500);
      for (const order of (orders || [])) {
        if (
          financiallyOpenPaymentStatuses.has(order.payment_status) ||
          financiallyOpenOrderStatuses.has(order.order_status) ||
          order.financial_hold ||
          order.stripe_transfer_id
        ) {
          obligationOrders.push(order);
        }
      }
    }
    if (obligationOrders.length) {
      return Response.json({
        error: "This seller account cannot be deleted while financial obligations exist.",
        action: "Resolve or retain the related orders, refunds, disputes, transfers, and settlement records before requesting deletion.",
        blocking_orders: obligationOrders.slice(0, 20).map((order) => ({
          order_number: order.order_number,
          order_status: order.order_status,
          payment_status: order.payment_status,
        })),
        additional_blocking_orders: Math.max(0, obligationOrders.length - 20),
      }, { status: 409 });
    }

    const failures = [];

    const attempt = async (label, fn) => {
      try { await fn(); }
      catch (error) { failures.push({ step: label, error: error?.message || String(error) }); }
    };

    // Every operation is idempotent so a partially completed deletion can safely be retried.
    await attempt("archive_listings", () => svc.entities.Product.updateMany({ vendor_owner_id: uid }, { $set: { listing_status: "archived" } }));
    await attempt("delete_favorites", () => svc.entities.Favorite.deleteMany({ created_by_id: uid }));
    await attempt("delete_notifications", () => svc.entities.Notification.deleteMany({ user_id: uid }));
    await attempt("delete_blocks", () => svc.entities.UserBlock.deleteMany({ blocker_id: uid }));
    await attempt("delete_projects", () => svc.entities.Project.deleteMany({ created_by_id: uid }));
    await attempt("delete_buyer_profile", () => svc.entities.BuyerProfile.deleteMany({ created_by_id: uid }));
    await attempt("delete_vendor_profile", () => svc.entities.VendorProfile.deleteMany({ owner_id: uid }));
    await attempt("delete_carrier_profile", () => svc.entities.CarrierProfile.deleteMany({ owner_id: uid }));

    // Minimize directly displayed identity on retained records while preserving the records
    // required for transaction, fraud, dispute, tax, and legal history.
    await attempt("anonymize_message_display_name", () => svc.entities.Message.updateMany({ sender_id: uid }, { $set: { sender_name: "Deleted user" } }));
    await attempt("anonymize_review_display_name", () => svc.entities.Review.updateMany({ reviewer_id: uid }, { $set: { reviewer_name: "Deleted user" } }));

    // Disabling authentication is critical: never report deletion success if this fails.
    await attempt("disable_login", () => svc.entities.User.update(uid, { disabled: true }));

    if (failures.length) {
      return Response.json({
        error: "Account deletion was only partially completed. It is safe to retry.",
        failed_steps: failures.map((f) => f.step),
      }, { status: 500 });
    }

    return Response.json({
      ok: true,
      note: "Active marketplace profiles and personal app data removed; listings archived; auth account disabled. Required orders, reviews, messages, delivery details, and related transaction records may be retained for accounting, tax, fraud prevention, dispute handling, and legal compliance.",
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
