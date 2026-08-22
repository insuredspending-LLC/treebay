import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Featured placement is a Tree Marketplace editorial/promotional decision — vendors can
// never self-promote their own inventory. Admin only.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Only Tree Marketplace administrators can feature a listing." }, { status: 403 });
    const body = await req.json() || {};
    const productId = body?.productId;
    if (!productId) return Response.json({ error: "productId required" }, { status: 400 });
    const svc = base44.asServiceRole;
    const product = await svc.entities.Product.get(productId);
    if (!product) return Response.json({ error: "Product not found" }, { status: 404 });
    await svc.entities.Product.update(productId, { featured: !!body.featured });
    return Response.json({ ok: true, featured: !!body.featured });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}