import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { computeQuoteTotal, isPositiveNumber, isNonNegativeNumber } from "../../shared/marketplace.ts";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const rfqId = body?.rfqId;
    const items = body?.items;
    const expiration_date = body?.expiration_date || "";
    const vendor_notes = body?.vendor_notes || "";
    if (!rfqId) return Response.json({ error: "RFQ id required" }, { status: 400 });
    if (!Array.isArray(items) || !items.length) return Response.json({ error: "At least one line item required" }, { status: 400 });
    for (const it of items) {
      if (!isPositiveNumber(Number(it.quantity_offered))) return Response.json({ error: "Quantities must be positive" }, { status: 400 });
      if (!isNonNegativeNumber(Number(it.unit_price))) return Response.json({ error: "Prices must be non-negative" }, { status: 400 });
      if (!isNonNegativeNumber(Number(it.delivery_price))) return Response.json({ error: "Delivery fee invalid" }, { status: 400 });
    }

    const svc = base44.asServiceRole;
    const vendors = await svc.entities.VendorProfile.filter({ created_by_id: user.id });
    const vendor = (vendors || [])[0];
    if (!vendor) return Response.json({ error: "No vendor profile found" }, { status: 403 });
    // Same seller-trust bar as direct listings: only verified sellers may quote commercially.
    if (vendor.verification_status !== "verified") {
      return Response.json({ error: "Your seller account must be verified before you can submit quotes." }, { status: 403 });
    }

    const rfq = await svc.entities.RFQ.get(rfqId);
    if (!rfq) return Response.json({ error: "RFQ not found" }, { status: 404 });
    if (rfq.status !== "open" && rfq.status !== "quotes_received") return Response.json({ error: "This RFQ is no longer accepting quotes." }, { status: 400 });

    const existing = await svc.entities.VendorQuote.filter({ rfq_id: rfqId, vendor_owner_id: user.id, status: { $in: ["submitted", "revised", "accepted"] } });
    if (existing && existing.length) return Response.json({ error: "You have already submitted a quote for this RFQ." }, { status: 409 });

    const normItems = items.map((it) => ({
      line_name: it.line_name || "",
      quantity_offered: Number(it.quantity_offered) || 0,
      unit_price: Number(it.unit_price) || 0,
      availability: it.availability || "",
      estimated_ready_date: it.estimated_ready_date || "",
      delivery_offered: !!it.delivery_offered,
      // If delivery is not offered, force delivery_price to 0 regardless of input.
      delivery_price: it.delivery_offered ? (Number(it.delivery_price) || 0) : 0,
      substitution_details: it.substitution_details || "",
      subtotal: (Number(it.quantity_offered) || 0) * (Number(it.unit_price) || 0),
    }));
    const quoteTotal = computeQuoteTotal(normItems);

    const quote = await svc.entities.VendorQuote.create({
      rfq_id: rfqId, vendor_id: vendor.id, vendor_owner_id: user.id, vendor_name: vendor.business_name,
      vendor_city: vendor.city, vendor_state: vendor.state, buyer_id: rfq.buyer_id,
      items: normItems, quote_total: quoteTotal, expiration_date, vendor_notes, status: "submitted",
    });

    if (rfq.status === "open") { try { await svc.entities.RFQ.update(rfqId, { status: "quotes_received" }); } catch {} }
    await svc.entities.Notification.create({ user_id: rfq.buyer_id, type: "new_quote", title: "New quote received", body: `From ${vendor.business_name}`, reference_type: "rfq", reference_id: rfqId, read: false });

    return Response.json({ quote });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}