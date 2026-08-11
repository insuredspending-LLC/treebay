import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { isBlocked } from "../../shared/marketplace.ts";

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const conversationId = body?.conversationId;
    const text = (body?.body || "").trim();
    if (!conversationId) return Response.json({ error: "Conversation id required" }, { status: 400 });
    if (!text) return Response.json({ error: "Message body required" }, { status: 400 });

    const svc = base44.asServiceRole;
    const conv = await svc.entities.Conversation.get(conversationId);
    if (!conv) return Response.json({ error: "Conversation not found" }, { status: 404 });
    const isBuyer = conv.buyer_id === user.id;
    const isVendor = conv.vendor_owner_id === user.id;
    if (!isBuyer && !isVendor) return Response.json({ error: "You are not a participant in this conversation." }, { status: 403 });

    const recipientId = isBuyer ? conv.vendor_owner_id : conv.buyer_id;
    const blocked = await isBlocked(svc, user.id, recipientId);
    if (blocked) return Response.json({ error: "You can't send messages in this conversation." }, { status: 403 });

    const message = await svc.entities.Message.create({
      conversation_id: conversationId, sender_id: user.id, sender_name: user.full_name || user.email,
      recipient_id: recipientId, body: text, read: false,
    });
    await svc.entities.Conversation.update(conversationId, { last_message: text, last_message_at: new Date().toISOString() });

    // Automatically notify the recipient — retry bounded, escalate exception on failure
    // A notification failure must NOT roll back the already-sent Message.
    const safePreview = text.length > 80 ? text.slice(0, 77) + "..." : text;
    let notifOk = false;
    let notifErr = null;
    for (let attempt = 0; attempt < 3 && !notifOk; attempt++) {
      try {
        await svc.entities.Notification.create({
          user_id: recipientId,
          type: "new_message",
          title: "New message",
          body: safePreview,
          reference_type: "conversation",
          reference_id: conversationId,
          read: false,
        });
        notifOk = true;
      } catch (e) {
        notifErr = e;
      }
    }
    if (!notifOk) {
      // Escalate — message was delivered, notification was not
      try {
        await svc.entities.SystemException.create({
          exception_type: "message_notification_failed",
          severity: "ACTION_REQUIRED",
          status: "ADMIN_REVIEW",
          requires_admin: true,
          buyer_id: conv.buyer_id || null,
          vendor_id: conv.vendor_id || null,
          technical_details_private: `Notification delivery failed after 3 attempts. Conversation: ${conversationId}. Error: ${notifErr?.message || "unknown"}`,
          recommended_action: "Review notification delivery. Message itself was delivered.",
        });
      } catch { /* best-effort escalation */ }
    }

    return Response.json({ message });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}