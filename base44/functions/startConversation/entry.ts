import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { isBlocked } from "../../shared/marketplace.ts";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const type = body?.type;
    const referenceId = body?.referenceId;
    const vendorOwnerId = body?.vendorOwnerId;
    if (!type || !referenceId) return Response.json({ error: "type and referenceId required" }, { status: 400 });

    const svc = base44.asServiceRole;
    let buyerId, vOwnerId, vendorId, referenceLabel;

    if (type === "product") {
      const p = await svc.entities.Product.get(referenceId);
      if (!p) return Response.json({ error: "Product not found" }, { status: 404 });
      buyerId = user.id; vOwnerId = p.vendor_owner_id; vendorId = p.vendor_id; referenceLabel = p.common_name;
    } else if (type === "rfq") {
      const rfq = await svc.entities.RFQ.get(referenceId);
      if (!rfq) return Response.json({ error: "RFQ not found" }, { status: 404 });
      if (!vendorOwnerId) return Response.json({ error: "vendorOwnerId required for RFQ conversation" }, { status: 400 });
      const quotes = await svc.entities.VendorQuote.filter({ rfq_id: referenceId, vendor_owner_id: vendorOwnerId });
      if (!quotes || !quotes.length) return Response.json({ error: "Vendor has not quoted this RFQ" }, { status: 403 });
      buyerId = rfq.buyer_id; vOwnerId = vendorOwnerId; vendorId = (quotes[0] || {}).vendor_id; referenceLabel = `RFQ · ${rfq.delivery_city}`;
    } else if (type === "order") {
      const o = await svc.entities.Order.get(referenceId);
      if (!o) return Response.json({ error: "Order not found" }, { status: 404 });
      buyerId = o.buyer_id; vOwnerId = o.vendor_owner_id; vendorId = o.vendor_id; referenceLabel = o.order_number;
    } else {
      return Response.json({ error: "Invalid conversation type" }, { status: 400 });
    }

    if (user.id !== buyerId && user.id !== vOwnerId) return Response.json({ error: "Not authorized" }, { status: 403 });
    const recipientId = user.id === buyerId ? vOwnerId : buyerId;
    const blocked = await isBlocked(svc, user.id, recipientId);
    if (blocked) return Response.json({ error: "You can't message this user." }, { status: 403 });

    const existing = await svc.entities.Conversation.filter({ type, reference_id: referenceId, buyer_id: buyerId, vendor_owner_id: vOwnerId });
    if (existing && existing.length) return Response.json({ conversationId: existing[0].id });

    const conv = await svc.entities.Conversation.create({ type, reference_id: referenceId, reference_label: referenceLabel, buyer_id: buyerId, vendor_owner_id: vOwnerId, vendor_id: vendorId });
    return Response.json({ conversationId: conv.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}