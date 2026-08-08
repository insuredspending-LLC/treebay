import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { MessageSquare, Loader2 } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import { relativeTime } from "@/lib/treebay";

export default function Messages() {
  const [convs, setConvs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { const list = await base44.entities.Conversation.list("-last_message_at", 100) || []; setConvs(list); } catch {}
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-bold">Messages</h1><p className="text-sm text-muted-foreground">Conversations with vendors and buyers.</p></div>
      {loading ? <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
        : convs.length === 0 ? <EmptyState icon={MessageSquare} title="No conversations" description="Start a conversation from a product, RFQ, or order." />
        : (
          <div className="space-y-2">
            {convs.map((c) => (
              <Link key={c.id} to={`/messages/${c.id}`}>
                <Card className="p-3.5 hover:shadow-sm hover:border-primary/40 transition flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center shrink-0"><MessageSquare className="w-5 h-5 text-primary" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{c.reference_label || "Conversation"}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.last_message || "Start the conversation"}</p>
                  </div>
                  <span className="text-[11px] text-muted-foreground shrink-0">{relativeTime(c.last_message_at || c.created_date)}</span>
                </Card>
              </Link>
            ))}
          </div>
        )}
    </div>
  );
}