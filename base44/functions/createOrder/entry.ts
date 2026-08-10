import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { priceForQuantity, genOrderNumber, isPositiveNumber } from "../../shared/marketplace.ts";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const productId = body?.productId;
    const quantity = Number(body?.quantity);
    if (!productId) return Response.json({ error: "Product id required" }, { status: 400 });
    if (!isPositiveNumber(quantity)) return Response.json({ error: "Quantity must be a positive number" }, { status: 400 });

    const svc = base44.asServiceRole;
    const product = await svc.entities.Product.get(productId);
    if (!product) return Response.json({ error: "Product not found" }, { status: 404 });
    if (product.listing_status !== "active") return Response.json({ error: "This listing is no longer available." }, { status: 400 });
    if (quantity < (product.minimum_order_quantity || 1)) return Response.json({ error: `Minimum order is ${product.minimum_order_quantity || 1}.` }, { status: 400 });
    if (quantity > (product.quantity_available || 0)) return Response.json({ error: `Only ${product.quantity_available} available.` }, { status: 400 });

    const unitPrice = priceForQuantity(product, quantity);
    if (unitPrice === null) return Response.json({ error: "This quantity requires a custom quote." }, { status: 400 });
    const subtotal = unitPrice * quantity;

    const buyerProfiles = await svc.entities.BuyerProfile.filter({ created_by_id: user.id });
    const buyer = (buyerProfiles || [])[0] || {};

    const orderNumber = genOrderNumber();
    const lineName = `${product.common_name} (${[product.caliper, product.container_size].filter(Boolean).join(" · ")})`;
    const order = await svc.entities.Order.create({
      order_number: orderNumber, buyer_id: user.id, vendor_id: product.vendor_id, vendor_owner_id: product.vendor_owner_id,
      vendor_name: product.vendor_name, rfq_id: "", quote_id: "",
      items: [{ line_name: lineName, quantity, unit_price: unitPrice, subtotal }],
      subtotal, delivery_charges: 0, taxes: 0, platform_fees: 0, total: subtotal,
      fulfillment_method: product.pickup_eligible ? "pickup" : "vendor_delivery",
      destination_city: buyer.city || "", destination_state: buyer.state || "", destination_zip: buyer.zip_code || "",
      payment_status: "pending", order_status: "pending",
    });

    const remaining = Math.max(0, (product.quantity_available || 0) - quantity);
    await svc.entities.Product.update(productId, { quantity_available: remaining, listing_status: remaining === 0 ? "sold_out" : "active" });

    await svc.entities.Notification.create({ user_id: product.vendor_owner_id, type: "new_order", title: "New order received", body: orderNumber, reference_type: "order", reference_id: order.id, read: false });

    return Response.json({ order });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}