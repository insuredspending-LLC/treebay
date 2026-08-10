import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const orderId = body?.orderId;
    const rating = Number(body?.rating);
    const reviewText = (body?.reviewText || "").trim();
    if (!orderId) return Response.json({ error: "Order id required" }, { status: 400 });
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return Response.json({ error: "Rating must be 1-5" }, { status: 400 });

    const svc = base44.asServiceRole;
    const order = await svc.entities.Order.get(orderId);
    if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
    if (order.buyer_id !== user.id) return Response.json({ error: "Only the buyer can review this order." }, { status: 403 });
    if (order.order_status !== "completed") return Response.json({ error: "Only completed orders can be reviewed." }, { status: 400 });

    const existing = await svc.entities.Review.filter({ order_id: orderId, reviewer_id: user.id });
    if (existing && existing.length) return Response.json({ error: "You have already reviewed this order." }, { status: 409 });

    const review = await svc.entities.Review.create({ order_id: orderId, reviewer_id: user.id, reviewer_name: user.full_name || user.email, vendor_id: order.vendor_id, rating, review_text: reviewText });

    const all = await svc.entities.Review.filter({ vendor_id: order.vendor_id }, "-created_date", 500);
    const avg = all.reduce((s, r) => s + (r.rating || 0), 0) / Math.max(1, all.length);
    await svc.entities.VendorProfile.update(order.vendor_id, { rating: Math.round(avg * 10) / 10, review_count: all.length });

    return Response.json({ review });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}