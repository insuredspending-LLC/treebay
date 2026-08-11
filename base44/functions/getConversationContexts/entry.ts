import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Safe additive read helper: returns only marketplace presentation fields for conversation counterparts.
// Never exposes email, phone, private addresses, or private profile fields.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json() || {};
    const conversationIds = body?.conversationIds;
    if (!Array.isArray(conversationIds) || !conversationIds.length)
      return Response.json({ contexts: {} });

    const svc = base44.asServiceRole;

    // Fetch all conversations (verify authorization)
    const conversations = [];
    for (const id of conversationIds) {
      try {
        const conv = await svc.entities.Conversation.get(id);
        if (conv && (conv.buyer_id === user.id || conv.vendor_owner_id === user.id)) {
          conversations.push(conv);
        }
      } catch {}
    }

    if (!conversations.length) return Response.json({ contexts: {} });

    // Collect unique IDs for batch lookups
    const vendorIds = [...new Set(conversations.map(c => c.vendor_id).filter(Boolean))];
    const buyerIds = [...new Set(conversations.map(c => c.buyer_id).filter(Boolean))];
    const productIds = conversations.filter(c => c.type === "product" && c.reference_id).map(c => c.reference_id);
    const orderIds = conversations.filter(c => c.type === "order" && c.reference_id).map(c => c.reference_id);
    const rfqIds = conversations.filter(c => c.type === "rfq" && c.reference_id).map(c => c.reference_id);

    // Batch fetch profiles and references
    let vendorMap = {}, buyerMap = {}, productMap = {}, orderMap = {}, rfqMap = {};
    if (vendorIds.length) {
      try { const vendors = await svc.entities.VendorProfile.filter({ id: { $in: vendorIds } }); (vendors || []).forEach(v => { vendorMap[v.id] = v; }); } catch {}
    }
    if (buyerIds.length) {
      try { const buyers = await svc.entities.BuyerProfile.filter({ created_by_id: { $in: buyerIds } }); (buyers || []).forEach(b => { buyerMap[b.created_by_id] = b; }); } catch {}
    }
    if (productIds.length) {
      try { const products = await svc.entities.Product.filter({ id: { $in: productIds } }); (products || []).forEach(p => { productMap[p.id] = p; }); } catch {}
    }
    if (orderIds.length) {
      try { const orders = await svc.entities.Order.filter({ id: { $in: orderIds } }); (orders || []).forEach(o => { orderMap[o.id] = o; }); } catch {}
    }
    if (rfqIds.length) {
      try { const rfqs = await svc.entities.RFQ.filter({ id: { $in: rfqIds } }); (rfqs || []).forEach(r => { rfqMap[r.id] = r; }); } catch {}
    }

    // Count unread messages for all conversations in one query
    let unreadMap = {};
    try {
      const unreadMsgs = await svc.entities.Message.filter({
        conversation_id: { $in: conversationIds },
        recipient_id: user.id,
        read: false,
      });
      (unreadMsgs || []).forEach(m => {
        unreadMap[m.conversation_id] = (unreadMap[m.conversation_id] || 0) + 1;
      });
    } catch {}

    // Build contexts — only safe marketplace presentation fields
    const contexts = {};
    for (const conv of conversations) {
      const isBuyer = conv.buyer_id === user.id;
      const counterpartRole = isBuyer ? "vendor" : "buyer";
      let counterpartName = counterpartRole === "vendor" ? "Grower" : "Buyer";
      let counterpartLogo = null;

      if (counterpartRole === "vendor" && conv.vendor_id && vendorMap[conv.vendor_id]) {
        counterpartName = vendorMap[conv.vendor_id].business_name || "Grower";
        counterpartLogo = vendorMap[conv.vendor_id].logo_url || null;
      } else if (counterpartRole === "buyer" && buyerMap[conv.buyer_id]) {
        counterpartName = buyerMap[conv.buyer_id].business_name || buyerMap[conv.buyer_id].full_name || "Buyer";
      }

      let referenceInfo = null;
      if (conv.type === "product" && conv.reference_id && productMap[conv.reference_id]) {
        referenceInfo = { type: "product", id: conv.reference_id, label: productMap[conv.reference_id].common_name };
      } else if (conv.type === "order" && conv.reference_id && orderMap[conv.reference_id]) {
        referenceInfo = { type: "order", id: conv.reference_id, label: orderMap[conv.reference_id].order_number };
      } else if (conv.type === "rfq" && conv.reference_id && rfqMap[conv.reference_id]) {
        referenceInfo = { type: "rfq", id: conv.reference_id, label: `RFQ · ${rfqMap[conv.reference_id].delivery_city}` };
      }

      contexts[conv.id] = {
        counterpartName,
        counterpartLogo,
        counterpartRole,
        myRole: isBuyer ? "buyer" : "vendor",
        referenceInfo,
        referenceLabel: conv.reference_label,
        conversationType: conv.type,
        referenceId: conv.reference_id,
        unreadCount: unreadMap[conv.id] || 0,
      };
    }

    return Response.json({ contexts });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}