import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { isBlocked, isPublicMarketplaceProduct, isPublicMarketplaceVendor } from "../../shared/marketplace.ts";

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const { type, referenceId, vendorOwnerId } = await req.json();
    if (!type || !referenceId) return Response.json({ error: "type and referenceId required" }, { status: 400 });
    const svc = base44.asServiceRole;
    let buyerId;
    let vOwnerId;
    let vendorId;
    let referenceLabel;

    if (type === "product") {
      const product = await svc.entities.Product.get(referenceId);
      if (!isPublicMarketplaceProduct(product)) return Response.json({ error: "Product not found" }, { status: 404 });
      buyerId = user.id; vOwnerId = product.vendor_owner_id; vendorId = product.vendor_id; referenceLabel = product.common_name;
    } else if (type === "general") {
      let vendor;
      try { vendor = await svc.entities.VendorProfile.get(referenceId); } catch { return Response.json({ error: "Vendor not found" }, { status: 404 }); }
      if (!isPublicMarketplaceVendor(vendor)) return Response.json({ error: "Vendor not found" }, { status: 404 });
      buyerId = user.id; vOwnerId = vendor.owner_id; vendorId = vendor.id; referenceLabel = vendor.business_name;
    } else if (type === "rfq") {
      const rfq = await svc.entities.RFQ.get(referenceId);
      if (!rfq || !vendorOwnerId) return Response.json({ error: "RFQ conversation is unavailable" }, { status: 400 });
      const quotes = await svc.entities.VendorQuote.filter({ rfq_id: referenceId, vendor_owner_id: vendorOwnerId }, "-created_date", 1);
      if (!quotes.length) return Response.json({ error: "Vendor has not quoted this RFQ" }, { status: 403 });
      buyerId = rfq.buyer_id; vOwnerId = vendorOwnerId; vendorId = quotes[0].vendor_id; referenceLabel = `RFQ · ${rfq.delivery_city}`;
    } else if (type === "order") {
      const order = await svc.entities.Order.get(referenceId);
      if (!order) return Response.json({ error: "Order not found" }, { status: 404 });
      buyerId = order.buyer_id; vOwnerId = order.vendor_owner_id; vendorId = order.vendor_id; referenceLabel = order.order_number;
    } else return Response.json({ error: "Invalid conversation type" }, { status: 400 });

    if (user.id !== buyerId && user.id !== vOwnerId) return Response.json({ error: "Not authorized" }, { status: 403 });
    const recipientId = user.id === buyerId ? vOwnerId : buyerId;
    if (recipientId === user.id) return Response.json({ error: "You can’t message yourself." }, { status: 400 });
    if (await isBlocked(svc, user.id, recipientId)) return Response.json({ error: "You can’t message this user." }, { status: 403 });
    const existing = await svc.entities.Conversation.filter({ type, reference_id: referenceId, buyer_id: buyerId, vendor_owner_id: vOwnerId }, "-updated_date", 1);
    if (existing.length) return Response.json({ conversationId: existing[0].id });
    const conversation = await svc.entities.Conversation.create({ type, reference_id: referenceId, reference_label: referenceLabel, buyer_id: buyerId, vendor_owner_id: vOwnerId, vendor_id: vendorId });
    return Response.json({ conversationId: conversation.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}