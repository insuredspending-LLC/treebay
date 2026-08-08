import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, MapPin, Calendar, Loader2, MessageSquare } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import StatusBadge from "@/components/StatusBadge";
import { RFQ_STATUS_LABELS, shortDate, formatNumber } from "@/lib/treebay";

export default function VendorRFQs() {
  const [rfqs, setRfqs] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [r, q] = await Promise.all([
          base44.entities.RFQ.filter({ status: "open" }, "-created_date", 100),
          base44.entities.VendorQuote.list("-created_date", 100),
        ]);
        setRfqs(r || []); setQuotes(q || []);
      } catch {}
      finally { setLoading(false); }
    })();
  }, []);

  const myQuoteIds = new Set(quotes.map((q) => q.rfq_id));

  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-bold">Open RFQs</h1><p className="text-sm text-muted-foreground">Buyer requests you can quote on.</p></div>
      {loading ? <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
        : rfqs.length === 0 ? <EmptyState icon={FileText} title="No open RFQs" description="When buyers post requests, they'll appear here for you to quote." />
        : (
          <div className="space-y-3">
            {rfqs.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{r.delivery_city}, {r.delivery_state} {r.delivery_zip}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><MapPin className="w-3 h-3" /> {formatNumber((r.items || []).reduce((s, i) => s + (i.quantity || 0), 0))} units · {(r.items || []).length} line{(r.items || []).length === 1 ? "" : "s"}</p>
                    {r.quote_deadline && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Calendar className="w-3 h-3" /> Quote by {shortDate(r.quote_deadline)}</p>}
                  </div>
                  <StatusBadge status="open" label="Open" />
                </div>
                <div className="mt-3 pt-3 border-t border-border space-y-1">
                  {(r.items || []).map((it, i) => <p key={i} className="text-sm">{it.quantity} × <span className="font-medium">{it.common_name}</span> {it.size_spec && <span className="text-muted-foreground">— {it.size_spec}</span>}</p>)}
                </div>
                <div className="mt-3 flex gap-2">
                  {myQuoteIds.has(r.id) ? <Button variant="secondary" className="flex-1" disabled>Quote submitted</Button>
                    : <Button asChild className="flex-1"><Link to={`/vendor/rfqs/${r.id}/quote`}>Submit quote</Link></Button>}
                  <Button variant="outline" asChild><Link to={`/rfqs/${r.id}`}>View</Link></Button>
                </div>
              </Card>
            ))}
          </div>
        )}
    </div>
  );
}