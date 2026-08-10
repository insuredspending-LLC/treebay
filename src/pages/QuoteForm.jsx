import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAppUser } from "@/hooks/useAppUser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import { ArrowLeft, Save, Loader2, MapPin, Calendar } from "lucide-react";
import { formatCurrency, shortDate, apiError } from "@/lib/treebay";

export default function QuoteForm() {
  const { rfqId } = useParams();
  const navigate = useNavigate();
  const { vendorProfiles } = useAppUser();
  const vendor = vendorProfiles[0];
  const { toast } = useToast();
  const [rfq, setRfq] = useState(null);
  const [lines, setLines] = useState([]);
  const [expiration_date, setExpiration] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await base44.entities.RFQ.get(rfqId);
        setRfq(r);
        setLines((r.items || []).map((it) => ({ line_name: it.common_name, quantity_offered: it.quantity, unit_price: 0, subtotal: 0, availability: "In stock", estimated_ready_date: "", delivery_offered: r.delivery_required, delivery_price: 0, substitution_details: "" })));
      } catch {}
      finally { setLoading(false); }
    })();
  }, [rfqId]);

  const update = (i, key, val) => setLines((p) => { const n = [...p]; const v = key === "delivery_offered" ? val : (typeof n[i][key] === "number" ? Number(val) || 0 : val); n[i] = { ...n[i], [key]: v, subtotal: (n[i].quantity_offered || 0) * (key === "unit_price" ? Number(val) || 0 : n[i].unit_price || 0) }; return n; });

  const total = lines.reduce((s, l) => s + (l.subtotal || 0) + (l.delivery_offered ? (l.delivery_price || 0) : 0), 0);

  const submit = async () => {
    if (!vendor) { toast({ title: "No vendor profile", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await base44.functions.invoke("submitQuote", { rfqId, items: lines, expiration_date, vendor_notes: notes });
      toast({ title: "Quote submitted" });
      navigate("/vendor/rfqs");
    } catch (e) { toast({ title: "Could not submit", description: apiError(e), variant: "destructive" }); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;
  if (!rfq) return <p className="text-center text-muted-foreground py-16">RFQ not found.</p>;

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold">Submit quote</h1>
        <p className="text-sm text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1">
          <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {rfq.delivery_city}, {rfq.delivery_state} {rfq.delivery_zip}</span>
          {rfq.requested_delivery_date && <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {shortDate(rfq.requested_delivery_date)}</span>}
        </p>
      </div>

      <div className="space-y-3">
        {lines.map((l, i) => (
          <Card key={i} className="p-4 space-y-3">
            <p className="font-semibold text-sm">{l.line_name} · {l.quantity_offered} units</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label className="text-xs">Quantity</Label><Input type="number" min="1" value={l.quantity_offered} onChange={(e) => update(i, "quantity_offered", e.target.value)} className="h-10" /></div>
              <div className="space-y-1"><Label className="text-xs">Unit price</Label><Input type="number" value={l.unit_price} onChange={(e) => update(i, "unit_price", e.target.value)} className="h-10" /></div>
              <div className="space-y-1"><Label className="text-xs">Availability</Label><Input value={l.availability} onChange={(e) => update(i, "availability", e.target.value)} className="h-10" placeholder="In stock" /></div>
              <div className="space-y-1"><Label className="text-xs">Est. ready date</Label><Input type="date" value={l.estimated_ready_date} onChange={(e) => update(i, "estimated_ready_date", e.target.value)} className="h-10" /></div>
              <div className="space-y-1"><Label className="text-xs">Delivery price</Label><Input type="number" value={l.delivery_price} onChange={(e) => update(i, "delivery_price", e.target.value)} className="h-10" /></div>
              <div className="col-span-2 text-sm text-muted-foreground">Taxes and TreEbay fees are calculated at checkout.</div>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={l.delivery_offered} onChange={(e) => update(i, "delivery_offered", e.target.checked)} /> Delivery offered</label>
            <div className="space-y-1"><Label className="text-xs">Substitution details (optional)</Label><Input value={l.substitution_details} onChange={(e) => update(i, "substitution_details", e.target.value)} className="h-10" placeholder="Equivalent cultivar offered" /></div>
            <div className="flex justify-between text-sm pt-1"><span className="text-muted-foreground">Line total</span><span className="font-semibold">{formatCurrency((l.subtotal || 0) + (l.delivery_offered ? (l.delivery_price || 0) : 0))}</span></div>
          </Card>
        ))}
      </div>

      <Card className="p-4 space-y-3">
        <div className="space-y-1"><Label>Quote expiration date</Label><Input type="date" value={expiration_date} onChange={(e) => setExpiration(e.target.value)} /></div>
        <div className="space-y-1"><Label>Notes to buyer (optional)</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
        <Separator />
        <div className="flex justify-between font-bold text-base"><span>Quote total</span><span className="text-primary">{formatCurrency(total)}</span></div>
      </Card>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => navigate("/vendor/rfqs")}>Cancel</Button>
        <Button className="flex-1" onClick={submit} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}Submit quote</Button>
      </div>
    </div>
  );
}