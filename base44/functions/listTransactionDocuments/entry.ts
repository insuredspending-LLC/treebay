import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Securely list transaction documents for an order.
// Only the buyer, vendor, or admin can access documents for a given order.
// Filters by recipient_type so buyers see buyer-facing docs and vendors see vendor-facing docs.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const orderId = body?.orderId;
    if (!orderId) return Response.json({ error: "orderId required" }, { status: 400 });
    const svc = base44.asServiceRole;
    const order = await svc.entities.Order.get(orderId);
    if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
    const isBuyer = order.buyer_id === user.id;
    const isVendor = order.vendor_owner_id === user.id;
    const isAdmin = user.role === "admin";
    if (!isBuyer && !isVendor && !isAdmin) return Response.json({ error: "Not authorized" }, { status: 403 });
    const docs = await svc.entities.TransactionDocument.filter({ order_id: orderId }, "created_date", 50);
    // Non-admins only see documents addressed to them.
    const filtered = (docs || []).filter((d) => {
      if (isAdmin) return true;
      if (isBuyer) return d.recipient_type === "buyer";
      if (isVendor) return d.recipient_type === "vendor";
      return false;
    });
    return Response.json({ documents: filtered });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}