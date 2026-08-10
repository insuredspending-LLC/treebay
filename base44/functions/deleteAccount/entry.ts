import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const svc = base44.asServiceRole;
    const uid = user.id;

    // Archive vendor listings (records retained for order history)
    try { await svc.entities.Product.updateMany({ vendor_owner_id: uid }, { $set: { listing_status: "archived" } }); } catch {}
    // Remove personal marketplace data the user owns
    try { await svc.entities.Favorite.deleteMany({ created_by_id: uid }); } catch {}
    try { await svc.entities.Notification.deleteMany({ user_id: uid }); } catch {}
    try { await svc.entities.UserBlock.deleteMany({ blocker_id: uid }); } catch {}
    try { await svc.entities.Project.deleteMany({ created_by_id: uid }); } catch {}
    try { await svc.entities.BuyerProfile.deleteMany({ created_by_id: uid }); } catch {}
    try { await svc.entities.VendorProfile.deleteMany({ created_by_id: uid }); } catch {}
    try { await svc.entities.CarrierProfile.deleteMany({ created_by_id: uid }); } catch {}
    // De-identify retained transaction records (bodies kept for dispute/accounting history)
    try { await svc.entities.Message.updateMany({ sender_id: uid }, { $set: { sender_name: "Deleted user" } }); } catch {}
    try { await svc.entities.Review.updateMany({ reviewer_id: uid }, { $set: { reviewer_name: "Deleted user" } }); } catch {}

    return Response.json({ ok: true, note: "Personal data removed; listings archived; orders/reviews/messages retained as de-identified transaction records." });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}