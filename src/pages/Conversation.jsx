import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, ArrowLeft, Flag, Ban, Loader2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import ReportDialog from "@/components/ReportDialog";
import { relativeTime } from "@/lib/treebay";

export default function Conversation() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [conv, setConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [report, setReport] = useState(false);
  const [otherName, setOtherName] = useState("User");
  const [meId, setMeId] = useState(null);
  const endRef = useRef(null);

  useEffect(() => { base44.auth.me().then((u) => setMeId(u.id)).catch(() => {}); }, []);

  const load = async () => {
    try {
      const c = await base44.entities.Conversation.get(id);
      setConv(c);
      const msgs = await base44.entities.Message.filter({ conversation_id: id }, "created_date", 200) || [];
      setMessages(msgs);
      // determine other party name
      const me = await base44.auth.me();
      setMeId(me.id);
      const otherIsVendor = c.vendor_owner_id !== me.id;
      if (otherIsVendor && c.vendor_id) { try { const v = await base44.entities.VendorProfile.get(c.vendor_id); setOtherName(v?.business_name || "Vendor"); } catch {} }
      else if (!otherIsVendor) { try { const buyers = await base44.entities.BuyerProfile.list(); setOtherName(buyers?.[0]?.business_name || buyers?.[0]?.full_name || "Buyer"); } catch {} }
      // mark received messages read
      for (const m of msgs.filter((m) => m.recipient_id === me.id && !m.read)) { try { await base44.entities.Message.update(m.id, { read: true }); } catch {} }
    } catch {}
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [id]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async (e) => {
    e?.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      const me = await base44.auth.me();
      const otherId = me.id === conv.buyer_id ? conv.vendor_owner_id : conv.buyer_id;
      const m = await base44.entities.Message.create({ conversation_id: id, sender_id: me.id, sender_name: me.full_name || me.email, recipient_id: otherId, body: text.trim(), read: false });
      setMessages((prev) => [...prev, m]);
      await base44.entities.Conversation.update(id, { last_message: text.trim(), last_message_at: new Date().toISOString() });
      setText("");
    } catch (e) { toast({ title: "Could not send", description: e.message, variant: "destructive" }); }
    finally { setSending(false); }
  };

  const block = async () => {
    try {
      const me = await base44.auth.me();
      const otherId = me.id === conv.buyer_id ? conv.vendor_owner_id : conv.buyer_id;
      await base44.entities.UserBlock.create({ blocker_id: me.id, blocked_id: otherId });
      toast({ title: "User blocked", description: "They can no longer message you." });
    } catch (e) { toast({ title: "Could not block", variant: "destructive" }); }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;
  if (!conv) return <p className="text-center text-muted-foreground py-16">Conversation not found.</p>;

  return (
    <div className="flex flex-col h-[calc(100vh-9rem)]">
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-border">
        <Link to="/messages" className="text-sm text-muted-foreground flex items-center gap-1"><ArrowLeft className="w-4 h-4" /></Link>
        <div className="text-center flex-1">
          <p className="font-semibold text-sm">{otherName}</p>
          <p className="text-xs text-muted-foreground">{conv.reference_label}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="More"><Ban className="w-4 h-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setReport(true)}><Flag className="w-4 h-4 mr-2" /> Report conversation</DropdownMenuItem>
            <DropdownMenuItem onClick={block}><Ban className="w-4 h-4 mr-2" /> Block user</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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