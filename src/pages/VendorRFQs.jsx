import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAppUser } from "@/hooks/useAppUser";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, MapPin, Calendar, Loader2, CheckCircle2, AlertCircle, Package, ChevronRight } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import StatusBadge from "@/components/StatusBadge";
import { RFQ_STATUS_LABELS, shortDate, formatNumber, apiError } from "@/lib/treebay";
import { matchRfqToInventory } from "@/lib/rfqMatching";

const PAGE_SIZE = 25;

export default function VendorRFQs() {
  const { user } = useAppUser();
  const [rfqs, setRfqs] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [myQuoteIds, setMyQuoteIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(null);

  const loadInventory = useCallback(async () => {
    if (!user?.id) return;
    let all = [];
    let cur = null;
    for (let page = 0; page < 6; page++) {
      const q = { vendor_owner_id: user.id };
      if (cur) q.created_date = { $lt: cur };
      const batch = await base44.entities.Product.filter(q, "-created_date", 50);
      if (!batch?.length) break;
      all = all.concat(batch);
      cur = batch[batch.length - 1].created_date;
      if (batch.length < 50) break;
    }
    setInventory(all);
  }, [user?.id]);

  const loadRfqs = useCallback(async (reset) => {
    const q = { status: { $in: ["open", "quotes_received"] } };
    if (!reset && cursor) q.created_date = { $lt: cursor };
    return base44.entities.RFQ.filter(q, "-created_date", PAGE_SIZE);
  }, [cursor]);

  const load = useCallback(async (reset = false) => {
    if (reset) { setLoading(true); setCursor(null); }
    else setLoadingMore(true);
    setError(null);
    try {
      const [batch, quotes] = await Promise.all([
        loadRfqs(reset),
        reset ? base44.entities.VendorQuote.filter({ vendor_owner_id: user.id }, "-created_date", 100) : Promise.resolve([]),
      ]);
      setRfqs(reset ? batch : (prev) => [...prev, ...batch]);
      setCursor(batch.length > 0 ? batch[batch.length - 1].created_date : null);
      setHasMore(batch.length === PAGE_SIZE);
      if (reset) setMyQuoteIds(new Set(quotes.map((q) => q.rfq_id)));
    } catch (e) { setError(apiError(e)); }
    finally { setLoading(false); setLoadingMore(false); }
  }, [loadRfqs, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    Promise.all([loadInventory(), load(true)]);
  }, [user?.id]);

  if (loading) return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-bold">Sourcing Opportunities</h1><p className="text-sm text-muted-foreground">Buyer requests you can quote on.</p></div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-40 rounded-xl border skeleton-shimmer" />)}
      </div>
    </div>
  );

  if (error && !rfqs.length) return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-bold">Sourcing Opportunities</h1><p className="text-sm text-muted-foreground">Buyer requests you can quote on.</p></div>
      <Card className="p-8 text-center">
        <AlertCircle className="w-10 h-10 mx-auto text-destructive" />
        <h2 className="mt-3 font-semibold">Could not load RFQs</h2>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        <Button className="mt-4" onClick={() => load(true)}>Retry</Button>
      </Card>
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Sourcing Opportunities</h1>
        <p className="text-sm text-muted-foreground">Buyer requests you can quote on. Inventory matches are based on your live listings.</p>
      </div>

      {rfqs.length === 0 ? (
        <EmptyState icon={FileText} title="No open RFQs" description="When buyers post requests, they'll appear here for you to quote." />
      ) : (
        <>
          <div className="space-y-3">
            {rfqs.map((r) => {
              const { results, hasAnyMatch } = matchRfqToInventory(r, inventory);
              const alreadyQuoted = myQuoteIds.has(r.id);
              const totalQty = (r.items || []).reduce((s, i) => s + (i.quantity || 0), 0);
              return (
                <Card key={r.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{r.delivery_city}, {r.delivery_state} {r.delivery_zip}</p>
                        <StatusBadge status={r.status} label={RFQ_STATUS_LABELS[r.status]} />
                        {alreadyQuoted && <Badge variant="secondary" className="gap-1"><CheckCircle2 className="w-3 h-3" /> Quoted</Badge>}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> Jobsite</span>
                        <span className="flex items-center gap-1"><Package className="w-3 h-3" /> {formatNumber(totalQty)} units · {(r.items || []).length} line{(r.items || []).length === 1 ? "" : "s"}</span>
                        {r.requested_delivery_date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Needed {shortDate(r.requested_delivery_date)}</span>}
                        {r.quote_deadline && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> Quote by {shortDate(r.quote_deadline)}</span>}
                      </div>
                    </div>
                  </div>

                  {/* Requested items with match status */}
                  <div className="mt-3 pt-3 border-t border-border space-y-2">
                    {results.map(({ item, match }, i) => (
                      <div key={i} className="flex items-start justify-between gap-2 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{item.quantity} × {item.common_name || item.botanical_name}</p>
                          {item.size_spec && <p className="text-xs text-muted-foreground">{item.size_spec}</p>}
                        </div>
                        {match ? (
                          match.matchType === "full" ? (
                            <Badge className="bg-emerald-100 text-emerald-700 shrink-0 gap-1"><CheckCircle2 className="w-3 h-3" /> Full match</Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-700 shrink-0 gap-1"><AlertCircle className="w-3 h-3" /> Partial · {match.availableQty} of {match.requestedQty}</Badge>
                          )
                        ) : (
                          <Badge variant="outline" className="shrink-0 text-muted-foreground">No match</Badge>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="mt-3 flex gap-2">
                    <Button variant="outline" size="sm" asChild><Link to={`/rfqs/${r.id}`}>View Request</Link></Button>
                    {alreadyQuoted ? (
                      <Button variant="secondary" size="sm" asChild className="flex-1"><Link to={`/rfqs/${r.id}`}><CheckCircle2 className="w-4 h-4 mr-1" /> View My Quote</Link></Button>
                    ) : (
                      <Button size="sm" asChild className="flex-1"><Link to={`/vendor/rfqs/${r.id}/quote`}>Prepare Quote <ChevronRight className="w-4 h-4" /></Link></Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>

          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" onClick={() => load(false)} disabled={loadingMore}>
                {loadingMore ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading…</> : "Load More"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}