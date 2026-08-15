import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAppUser } from "@/hooks/useAppUser";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, X, Send, Store, Package, FileText, ArrowRight, AlertCircle, Loader2, Bug } from "lucide-react";
import ProblemReportDialog from "@/components/ProblemReportDialog";
import { formatCurrency, formatNumber, ORDER_STATUS_LABELS, RFQ_STATUS_LABELS } from "@/lib/treebay";
import { cn } from "@/lib/utils";

const BUYER_SUGGESTIONS = [
  "Find 25 Live Oaks",
  "Search drought-tolerant trees",
  "Where is my order?",
  "Create a bulk RFQ",
];
const SELLER_SUGGESTIONS = [
  "What needs my attention?",
  "Show low-stock products",
  "Which RFQs match me?",
  "Help me list a product",
];
const ONBOARDING_SUGGESTIONS = {
  buyer: ["Help me choose a buyer type", "What information do I need?", "How do bulk quotes work?"],
  vendor: ["Help me set up my seller profile", "What should I write in my description?", "How do I list inventory?"],
  carrier: ["Help me set up my carrier profile", "What do load capabilities mean?", "How does TEST freight work?"],
};

export default function AIAssistant({ onboarding = false, onboardingRole = null }) {
  const { accountType } = useAppUser();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const scrollRef = useRef(null);
  const assistantRole = onboardingRole || accountType || "buyer";

  useEffect(() => {
    const handler = (event) => {
      if (event.detail?.prompt) setInput(event.detail.prompt);
      setOpen(true);
    };
    window.addEventListener("trebay-ai-open", handler);
    return () => window.removeEventListener("trebay-ai-open", handler);
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const send = async (text) => {
    if (!text.trim() || loading) return;
    const userMsg = { role: "user", text };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);
    try {
      // Send prior completed turns only; the current message is sent separately.
      const history = messages.slice(-8).map((m) => ({ role: m.role, text: m.text }));
      const res = await base44.functions.invoke("trebayAssistant", {
        message: text,
        context: { role: assistantRole, page: location.pathname, onboarding },
        history,
      });
      const data = res.data || res;
      setMessages((m) => [...m, { role: "assistant", text: data.reply || "I'm here to help.", cards: data.results?.cards || [], actions: data.results?.actions || [] }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "I'm having trouble connecting right now, but you can still browse the marketplace and manage your orders normally.", error: true }]);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = (action) => {
    setOpen(false);
    navigate(action.path);
  };

  const suggestions = onboarding
    ? ONBOARDING_SUGGESTIONS[assistantRole] || ONBOARDING_SUGGESTIONS.buyer
    : assistantRole === "vendor" ? SELLER_SUGGESTIONS : BUYER_SUGGESTIONS;
  const openProblemReport = () => {
    setOpen(false);
    setReportOpen(true);
  };

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed z-40 bottom-20 right-4 md:bottom-6 md:right-6 h-12 px-4 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center gap-2 no-tap-highlight hover:bg-primary/90 transition card-shadow"
          aria-label="Open TreEbay Assistant"
        >
          <Sparkles className="w-5 h-5" />
          <span className="text-sm font-semibold">{onboarding ? "Setup help" : "Ask TreEbay"}</span>
        </button>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 h-14 border-b border-border bg-card">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary-foreground" />
              </div>
              <div>
                <p className="font-heading font-bold text-sm text-foreground">TreEbay Assistant</p>
                <p className="text-[10px] text-muted-foreground">{onboarding ? "Setup guide" : assistantRole === "vendor" ? "Seller mode" : assistantRole === "carrier" ? "Carrier mode" : "Buyer mode"}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close"><X className="w-5 h-5" /></Button>
          </div>

          {/* Messages — chronological: each turn renders text + cards + actions together */}
          <ScrollArea className="flex-1 px-4 py-4">
            <div ref={scrollRef} className="space-y-4 min-h-full">
              {messages.length === 0 && (
                <div className="space-y-4">
                  <div className="rounded-2xl bg-secondary p-4 text-sm text-foreground">
                    {onboarding
                      ? "Welcome to TreEbay. I can explain each setup choice in plain language and help you finish without guessing."
                      : "Hi! I'm your TreEbay Assistant. I can help you find plants, compare suppliers, build RFQs, track orders, and navigate the marketplace. What do you need?"}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Try asking:</p>
                    <div className="flex flex-wrap gap-2">
                      {suggestions.map((s) => (
                        <button key={s} onClick={() => send(s)} className="px-3 py-1.5 rounded-full border border-border bg-card text-xs font-medium text-foreground hover:border-primary/40 hover:bg-secondary no-tap-highlight">
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className="space-y-2">
                  {/* Text bubble */}
                  <div className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                    <div className={cn("max-w-[85%] rounded-2xl px-4 py-2.5 text-sm", m.role === "user" ? "bg-primary text-primary-foreground" : m.error ? "bg-rose-50 text-rose-900 border border-rose-200" : "bg-secondary text-foreground")}>
                      <p className="leading-relaxed">{m.text}</p>
                    </div>
                  </div>
                  {/* This turn's cards */}
                  {m.cards?.length > 0 && (
                    <div className="space-y-2">
                      {m.cards.map((card, ci) => <ResultCard key={ci} card={card} />)}
                    </div>
                  )}
                  {/* This turn's actions */}
                  {m.actions?.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {m.actions.map((a, ai) => (
                        <Button key={ai} variant="outline" size="sm" onClick={() => handleAction(a)}>
                          {a.label} <ArrowRight className="w-3 h-3" />
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-secondary rounded-2xl px-4 py-3 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Searching TreEbay…</span>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="p-3 border-t border-border bg-card">
            <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2">
              <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder={onboarding ? "Ask a setup question…" : "Ask about plants, orders, RFQs…"} className="flex-1" disabled={loading} />
              <Button type="submit" size="icon" disabled={loading || !input.trim()}><Send className="w-4 h-4" /></Button>
            </form>
            <button type="button" onClick={openProblemReport} className="mt-2 w-full min-h-9 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center gap-1.5">
              <Bug className="w-3.5 h-3.5" /> Report an AI response or problem
            </button>
          </div>
        </SheetContent>
      </Sheet>
      <ProblemReportDialog open={reportOpen} onOpenChange={setReportOpen} defaultType={onboarding ? "onboarding" : "manual_bug"} />
    </>
  );
}

function ResultCard({ card }) {
  if (card.type === "product") {
    const p = card.data;
    return (
      <Link to={"/product/" + p.id} className="block rounded-xl border border-border bg-card p-3 hover:border-primary/40 hover:shadow-sm transition no-tap-highlight">
        <div className="flex gap-3">
          <div className="w-14 h-14 rounded-lg bg-muted overflow-hidden shrink-0">
            {p.images?.[0] ? <img src={p.images[0]} alt={p.common_name} className="w-full h-full object-cover" /> : <Package className="w-5 h-5 text-muted-foreground m-auto mt-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm text-foreground truncate">{p.common_name}</p>
            {p.botanical_name && <p className="text-xs text-muted-foreground italic truncate">{p.botanical_name}</p>}
            <div className="flex items-center justify-between mt-1">
              <p className="text-sm font-bold text-primary">{formatCurrency(p.unit_price)}</p>
              <p className="text-[11px] text-muted-foreground">{formatNumber(p.quantity_available)} avail.</p>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{p.vendor_name} · {[p.vendor_city, p.vendor_state].filter(Boolean).join(", ")}</p>
          </div>
        </div>
      </Link>
    );
  }
  if (card.type === "vendor") {
    const v = card.data;
    return (
      <Link to={"/vendor/" + v.id} className="block rounded-xl border border-border bg-card p-3 hover:border-primary/40 hover:shadow-sm transition no-tap-highlight">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0"><Store className="w-5 h-5 text-primary" /></div>
          <div className="min-w-0">
            <p className="font-semibold text-sm text-foreground truncate">{v.business_name}</p>
            <p className="text-xs text-muted-foreground truncate">{[v.city, v.state].filter(Boolean).join(", ")}</p>
          </div>
        </div>
      </Link>
    );
  }
  if (card.type === "order") {
    const o = card.data;
    return (
      <Link to={"/orders/" + o.id} className="block rounded-xl border border-border bg-card p-3 hover:border-primary/40 hover:shadow-sm transition no-tap-highlight">
        <p className="font-semibold text-sm text-foreground">{o.order_number}</p>
        <p className="text-xs text-muted-foreground mt-0.5">Status: {ORDER_STATUS_LABELS[o.order_status] || o.order_status}</p>
        <p className="text-xs text-muted-foreground">Total: {formatCurrency(o.total)}</p>
      </Link>
    );
  }
  if (card.type === "rfq") {
    const r = card.data;
    return (
      <Link to={"/rfqs/" + r.id} className="block rounded-xl border border-border bg-card p-3 hover:border-primary/40 hover:shadow-sm transition no-tap-highlight">
        <p className="font-semibold text-sm text-foreground">RFQ · {RFQ_STATUS_LABELS[r.status] || r.status}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{r.items?.length || 0} item(s) · {[r.delivery_city, r.delivery_state].filter(Boolean).join(", ")}</p>
      </Link>
    );
  }
  if (card.type === "rfq_match") {
    const match = card.data;
    return (
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
        <p className="font-semibold text-sm text-foreground">{match.requested_quantity}× {match.requested_item}</p>
        <p className="text-xs text-muted-foreground">{match.match_type === "partial" ? `Partial match — ${formatNumber(match.quantity_available)} of ${formatNumber(match.requested_quantity)} currently available.` : `Full match — ${formatNumber(match.quantity_available)} available.`}</p>
        <p className="text-xs text-muted-foreground">Matches {match.product_name}</p>
        <p className="text-xs text-muted-foreground">{[match.delivery_city, match.delivery_state].filter(Boolean).join(", ")}{match.quote_deadline ? ` · Quote by ${match.quote_deadline}` : ""}</p>
        <div className="flex gap-2"><Button asChild variant="outline" size="sm"><Link to={`/rfqs/${match.rfq_id}`}>View RFQ</Link></Button><Button asChild size="sm"><Link to={`/vendor/rfqs/${match.rfq_id}/quote`}>Prepare Quote</Link></Button></div>
      </div>
    );
  }
  if (card.type === "rfq_draft") {
    const d = card.data;
    return (
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
        <p className="font-semibold text-sm text-foreground flex items-center gap-1.5"><FileText className="w-4 h-4 text-primary" /> RFQ Draft</p>
        {d.items?.map((it, i) => (
          <p key={i} className="text-xs text-muted-foreground mt-1">• {it.quantity}× {it.common_name} {it.size_spec ? `(${it.size_spec})` : ""}</p>
        ))}
        {d.delivery_city && <p className="text-xs text-muted-foreground mt-1">Deliver to: {d.delivery_city}, {d.delivery_state}</p>}
        <p className="text-[11px] text-primary font-medium mt-2">Review and confirm in Projects to submit.</p>
      </div>
    );
  }
  if (card.type === "listing_draft") {
    const d = card.data;
    return (
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
        <p className="font-semibold text-sm text-foreground flex items-center gap-1.5"><Package className="w-4 h-4 text-primary" /> Listing Draft</p>
        <p className="text-xs text-muted-foreground mt-1">{d.common_name} · {formatCurrency(d.unit_price)} · {formatNumber(d.physical_quantity)} units</p>
        {d.bulk_price_tiers?.length > 0 && <p className="text-xs text-muted-foreground mt-0.5">Bulk tiers: {d.bulk_price_tiers.length}</p>}
        <p className="text-[11px] text-primary font-medium mt-2">Review and publish in Inventory.</p>
      </div>
    );
  }
  if (card.type === "seller_alert") {
    const d = card.data;
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
        <p className="font-semibold text-sm text-amber-900 flex items-center gap-1.5"><AlertCircle className="w-4 h-4" /> {d.title}</p>
        <p className="text-xs text-amber-700 mt-0.5">{d.count} item(s) need attention</p>
      </div>
    );
  }
  return null;
}