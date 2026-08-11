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

    // Automatically notify the recipient — no admin/operator action required
    try {
      const safePreview = text.length > 80 ? text.slice(0, 77) + "..." : text;
      await svc.entities.Notification.create({
        user_id: recipientId,
        type: "new_message",
        title: "New message",
        body: safePreview,
        reference_type: "conversation",
        reference_id: conversationId,
        read: false,
      });
    } catch { /* notification is best-effort */ }

    return Response.json({ message });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}