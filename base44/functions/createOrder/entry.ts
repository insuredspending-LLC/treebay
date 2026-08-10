// DEPRECATED — legacy single-shot order creation.
//
// This alternate commercial path bypassed delivery-option selection, delivery
// address enforcement and the authoritative pricing snapshot. It is intentionally
// disabled so no order can be created without the full checkout pipeline.
//
// Use instead: calculateCheckout -> selectDeliveryOption -> createOrderFromCheckout.
export default async function(req) {
  return Response.json({
    error: "createOrder is no longer supported. Use calculateCheckout + selectDeliveryOption + createOrderFromCheckout.",
    deprecated: true,
  }, { status: 410 });
}