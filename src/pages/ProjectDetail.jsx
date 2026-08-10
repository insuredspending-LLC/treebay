import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, Trash2, FileText, Package, Calendar, MapPin, Plus, Loader2 } from "lucide-react";
import { shortDate, formatNumber, formatCurrency, apiError } from "@/lib/treebay";

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rfqOpen, setRfqOpen] = useState(false);
  const [rfq, setRfq] = useState({ quote_deadline: "", requested_delivery_date: "", notes: "", substitution_allowed: false, delivery_required: true });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setProject(await base44.entities.Project.get(id)); } catch {}
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [id]);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;
  if (!project) return <p className="text-center text-muted-foreground py-16">Project not found.</p>;

  const items = project.items || [];
  const total = items.reduce((s, i) => s + (i.unit_price || 0) * (i.quantity || 0), 0);

  const removeItem = async (idx) => {
    const items2 = items.filter((_, i) => i !== idx);
    await base44.entities.Project.update(id, { items: items2 });
    load();
  };

  const updateQty = async (idx, qty) => {
    const items2 = items.map((it, i) => i === idx ? { ...it, quantity: Math.max(1, qty) } : it);
    await base44.entities.Project.update(id, { items: items2 });
    load();
  };

  const createRFQ = async () => {
    setSaving(true);
    try {
      const rfqItems = items.map((i) => ({ common_name: i.common_name, botanical_name: i.botanical_name, quantity: i.quantity, size_spec: i.size_spec, notes: "" }));
      const { data } = await base44.functions.invoke("createRFQ", {
        projectId: id,
        requested_delivery_date: rfq.requested_delivery_date, quote_deadline: rfq.quote_deadline,
        notes: rfq.notes, substitution_allowed: rfq.substitution_allowed, delivery_required: rfq.delivery_required,
        items: rfqItems,
      });
      toast({ title: "RFQ created", description: "Vendors can now submit quotes." });
      navigate(`/rfqs/${data.rfq.id}`);
    } catch (e) { toast({ title: "Could not create RFQ", description: apiError(e), variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{project.name}</h1>
        <div className="text-sm text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1">
          <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {project.delivery_city}, {project.delivery_state} {project.delivery_zip}</span>
          {project.desired_delivery_date && <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {shortDate(project.desired_delivery_date)}</span>}
        </div>
        {project.notes && <p className="text-sm text-muted-foreground mt-2">{project.notes}</p>}
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold flex items-center gap-2"><Package className="w-4 h-4" /> Requested items</h2>
          <Button asChild size="sm" variant="outline"><Link to="/marketplace"><Plus className="w-4 h-4 mr-1" /> Add</Link></Button>
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No items yet. Browse the marketplace and add products to this project.</p>
        ) : (
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                <div className="flex-1">
                  <p className="font-medium text-sm">{it.common_name}</p>
                  {it.botanical_name && <p className="text-xs text-muted-foreground italic">{it.botanical_name}</p>}
                  {it.size_spec && <p className="text-xs text-muted-foreground">{it.size_spec}</p>}
                </div>
                <Input type="number" min={1} value={it.quantity} onChange={(e) => updateQty(i, Number(e.target.value))} className="w-20 h-9" />
                <span className="text-sm font-medium w-20 text-right">{formatCurrency((it.unit_price || 0) * (it.quantity || 0))}</span>
                <Button variant="ghost" size="icon" onClick={() => removeItem(i)}><Trash2 className="w-4 h-4 text-muted-foreground" /></Button>
              </div>
            ))}
            <Separator className="my-2" />
            <div className="flex justify-between font-semibold"><span>Estimated total</span><span>{formatCurrency(total)}</span></div>
          </div>
        )}
      </Card>

      {items.length > 0 && (
        <Button onClick={() => setRfqOpen(true)} className="w-full h-12 text-base"><FileText className="w-4 h-4 mr-2" /> Create RFQ from project</Button>
      )}

      <Dialog open={rfqOpen} onOpenChange={setRfqOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Request for Quote</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Send this project to vendors as an RFQ. Vendors will respond with pricing for {formatNumber(items.reduce((s, i) => s + i.quantity, 0))} units across {items.length} item{items.length === 1 ? "" : "s"}.</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5"><Label>Quote deadline</Label><Input type="date" value={rfq.quote_deadline} onChange={(e) => setRfq((p) => ({ ...p, quote_deadline: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Desired delivery</Label><Input type="date" value={rfq.requested_delivery_date} onChange={(e) => setRfq((p) => ({ ...p, requested_delivery_date: e.target.value }))} /></div>
            </div>
            <div className="space-y-1.5"><Label>Notes to vendors</Label><Textarea value={rfq.notes} onChange={(e) => setRfq((p) => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Delivery requirements, site access, etc." /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rfq.substitution_allowed} onChange={(e) => setRfq((p) => ({ ...p, substitution_allowed: e.target.checked }))} /> Substitutions allowed</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rfq.delivery_required} onChange={(e) => setRfq((p) => ({ ...p, delivery_required: e.target.checked }))} /> Delivery required</label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRfqOpen(false)}>Cancel</Button>
            <Button onClick={createRFQ} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Send RFQ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}