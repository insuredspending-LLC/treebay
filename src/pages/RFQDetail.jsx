import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, MapPin, Calendar, Check, MessageSquare, Package, Trophy, Loader2, ShieldCheck } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import StarRating from "@/components/StarRating";
import EmptyState from "@/components/EmptyState";
import { RFQ_STATUS_LABELS, QUOTE_STATUS_LABELS, shortDate, formatCurrency, formatNumber, approxDistance, genOrderNumber, createNotification } from "@/lib/treebay";

export default function RFQDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [rfq, setRfq] = useState(null);
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await base44.entities.RFQ.get(id);
      setRfq(r);
      setQuotes(await base44.entities.VendorQuote.filter({ rfq_id: id }, "-created_date", 50) || []);
    } catch {}
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [id]);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;
  if (!rfq) return <p className="text-center text-muted-foreground py-16">RFQ not found.</p>;

  const myCity = `${rfq.delivery_city}, ${rfq.delivery_state}`;

  const acceptQuote = async (q) => {
    setAccepting(q.id);
    try {
      const me = await base44.auth.me();
      const orderNumber = genOrderNumber();
      const orderItems = (q.items || []).map((i) => ({ line_name: i.line_name, quantity: i.quantity_offered, unit_price: i.unit_price, subtotal: i.subtotal }));
      const order = await base44.entities.Order.create({
        order_number: orderNumber, buyer_id: rfq.buyer_id, vendor_id: q.vendor_id, vendor_owner_id: q.vendor_owner_id,
        vendor_name: q.vendor_name, rfq_id: rfq.id, quote_id: q.id, items: orderItems,
        subtotal: orderItems.reduce((s, i) => s + (i.subtotal || 0), 0),
        delivery_charges: (q.items || []).reduce((s, i) => s + (i.delivery_price || 0), 0),
        taxes: (q.items || []).reduce((s, i) => s + (i.taxes || 0), 0),
        platform_fees: 0, total: q.quote_total || 0,
        fulfillment_method: (q.items || []).some((i) => i.delivery_offered) ? "vendor_delivery" : "pickup",
        destination_city: rfq.delivery_city, destination_state: rfq.delivery_state, destination_zip: rfq.delivery_zip,
        requested_date: rfq.requested_delivery_date, payment_status: "pending", order_status: "pending",
      });
      await base44.entities.VendorQuote.update(q.id, { status: "accepted" });
      await base44.entities.RFQ.update(rfq.id, { status: "awarded" });
      // decline other quotes
      for (const other of quotes.filter((x) => x.id !== q.id && x.status === "submitted")) {
        try { await base44.entities.VendorQuote.update(other.id, { status: "declined" }); } catch {}
      }
      await createNotification(q.vendor_owner_id, "quote_accepted", "Quote accepted!", `Order ${orderNumber}`, "order", order.id);
      toast({ title: "Quote accepted", description: `Order ${orderNumber} created.` });
      navigate(`/orders/${order.id}`);
    } catch (e) { toast({ title: "Could not accept quote", description: e.message, variant: "destructive" }); }
    finally { setAccepting(null); }
  };

  const message = async (q) => {
    try {
      const me = await base44.auth.me();
      const conv = await base44.entities.Conversation.create({ type: "rfq", reference_id: rfq.id, reference_label: `RFQ · ${rfq.delivery_city}`, buyer_id: me.id, vendor_owner_id: q.vendor_owner_id, vendor_id: q.vendor_id });
      navigate(`/messages/${conv.id}`);
    } catch (e) { toast({ title: "Could not open conversation", variant: "destructive" }); }
  };

  const sorted = quotes.slice().sort((a, b) => (a.quote_total || 0) - (b.quote_total || 0));

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">RFQ · {rfq.delivery_city}, {rfq.delivery_state}</h1>
            <p className="text-sm text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1">
              <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {rfq.delivery_city}, {rfq.delivery_state} {rfq.delivery_zip}</span>
              {rfq.quote_deadline && <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Quote by {shortDate(rfq.quote_deadline)}</span>}
            </p>
          </div>
          <StatusBadge status={rfq.status} label={RFQ_STATUS_LABELS[rfq.status]} />
        </div>
        {rfq.notes && <p className="text-sm text-muted-foreground mt-2">{rfq.notes}</p>}
      </div>

      <Card className="p-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2"><Package className="w-4 h-4" /> Requirements</h2>
        <div className="space-y-2">
          {(rfq.items || []).map((it, i) => (
            <div key={i} className="flex justify-between text-sm py-1.5 border-b border-border last:border-0">
              <div><p className="font-medium">{it.common_name}</p>{it.botanical_name && <p className="text-xs text-muted-foreground italic">{it.botanical_name}</p>}{it.size_spec && <p className="text-xs text-muted-foreground">{it.size_spec}</p>}</div>
              <span className="font-semibold">{formatNumber(it.quantity)} units</span>
            </div>
          ))}
        </div>
      </Card>

      <div>
        <h2 className="font-semibold mb-3 flex items-center gap-2"><Trophy className="w-4 h-4" /> Quotes ({quotes.length})</h2>
        {quotes.length === 0 ? (
          <EmptyState icon={Trophy} title="No quotes yet" description="Vendors will appear here as they respond." />
        ) : (
          <div className="space-y-3">
            {sorted.map((q, idx) => {
              const dist = approxDistance(myCity, `${q.vendor_city}, ${q.vendor_state}`);
              const isBest = idx === 0 && q.quote_total > 0;
              return (
                <Card key={q.id} className={"p-4 " + (isBest ? "border-emerald-400 ring-1 ring-emerald-300" : "")}>
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <p className="font-semibold flex items-center gap-2">{q.vendor_name}{isBest && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">Lowest total</span>}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" /> {q.vendor_city}, {q.vendor_state}{dist !== null && ` · ${dist} mi`}</p>
                      <StarRating value={q.rating} showNumber={false} size="w-3 h-3" />
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-primary">{formatCurrency(q.quote_total || 0)}</p>
                      <StatusBadge status={q.status} label={QUOTE_STATUS_LABELS[q.status]} />
                    </div>
                  </div>

                  <div className="mt-3 space-y-1 text-sm">
                    {(q.items || []).map((it, i) => (
                      <div key={i} className="flex justify-between py-1 border-t border-border">
                        <div><p>{it.line_name}</p><p className="text-xs text-muted-foreground">{formatNumber(it.quantity_offered)} × {formatCurrency(it.unit_price)}{it.delivery_offered ? ` + ${formatCurrency(it.delivery_price)} delivery` : ""}</p></div>
                        <span className="font-medium">{formatCurrency(it.subtotal + (it.delivery_price || 0) + (it.taxes || 0) + (it.additional_fees || 0))}</span>
                      </div>
                    ))}
                  </div>
                  <Separator className="my-2" />
                  <div className="flex justify-between text-sm text-muted-foreground"><span>Expires</span><span>{shortDate(q.expiration_date)}</span></div>
                  {q.vendor_notes && <p className="text-xs text-muted-foreground mt-2 italic">"{q.vendor_notes}"</p>}

                  <div className="flex gap-2 mt-3">
                    <Button onClick={() => acceptQuote(q)} disabled={q.status === "accepted" || q.status === "declined" || accepting === q.id} className="flex-1">
                      {accepting === q.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                      {q.status === "accepted" ? "Accepted" : "Accept quote"}
                    </Button>
                    <Button variant="outline" onClick={() => message(q)}><MessageSquare className="w-4 h-4 mr-2" /> Message</Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}