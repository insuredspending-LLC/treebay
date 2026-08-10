import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { isPositiveNumber } from "../../shared/marketplace.ts";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json() || {};
    const svc = base44.asServiceRole;

    let delivery_city = body.delivery_city, delivery_state = body.delivery_state, delivery_zip = body.delivery_zip;
    if (body.projectId) {
      const project = await svc.entities.Project.get(body.projectId);
      if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
      if (project.created_by_id !== user.id) return Response.json({ error: "Not authorized" }, { status: 403 });
      if (!delivery_city) { delivery_city = project.delivery_city; delivery_state = project.delivery_state; delivery_zip = project.delivery_zip; }
    }
    if (!delivery_city || !delivery_state || !delivery_zip) return Response.json({ error: "Delivery location required" }, { status: 400 });

    const items = body.items || [];
    if (!Array.isArray(items) || !items.length) return Response.json({ error: "At least one item required" }, { status: 400 });
    for (const it of items) { if (!isPositiveNumber(Number(it.quantity))) return Response.json({ error: "Quantities must be positive" }, { status: 400 }); }

    const rfq = await svc.entities.RFQ.create({
      buyer_id: user.id, project_id: body.projectId || "",
      delivery_city, delivery_state, delivery_zip,
      requested_delivery_date: body.requested_delivery_date || "", quote_deadline: body.quote_deadline || "",
      notes: body.notes || "", substitution_allowed: !!body.substitution_allowed, delivery_required: body.delivery_required !== false,
      status: "open", items,
    });
    return Response.json({ rfq });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}