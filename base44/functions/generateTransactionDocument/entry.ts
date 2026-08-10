import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { generateAndStoreDocument } from "../../shared/documents.ts";

// Generate (or regenerate) a transaction document for an order.
// Admin-only: used to produce printable invoices, receipts, manifests, settlement statements.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const orderId = body?.orderId;
    const documentType = body?.documentType;
    if (!orderId || !documentType) return Response.json({ error: "orderId and documentType required" }, { status: 400 });
    const svc = base44.asServiceRole;
    const order = await svc.entities.Order.get(orderId);
    if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
    // Only the buyer, vendor, or admin can generate documents.
    const isBuyer = order.buyer_id === user.id;
    const isVendor = order.vendor_owner_id === user.id;
    const isAdmin = user.role === "admin";
    if (!isBuyer && !isVendor && !isAdmin) return Response.json({ error: "Not authorized" }, { status: 403 });
    const cq = order.checkout_quote_id ? await svc.entities.CheckoutQuote.get(order.checkout_quote_id) : null;
    let shipment = null;
    if (body.shipmentId) {
      try { shipment = await svc.entities.Shipment.get(body.shipmentId); } catch {}
    } else {
      const shipments = await svc.entities.Shipment.filter({ order_id: orderId });
      shipment = (shipments || [])[0] || null;
    }
    let payment = null;
    const payments = await svc.entities.PaymentRecord.filter({ order_id: orderId });
    payment = (payments || [])[0] || null;
    const doc = await generateAndStoreDocument(svc, order, documentType, cq, { shipment, payment });
    return Response.json({ document: doc });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}