import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAppUser } from "@/hooks/useAppUser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { Save, Loader2, MapPin, Calendar, Check, Package, DollarSign, Truck, FileText, ClipboardList } from "lucide-react";
import { formatCurrency, shortDate, apiError } from "@/lib/treebay";

function SectionTitle({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-primary" />
      <h2 className="font-heading font-semibold text-sm uppercase tracking-wide text-muted-foreground">{title}</h2>
    </div>
  );
}

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
        setLines((r.items || []).map((it) => ({
          line_name: it.common_name || it.botanical_name,
          quantity_offered: it.quantity,
          unit_price: 0,
          subtotal: 0,
          availability: "In stock",
          estimated_ready_date: "",
          delivery_offered: r.delivery_required,
          delivery_price: 0,
          substitution_details: "",
        })));
      } catch {}
      finally { setLoading(false); }
    })();
  }, [rfqId]);

  const update = (i, key, val) => setLines((p) => {
    const n = [...p];
    const v = key === "delivery_offered" ? val : (typeof n[i][key] === "number" ? Number(val) || 0 : val);
    n[i] = { ...n[i], [key]: v, subtotal: (n[i].quantity_offered || 0) * (key === "unit_price" ? Number(val) || 0 : n[i].unit_price || 0) };
    return n;
  });

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
        <h1 className="text-xl font-bold">Prepare Quote</h1>
        <p className="text-sm text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1">
          <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {rfq.delivery_city}, {rfq.delivery_state} {rfq.delivery_zip}</span>
          {rfq.requested_delivery_date && <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Needed {shortDate(rfq.requested_delivery_date)}</span>}
        </p>
      </div>

      {/* Requested Items */}
      <Card className="p-4">
        <SectionTitle icon={ClipboardList} title="Requested Items" />
        <div className="space-y-2">
          {(rfq.items || []).map((it, i) => (
            <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-border last:border-0">
              <div><p className="font-medium">{it.quantity} × {it.common_name || it.botanical_name}</p>{it.size_spec && <p className="text-xs text-muted-foreground">{it.size_spec}</p>}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Your Offer */}
      <Card className="p-4">
        <SectionTitle icon={DollarSign} title="Your Offer" />
        <div className="space-y-3">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-12 sm:col-span-6"><p className="text-sm font-medium pb-2">{l.line_name}</p></div>
              <div className="col-span-6 sm:col-span-3 space-y-1"><Label className="text-xs">Qty offered</Label><Input type="number" min="1" value={l.quantity_offered} onChange={(e) => update(i, "quantity_offered", e.target.value)} className="h-10" /></div>
              <div className="col-span-6 sm:col-span-3 space-y-1"><Label className="text-xs">Unit price</Label><Input type="number" value={l.unit_price} onChange={(e) => update(i, "unit_price", e.target.value)} className="h-10" /></div>
            </div>
          ))}
        </div>
      </Card>

      {/* Availability */}
      <Card className="p-4">
        <SectionTitle icon={Package} title="Availability" />
        <div className="space-y-3">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 items-end">
              <div><p className="text-sm font-medium">{l.line_name}</p></div>
              <div className="space-y-1"><Input value={l.availability} onChange={(e) => update(i, "availability", e.target.value)} className="h-10" placeholder="In stock" /></div>
            </div>
          ))}
        </div>
      </Card>

      {/* Ready Date */}
      <Card className="p-4">
        <SectionTitle icon={Calendar} title="Ready Date" />
        <div className="space-y-3">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 items-end">
              <div><p className="text-sm font-medium">{l.line_name}</p></div>
              <div className="space-y-1"><Input type="date" value={l.estimated_ready_date} onChange={(e) => update(i, "estimated_ready_date", e.target.value)} className="h-10" /></div>
            </div>
          ))}
        </div>
      </Card>

      {/* Delivery */}
      <Card className="p-4">
        <SectionTitle icon={Truck} title="Delivery" />
        <div className="space-y-3">
          {lines.map((l, i) => (
            <div key={i} className={"rounded-lg border border-border p-3 " + (l.delivery_offered ? "" : "opacity-60")}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{l.line_name}</p>
                <label className="flex items-center gap-2 text-sm"><Switch checked={l.delivery_offered} onCheckedChange={(v) => update(i, "delivery_offered", v)} /> Delivery offered</label>
              </div>
              {l.delivery_offered && (
                <div className="mt-2 grid grid-cols-2 gap-2 items-end">
                  <div className="space-y-1"><Label className="text-xs">Delivery price</Label><Input type="number" value={l.delivery_price} onChange={(e) => update(i, "delivery_price", e.target.value)} className="h-10" /></div>
                  <div className="text-right text-sm text-muted-foreground">Line delivery: {formatCurrency(l.delivery_price || 0)}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Substitution */}
      <Card className="p-4">
        <SectionTitle icon={FileText} title="Substitution" />
        <div className="space-y-3">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-1 gap-1">
              <Label className="text-xs">{l.line_name}</Label>
              <Input value={l.substitution_details} onChange={(e) => update(i, "substitution_details", e.target.value)} className="h-10" placeholder="Equivalent cultivar offered (optional)" />
            </div>
          ))}
        </div>
      </Card>

      {/* Notes */}
      <Card className="p-4 space-y-3">
        <SectionTitle icon={FileText} title="Notes" />
        <div className="space-y-1.5"><Label>Quote expiration date</Label><Input type="date" value={expiration_date} onChange={(e) => setExpiration(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Notes to buyer (optional)</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
      </Card>

      {/* Review */}
      <Card className="p-4 space-y-3">
        <SectionTitle icon={Check} title="Review" />
        <div className="space-y-1.5 text-sm">
          {lines.map((l, i) => (
            <div key={i} className="flex justify-between">
              <span className="text-muted-foreground">{l.line_name}</span>
              <span className="font-medium">{formatCurrency((l.subtotal || 0) + (l.delivery_offered ? (l.delivery_price || 0) : 0))}</span>
            </div>
          ))}
          <div className="flex justify-between font-bold text-base pt-2 border-t border-border"><span>Quote total</span><span className="text-primary">{formatCurrency(total)}</span></div>
        </div>
        <p className="text-xs text-muted-foreground">Taxes and Tree Marketplace fees are calculated at checkout.</p>
      </Card>

      <div className="flex gap-2 pb-4">
        <Button variant="outline" className="flex-1" onClick={() => navigate("/vendor/rfqs")}>Cancel</Button>
        <Button className="flex-1" onClick={submit} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}Submit quote</Button>
      </div>
    </div>
  );
}