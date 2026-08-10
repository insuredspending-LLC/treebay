import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ArrowLeft, ShieldCheck, AlertTriangle, MapPin, Truck, Package } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { formatCents, apiError, TEST_MODE } from "@/lib/treebay";

export default function Checkout() {
  const [params] = useSearchParams();
  const quoteId = params.get("quote");
  const navigate = useNavigate();
  const { toast } = useToast();
  const [quote, setQuote] = useState(null);
  const [options, setOptions] = useState([]);
  const [vendor, setVendor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [applyingDelivery, setApplyingDelivery] = useState(false);
  const [selectedOption, setSelectedOption] = useState(null);
  const [address, setAddress] = useState({ name: "", street: "", city: "", state: "", zip: "", instructions: "", contact_name: "", contact_phone: "" });

  useEffect(() => {
    (async () => {
      if (!quoteId) { setLoading(false); return; }
      try {
        const cq = await base44.entities.CheckoutQuote.get(quoteId);
        setQuote(cq);
        setAddress((p) => ({ ...p, city: cq.destination_city || "", state: cq.destination_state || "", zip: cq.destination_zip || "" }));
        const opts = await base44.entities.DeliveryOption.filter({ checkout_quote_id: quoteId }) || [];
        setOptions(opts.filter((o) => o.status === "available" || o.status === "selected"));
        if (cq.delivery_method) {
          const sel = opts.find((o) => o.provider_type === cq.delivery_method);
          if (sel) setSelectedOption(sel.id);
        }
        if (cq.vendor_id) { try { setVendor(await base44.entities.VendorProfile.get(cq.vendor_id)); } catch {} }
      } catch (e) { toast({ title: "Could not load quote", description: apiError(e), variant: "destructive" }); }
      finally { setLoading(false); }
    })();
  }, [quoteId]);

  const applyDelivery = async (optionId, addr) => {
    setApplyingDelivery(true);
    try {
      const opt = options.find((o) => o.id === optionId);
      const isPickup = opt?.provider_type === "buyer_pickup";
      const { data } = await base44.functions.invoke("selectDeliveryOption", {
        checkoutQuoteId: quoteId, deliveryOptionId: optionId,
        address: isPickup ? null : addr,
      });
      setQuote(data.checkoutQuote);
      setSelectedOption(optionId);
      toast({ title: "Delivery option applied" });
    } catch (e) { toast({ title: "Could not apply delivery option", description: apiError(e), variant: "destructive" }); }
    finally { setApplyingDelivery(false); }
  };

  const placeOrder = async () => {
    if (!quote.delivery_method) { toast({ title: "Please select a delivery option", variant: "destructive" }); return; }
    setPlacing(true);
    try {
      const { data } = await base44.functions.invoke("createOrderFromCheckout", { checkoutQuoteId: quoteId });
      toast({ title: "Order placed", description: data.order.order_number });
      navigate(`/orders/${data.order.id}`);
    } catch (e) { toast({ title: "Could not place order", description: apiError(e), variant: "destructive" }); }
    finally { setPlacing(false); }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;
  if (!quote) return <div className="py-16 text-center text-muted-foreground">No checkout quote found. <Button variant="link" onClick={() => navigate(-1)}>Go back</Button></div>;

  const expired = quote.expiration_at && new Date(quote.expiration_at) < new Date();
  const deliveryReady = !!quote.delivery_method;

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

      {vendor && (
        <Card className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center font-bold text-primary">{(vendor.business_name || "V").slice(0, 1)}</div>
          <div><p className="text-xs text-muted-foreground">Seller</p><p className="font-semibold text-sm">{vendor.business_name}</p><p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" /> {vendor.city}, {vendor.state}</p></div>
        </Card>
      )}

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Products</h2>
        {(quote.items || []).map((i, idx) => (
          <div key={idx} className="flex justify-between text-sm">
            <div><p className="font-medium">{i.line_name}</p><p className="text-muted-foreground">{i.quantity} × {formatCents(i.unit_price_cents)}</p></div>
            <span className="font-medium">{formatCents(i.subtotal_cents)}</span>
          </div>
        ))}
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Delivery options</h2>
        <div className="space-y-2">
          {options.map((opt) => (
            <label key={opt.id} className={"flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors " + (selectedOption === opt.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50")}>
              <input type="radio" name="delivery" checked={selectedOption === opt.id} onChange={() => setSelectedOption(opt.id)} className="accent-primary" />
              {opt.provider_type === "buyer_pickup" ? <Package className="w-4 h-4 text-muted-foreground" /> : <Truck className="w-4 h-4 text-muted-foreground" />}
              <div className="flex-1">
                <p className="text-sm font-medium capitalize">{opt.service_type || opt.provider_type.replace(/_/g, " ")}</p>
                <p className="text-xs text-muted-foreground">{formatCents(opt.delivery_price_cents)}{opt.estimated_delivery_days ? ` · ${opt.estimated_delivery_days} day(s)` : ""}</p>
              </div>
            </label>
          ))}
        </div>
        {selectedOption && (() => {
          const opt = options.find((o) => o.id === selectedOption);
          if (!opt || opt.provider_type === "buyer_pickup") return null;
          return (
            <div className="space-y-2 pt-2 border-t border-border">
              <p className="text-sm font-medium">Delivery address</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2 space-y-1"><Label htmlFor="name">Recipient name</Label><Input id="name" value={address.name} onChange={(e) => setAddress((p) => ({ ...p, name: e.target.value }))} placeholder="Full name" /></div>
                <div className="space-y-1"><Label htmlFor="phone">Phone</Label><Input id="phone" value={address.contact_phone} onChange={(e) => setAddress((p) => ({ ...p, contact_phone: e.target.value }))} placeholder="Phone number" /></div>
                <div className="col-span-2 space-y-1"><Label htmlFor="street">Street address</Label><Input id="street" value={address.street} onChange={(e) => setAddress((p) => ({ ...p, street: e.target.value }))} placeholder="Street address" /></div>
                <div className="space-y-1"><Label htmlFor="city">City</Label><Input id="city" value={address.city} onChange={(e) => setAddress((p) => ({ ...p, city: e.target.value }))} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><Label htmlFor="state">State</Label><Input id="state" value={address.state} onChange={(e) => setAddress((p) => ({ ...p, state: e.target.value }))} /></div>
                  <div className="space-y-1"><Label htmlFor="zip">ZIP</Label><Input id="zip" value={address.zip} onChange={(e) => setAddress((p) => ({ ...p, zip: e.target.value }))} /></div>
                </div>
                <div className="col-span-2 space-y-1"><Label htmlFor="instructions">Delivery instructions (optional)</Label><Textarea id="instructions" value={address.instructions} onChange={(e) => setAddress((p) => ({ ...p, instructions: e.target.value }))} rows={2} /></div>
              </div>
              <Button variant="outline" size="sm" onClick={() => applyDelivery(selectedOption, address)} disabled={applyingDelivery}>
                {applyingDelivery ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Apply delivery option
              </Button>
            </div>
          );
        })()}
        {selectedOption && (() => {
          const opt = options.find((o) => o.id === selectedOption);
          if (opt?.provider_type === "buyer_pickup" && quote.delivery_method !== "buyer_pickup") {
            return <Button variant="outline" size="sm" onClick={() => applyDelivery(selectedOption, null)} disabled={applyingDelivery}>{applyingDelivery ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Confirm pickup</Button>;
          }
          return null;
        })()}
      </Card>

      <Card className="p-4 space-y-2 text-sm">
        <Row label="Merchandise" value={formatCents(quote.merchandise_subtotal_cents)} />
        {quote.bulk_discount_cents > 0 && <Row label="Bulk discount" value={"-" + formatCents(quote.bulk_discount_cents)} />}
        <Row label={"Delivery" + (quote.delivery_method ? " (" + quote.delivery_method.replace(/_/g, " ") + ")" : " (select option)")} value={formatCents(quote.delivery_amount_cents)} />
        <Row label="TreEbay marketplace fee" value={formatCents(quote.marketplace_fee_cents)} />
        <Row label={"Sales tax" + (quote.tax_status === "test_estimated" ? " (TEST/ESTIMATED)" : "")} value={formatCents(quote.tax_amount_cents)} />
        <div className="border-t border-border pt-2 flex justify-between font-bold text-base">
          <span>Total</span><span>{formatCents(quote.total_amount_cents)}</span>
        </div>
      </Card>

      {quote.delivery_method && quote.destination_city && (
        <Card className="p-4 text-sm space-y-1">
          <p className="font-semibold mb-1">Destination</p>
          <p className="text-muted-foreground">{quote.destination_name || quote.contact_name || "—"}</p>
          <p className="text-muted-foreground">{quote.destination_street || "—"}</p>
          <p className="text-muted-foreground">{[quote.destination_city, quote.destination_state, quote.destination_zip].filter(Boolean).join(", ") || "—"}</p>
          {quote.delivery_instructions && <p className="text-muted-foreground italic">"{quote.delivery_instructions}"</p>}
        </Card>
      )}

      <div className="text-xs text-muted-foreground">Quote expires {new Date(quote.expiration_at).toLocaleTimeString()}. Reserved inventory is held for 30 minutes.</div>

      <Button onClick={placeOrder} disabled={placing || expired || !deliveryReady} className="w-full h-12 text-base font-medium">
        {placing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />} Confirm & Place Order
      </Button>
      {!deliveryReady && <p className="text-xs text-center text-muted-foreground">Select a delivery option to continue.</p>}
    </div>
  );
}

function Row({ label, value }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span className="font-medium">{value}</span></div>;
}