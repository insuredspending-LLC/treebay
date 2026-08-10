import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, ShieldCheck, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { formatCents, apiError, TEST_MODE } from "@/lib/treebay";

export default function Checkout() {
  const [params] = useSearchParams();
  const quoteId = params.get("quote");
  const navigate = useNavigate();
  const { toast } = useToast();
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    (async () => {
      if (!quoteId) { setLoading(false); return; }
      try {
        const cq = await base44.entities.CheckoutQuote.get(quoteId);
        setQuote(cq);
      } catch (e) { toast({ title: "Could not load quote", description: apiError(e), variant: "destructive" }); }
      finally { setLoading(false); }
    })();
  }, [quoteId]);

  const placeOrder = async () => {
    setPlacing(true);
    try {
      const { data } = await base44.functions.invoke("createOrder", { checkoutQuoteId: quoteId });
      toast({ title: "Order placed", description: data.order.order_number });
      navigate(`/orders/${data.order.id}`);
    } catch (e) { toast({ title: "Could not place order", description: apiError(e), variant: "destructive" }); }
    finally { setPlacing(false); }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;
  if (!quote) return <div className="py-16 text-center text-muted-foreground">No checkout quote found. <Button variant="link" onClick={() => navigate(-1)}>Go back</Button></div>;

  const expired = quote.expiration_at && new Date(quote.expiration_at) < new Date();

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
      <button onClick={() => navigate(-1)} className="text-sm text-muted-foreground flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Back</button>
      <h1 className="text-2xl font-bold">Checkout</h1>
      <p className="text-sm text-muted-foreground">Final delivered price — all fees disclosed upfront.</p>
      {TEST_MODE && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" /> Test mode — payments and tax are simulated. No real money is charged.
        </div>
      )}
      {expired && <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-sm">This quote has expired. Please go back and recalculate.</div>}

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Products</h2>
        {(quote.items || []).map((i, idx) => (
          <div key={idx} className="flex justify-between text-sm">
            <div><p className="font-medium">{i.line_name}</p><p className="text-muted-foreground">{i.quantity} × {formatCents(i.unit_price_cents)}</p></div>
            <span className="font-medium">{formatCents(i.subtotal_cents)}</span>
          </div>
        ))}
      </Card>

      <Card className="p-4 space-y-2 text-sm">
        <Row label="Merchandise" value={formatCents(quote.merchandise_subtotal_cents)} />
        {quote.bulk_discount_cents > 0 && <Row label="Bulk discount" value={"-" + formatCents(quote.bulk_discount_cents)} />}
        <Row label={"Delivery (" + (quote.delivery_method || "").replace(/_/g, " ") + ")"} value={formatCents(quote.delivery_amount_cents)} />
        <Row label="TreEbay marketplace fee" value={formatCents(quote.marketplace_fee_cents)} />
        <Row label={"Sales tax" + (quote.tax_status === "test_estimated" ? " (TEST/ESTIMATED)" : "")} value={formatCents(quote.tax_amount_cents)} />
        <div className="border-t border-border pt-2 flex justify-between font-bold text-base">
          <span>Total</span><span>{formatCents(quote.total_amount_cents)}</span>
        </div>
      </Card>

      <div className="text-xs text-muted-foreground">Quote expires {new Date(quote.expiration_at).toLocaleTimeString()}. Reserved inventory is held for 30 minutes.</div>

      <Button onClick={placeOrder} disabled={placing || expired} className="w-full h-12 text-base font-medium">
        {placing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />} Confirm & Place Order
      </Button>
    </div>
  );
}

function Row({ label, value }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span className="font-medium">{value}</span></div>;
}