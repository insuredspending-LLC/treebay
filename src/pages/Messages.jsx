import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAppUser } from "@/hooks/useAppUser";
import { Card } from "@/components/ui/card";
import { MessageSquare, Store, FileText, ShoppingCart, Package } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import { relativeTime } from "@/lib/treebay";

const REF_ICONS = {
  product: Package,
  rfq: FileText,
  order: ShoppingCart,
  general: MessageSquare,
};

export default function Messages() {
  const { user } = useAppUser();
  const [convs, setConvs] = useState([]);
  const [contexts, setContexts] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const list = await base44.entities.Conversation.list("-last_message_at", 100) || [];
        setConvs(list);
        if (list.length) {
          try {
            const { data } = await base44.functions.invoke("getConversationContexts", {
              conversationIds: list.map((c) => c.id),
            });
            setContexts(data?.contexts || {});
          } catch {}
        }
      } catch {}
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-bold">Messages</h1><p className="text-sm text-muted-foreground">Conversations with growers and buyers.</p></div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 rounded-xl border skeleton-shimmer" />)}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-bold">Messages</h1><p className="text-sm text-muted-foreground">Conversations with growers and buyers.</p></div>
      {convs.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No conversations" description="Start a conversation from a product, RFQ, or order." />
      ) : (
        <div className="space-y-2">
          {convs.map((c) => {
            const ctx = contexts[c.id] || {};
            const name = ctx.counterpartName || "User";
            const role = ctx.counterpartRole || (c.buyer_id === user?.id ? "vendor" : "buyer");
            const ref = ctx.referenceInfo;
            const RefIcon = ref ? REF_ICONS[ref.type] || MessageSquare : null;
            const unread = ctx.unreadCount || 0;
            return (
              <Link key={c.id} to={`/messages/${c.id}`}>
                <Card className={"p-3.5 hover:shadow-sm hover:border-primary/40 transition flex items-center gap-3 " + (unread > 0 ? "border-primary/30 bg-primary/5" : "")}>
                  <div className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center shrink-0">
                    {role === "vendor" ? <Store className="w-5 h-5 text-primary" /> : <MessageSquare className="w-5 h-5 text-primary" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">{name}</p>
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">{role === "vendor" ? "Grower" : "Buyer"}</span>
                      {unread > 0 && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                    </div>
                    {ref && <p className="text-xs text-primary font-medium truncate flex items-center gap-1">{RefIcon && <RefIcon className="w-3 h-3" />}{ref.label}</p>}
                    <p className="text-xs text-muted-foreground truncate">{c.last_message || "Start the conversation"}</p>
                  </div>
                  <span className="text-[11px] text-muted-foreground shrink-0">{relativeTime(c.last_message_at || c.created_date)}</span>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}