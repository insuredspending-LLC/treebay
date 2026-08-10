import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const conversationId = body?.conversationId;
    if (!conversationId) return Response.json({ error: "conversationId required" }, { status: 400 });

    const svc = base44.asServiceRole;
    const msgs = await svc.entities.Message.filter({ conversation_id: conversationId, recipient_id: user.id, read: false });
    if (msgs && msgs.length) { await svc.entities.Message.bulkUpdate(msgs.map((m) => ({ id: m.id, read: true }))); }
    return Response.json({ count: (msgs || []).length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}