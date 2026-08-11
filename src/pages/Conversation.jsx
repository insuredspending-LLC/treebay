import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAppUser } from "@/hooks/useAppUser";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Flag, Ban, Loader2, Store, MessageSquare, FileText, ShoppingCart, Package } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import ReportDialog from "@/components/ReportDialog";
import { relativeTime, apiError } from "@/lib/treebay";

const REF_LINKS = {
  product: { label: "View Product", path: (id) => `/product/${id}`, icon: Package },
  rfq: { label: "View RFQ", path: (id) => `/rfqs/${id}`, icon: FileText },
  order: { label: "View Order", path: (id) => `/orders/${id}`, icon: ShoppingCart },
};

export default function Conversation() {
  const { id } = useParams();
  const { user } = useAppUser();
  const { toast } = useToast();
  const [conv, setConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [report, setReport] = useState(false);
  const [ctx, setCtx] = useState(null);
  const endRef = useRef(null);

  const load = async () => {
    try {
      const c = await base44.entities.Conversation.get(id);
      setConv(c);
      const msgs = await base44.entities.Message.filter({ conversation_id: id }, "created_date", 200) || [];
      setMessages(msgs);
      // Get counterpart context via secure backend helper
      try {
        const { contexts } = await base44.functions.invoke("getConversationContexts", { conversationIds: [id] });
        setCtx(contexts?.[id] || null);
      } catch {}
      // Mark received messages read via secure backend
      try { await base44.functions.invoke("markMessagesRead", { conversationId: id }); } catch {}
    } catch {}
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [id]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const meId = user?.id;
  const otherName = ctx?.counterpartName || "User";
  const otherRole = ctx?.counterpartRole || (conv?.buyer_id === meId ? "vendor" : "buyer");
  const ref = ctx?.referenceInfo;
  const RefLink = ref ? REF_LINKS[ref.type] : null;

  const send = async (e) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body || !meId || !conv) return;
    const tempId = "temp-" + Date.now();
    const temp = { id: tempId, conversation_id: id, sender_id: meId, sender_name: "", recipient_id: "", body, read: false, created_date: new Date().toISOString() };
    setMessages((prev) => [...prev, temp]);
    setText("");
    setSending(true);
    try {
      const { data } = await base44.functions.invoke("sendMessage", { conversationId: id, body });
      setMessages((prev) => prev.map((x) => (x.id === tempId ? data.message : x)));
    } catch (err) {
      setMessages((prev) => prev.filter((x) => x.id !== tempId));
      setText(body);
      toast({ title: "Could not send", description: apiError(err), variant: "destructive" });
    } finally { setSending(false); }
  };

  const block = async () => {
    if (!meId || !conv) return;
    try {
      const otherId = meId === conv.buyer_id ? conv.vendor_owner_id : conv.buyer_id;
      await base44.entities.UserBlock.create({ blocker_id: meId, blocked_id: otherId });
      toast({ title: "User blocked", description: "They can no longer message you." });
    } catch (e) { toast({ title: "Could not block", variant: "destructive" }); }
  };

  if (loading) return (
    <div className="space-y-4">
      <div className="h-16 rounded-xl border skeleton-shimmer" />
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 rounded-2xl skeleton-shimmer" style={{ width: `${60 + Math.random() * 30}%`, marginLeft: i % 2 ? "auto" : "0" }} />)}
      </div>
    </div>
  );
  if (!conv) return <p className="text-center text-muted-foreground py-16">Conversation not found.</p>;

  return (
    <div className="flex flex-col h-[calc(100vh-9rem)]">
      <div className="pb-3 border-b border-border">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center shrink-0">
              {otherRole === "vendor" ? <Store className="w-5 h-5 text-primary" /> : <MessageSquare className="w-5 h-5 text-primary" />}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm truncate">{otherName}</p>
              <p className="text-xs text-muted-foreground">{otherRole === "vendor" ? "Grower" : "Buyer"}{ref ? ` · ${ref.label}` : ""}</p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="More"><Ban className="w-4 h-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setReport(true)}><Flag className="w-4 h-4 mr-2" /> Report conversation</DropdownMenuItem>
              <DropdownMenuItem onClick={block}><Ban className="w-4 h-4 mr-2" /> Block user</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {RefLink && ref && (
          <Button variant="outline" size="sm" asChild className="mt-2 w-full">
            <Link to={RefLink.path(ref.id)}><RefLink.icon className="w-4 h-4 mr-1" /> {RefLink.label}</Link>
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-4 space-y-2">
        {messages.length === 0 ? <p className="text-center text-sm text-muted-foreground py-10">Say hello to start the conversation.</p> : null}
        {messages.map((m) => <Bubble key={m.id} m={m} meId={meId} />)}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="flex gap-2 pt-3 border-t border-border">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message..." className="h-11" />
        <Button type="submit" size="icon" className="h-11 w-11" disabled={sending || !text.trim()}>{sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}</Button>
      </form>
      <ReportDialog open={report} onOpenChange={setReport} targetType="conversation" targetId={id} targetLabel="conversation" />
    </div>
  );
}

function Bubble({ m, meId }) {
  const mine = meId === m.sender_id;
  return (
    <div className={"flex " + (mine ? "justify-end" : "justify-start")}>
      <div className={"max-w-[80%] rounded-2xl px-3.5 py-2 text-sm " + (mine ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-secondary text-foreground rounded-bl-sm")}>
        <p className="whitespace-pre-line break-words">{m.body}</p>
        <p className={"text-[10px] mt-1 " + (mine ? "text-primary-foreground/70" : "text-muted-foreground")}>{relativeTime(m.created_date)}</p>
      </div>
    </div>
  );
}