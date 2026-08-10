import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { recoverStaleInventoryReservation } from "../../shared/inventoryRecovery.ts";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
    const { reservationId } = await req.json();
    const reservation = await base44.asServiceRole.entities.InventoryReservation.get(reservationId);
    if (!reservation) return Response.json({ error: "Reservation not found" }, { status: 404 });
    return Response.json(await recoverStaleInventoryReservation(base44.asServiceRole, reservation));
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}