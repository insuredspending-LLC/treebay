import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { MapPin, Calendar, Check, MessageSquare, Package, Trophy, Loader2, ShieldCheck, Truck, Store, Clock, FileText } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import VerifiedBadge from "@/components/VerifiedBadge";
import StarRating from "@/components/StarRating";
import EmptyState from "@/components/EmptyState";
import SectionHeader from "@/components/SectionHeader";
import { RFQ_STATUS_LABELS, QUOTE_STATUS_LABELS, shortDate, formatCurrency, formatNumber, apiError } from "@/lib/treebay";

export default function RFQDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [rfq, setRfq] = useState(null);
  const [quotes, setQuotes] = useState([]);
  const [vendors, setVendors] = useState({});
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await base44.entities.RFQ.get(id);
      setRfq(r);
      const qs = await base44.entities.VendorQuote.filter({ rfq_id: id }, "-created_date", 50) || [];
      setQuotes(qs);
      // Fetch vendor profiles for verification status
      const vendorIds = [...new Set(qs.map((q) => q.vendor_id).filter(Boolean))];
      const vMap = {};
      await Promise.all(vendorIds.map(async (vid) => {
        try { vMap[vid] = await base44.entities.VendorProfile.get(vid); } catch {}
      }));
      setVendors(vMap);
    } catch {}
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [id]);

  if (loading) return (
    <div className="space-y-4">
      <div className="h-8 w-1/3 rounded-lg bg-muted skeleton-shimmer" />
      <div className="h-32 rounded-2xl bg-muted skeleton-shimmer" />
      <div className="h-48 rounded-2xl bg-muted skeleton-shimmer" />
    </div>
  );
  if (!rfq) return <p className="text-center text-muted-foreground py-16">RFQ not found.</p>;

  const acceptQuote = async (q) => {
    if (q.status === "accepted" || rfq.status === "awarded" || rfq.status === "closed" || rfq.status === "cancelled") {
      toast({ title: "This RFQ is no longer accepting quotes", variant: "destructive" });
      return;
    }
    setAccepting(q.id);
    try {
      const { data } = await base44.functions.invoke("acceptQuote", { quoteId: q.id });
      toast({ title: "Quote accepted", description: "Review your final delivered price." });
      navigate(`/checkout?quote=${data.checkoutQuote.id}`);
    } catch (e) { toast({ title: "Could not accept quote", description: apiError(e), variant: "destructive" }); }
    finally { setAccepting(null); }
  };

  const message = async (q) => {
    try {
      const { data } = await base44.functions.invoke("startConversation", { type: "rfq", referenceId: rfq.id, vendorOwnerId: q.vendor_owner_id });
      navigate(`/messages/${data.conversationId}`);
    } catch (e) { toast({ title: "Could not open conversation", description: apiError(e), variant: "destructive" }); }
  };

  const sorted = quotes.slice().sort((a, b) => (a.quote_total || 0) - (b.quote_total || 0));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-heading font-bold">RFQ · {rfq.delivery_city}, {rfq.delivery_state}</h1>
          <p className="text-sm text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1">
            <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {rfq.delivery_city}, {rfq.delivery_state} {rfq.delivery_zip}</span>
            {rfq.quote_deadline && <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Quote by {shortDate(rfq.quote_deadline)}</span>}
          </p>
        </div>
        <StatusBadge status={rfq.status} label={RFQ_STATUS_LABELS[rfq.status]} />
      </div>
      {rfq.notes && <p className="text-sm text-muted-foreground">{rfq.notes}</p>}

      {/* Requirements */}
      <div>
        <SectionHeader title="Requested items" icon={Package} />
        <Card className="p-4 mt-3 card-shadow">
          <div className="space-y-2">
            {(rfq.items || []).map((it, i) => (
              <div key={i} className="flex justify-between text-sm py-1.5 border-b border-border last:border-0">
                <div>
                  <p className="font-medium">{it.common_name}</p>
                  {it.botanical_name && <p className="text-xs text-muted-foreground italic">{it.botanical_name}</p>}
                  {it.size_spec && <p className="text-xs text-muted-foreground">{it.size_spec}</p>}
                </div>
                <span className="font-semibold">{formatNumber(it.quantity)} units</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Quote comparison */}
      <div>
        <SectionHeader title={`Quotes (${quotes.length})`} icon={Trophy} />
        {quotes.length === 0 ? (
          <EmptyState icon={Trophy} title="No quotes yet" description="Vendors will appear here as they respond with pricing." />
        ) : (
          <div className="space-y-3 mt-3">
            {sorted.map((q, idx) => {
              const vendor = vendors[q.vendor_id];
              const isVerified = vendor?.verification_status === "verified";
              const isBest = idx === 0 && q.quote_total > 0;
              const canAccept = q.status !== "accepted" && q.status !== "declined" && accepting !== q.id && (rfq.status === "open" || rfq.status === "quotes_received" || rfq.status === "checkout_pending");
              return (
                <Card key={q.id} className={"p-5 card-shadow " + (isBest ? "border-emerald-400 ring-1 ring-emerald-300" : "")}>
                  {/* Grower header */}
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center shrink-0"><Store className="w-6 h-6 text-primary" /></div>
                      <div>
                        <p className="font-heading font-semibold flex items-center gap-2">
                          {q.vendor_name}
                          {isVerified && <VerifiedBadge status="verified" />}
                          {isBest && <Badge className="bg-emerald-100 text-emerald-700 border-0">Lowest total</Badge>}
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" /> {q.vendor_city}, {q.vendor_state}</p>
                        {vendor && <div className="mt-1"><StarRating value={vendor.rating} count={vendor.review_count} size="w-3 h-3" /></div>}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-heading font-bold text-primary">{formatCurrency(q.quote_total || 0)}</p>
                      <p className="text-[11px] text-muted-foreground">Merchandise + delivery</p>
                      <StatusBadge status={q.status} label={QUOTE_STATUS_LABELS[q.status]} />
                    </div>
                  </div>

                  <Separator className="my-4" />

                  {/* Line items with details */}
                  <div className="space-y-3">
                    {(q.items || []).map((it, i) => (
                      <div key={i} className="text-sm">
                        <div className="flex justify-between">
                          <p className="font-medium">{it.line_name}</p>
                          <span className="font-medium">{formatCurrency(it.subtotal)}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                          <span>Qty offered: <span className="text-foreground font-medium">{formatNumber(it.quantity_offered)}</span></span>
                          <span>Unit price: <span className="text-foreground font-medium">{formatCurrency(it.unit_price)}</span></span>
                          {it.availability && <span>Availability: <span className="text-foreground font-medium">{it.availability}</span></span>}
                          {it.estimated_ready_date && <span>Ready: <span className="text-foreground font-medium">{shortDate(it.estimated_ready_date)}</span></span>}
                          {it.delivery_offered && <span className="flex items-center gap-1"><Truck className="w-3 h-3" /> Delivery: <span className="text-foreground font-medium">{formatCurrency(it.delivery_price || 0)}</span></span>}
                          {it.substitution_details && <span className="col-span-2">Substitution: <span className="text-foreground">{it.substitution_details}</span></span>}
                        </div>
                      </div>
                    ))}
                  </div>

                  <Separator className="my-3" />
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Expires {shortDate(q.expiration_date)}</span>
                  </div>
                  {q.vendor_notes && <p className="text-sm text-muted-foreground mt-2 italic bg-muted/50 rounded-lg p-2">"{q.vendor_notes}"</p>}

                  {/* Actions */}
                  <div className="flex gap-2 mt-4">
                    <Button onClick={() => acceptQuote(q)} disabled={!canAccept} className="flex-1">
                      {accepting === q.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                      {q.status === "accepted" ? "Accepted" : q.status === "pending_acceptance" ? "Continue to checkout" : !canAccept ? "Closed" : "Accept quote"}
                    </Button>
                    <Button variant="outline" onClick={() => message(q)}><MessageSquare className="w-4 h-4 mr-2" /> Message</Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2 text-center">Taxes and TreEbay fees are calculated at checkout.</p>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}