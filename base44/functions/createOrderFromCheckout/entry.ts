import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { createOrderFromQuote } from "../../shared/transactions.ts";
import { generateAndStoreDocument } from "../../shared/documents.ts";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const checkoutQuoteId = body?.checkoutQuoteId;
    if (!checkoutQuoteId) return Response.json({ error: "checkoutQuoteId required" }, { status: 400 });
    const svc = base44.asServiceRole;
    const { order, checkoutQuote: cq } = await createOrderFromQuote(svc, checkoutQuoteId, user);
    // Generate initial documents (order confirmation + purchase order).
    await generateAndStoreDocument(svc, order, "buyer_order_confirmation", cq);
    await generateAndStoreDocument(svc, order, "vendor_purchase_order", cq);
    return Response.json({ order });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.message?.includes("expired") ? 400 : 500 });
  }
}