import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAppUser } from "@/hooks/useAppUser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FolderKanban, Plus, MapPin, Calendar, Package, Loader2, Sparkles } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import { shortDate, formatNumber } from "@/lib/treebay";

export default function Projects() {
  const { user } = useAppUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [aiDraft, setAiDraft] = useState(null);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const load = async () => {
    setLoading(true);
    try { setProjects(await base44.entities.Project.list("-created_date", 100) || []); } catch {}
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  // AI draft prefill: read ai_draft param and open the new project dialog prefilled
  useEffect(() => {
    const draftParam = searchParams.get("ai_draft");
    if (draftParam) {
      try {
        const draft = JSON.parse(decodeURIComponent(draftParam));
        setAiDraft(draft);
        setForm({
          name: draft.items?.length ? `${draft.items[0].common_name} bulk request` : "AI draft project",
          delivery_city: draft.delivery_city || "",
          delivery_state: draft.delivery_state || "",
          delivery_zip: "",
          notes: draft.notes || "",
        });
        setOpen(true);
        // Clear the param so it doesn't re-trigger on reload
        setSearchParams({}, { replace: true });
      } catch {}
    }
  }, [searchParams]);

  const create = async () => {
    if (!form.name || !form.delivery_city) return;
    setSaving(true);
    try {
      // If AI draft has items, include them in the project
      const items = (aiDraft?.items || []).map((it) => ({
        common_name: it.common_name,
        quantity: it.quantity || 1,
        size_spec: it.size_spec || "",
        unit_price: 0,
      }));
      const proj = await base44.entities.Project.create({
        buyer_id: user?.id, name: form.name, delivery_city: form.delivery_city,
        delivery_state: form.delivery_state, delivery_zip: form.delivery_zip,
        desired_delivery_date: form.desired_delivery_date, notes: form.notes, items,
      });
      setForm({}); setOpen(false); setAiDraft(null);
      navigate(`/projects/${proj.id}`);
    } catch { /* */ }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Projects</h1>
          <p className="text-sm text-muted-foreground">Build material lists and request quotes.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1" /> New</Button>
      </div>

      {loading ? <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
        : projects.length === 0 ? (
          <EmptyState icon={FolderKanban} title="No projects yet" description="Create a project to assemble a plant list and request bulk quotes."
            action={<Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1" /> Create project</Button>} />
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {projects.map((p) => (
              <Link key={p.id} to={`/projects/${p.id}`}>
                <Card className="p-4 hover:shadow-sm hover:border-primary/40 transition h-full">
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><MapPin className="w-3 h-3" /> {p.delivery_city}, {p.delivery_state} {p.delivery_zip}</p>
                  {p.desired_delivery_date && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Calendar className="w-3 h-3" /> {shortDate(p.desired_delivery_date)}</p>}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2"><Package className="w-3 h-3" /> {(p.items || []).length} item{(p.items || []).length === 1 ? "" : "s"} · {formatNumber((p.items || []).reduce((s, i) => s + (i.quantity || 0), 0))} units</div>
                </Card>
              </Link>
            ))}
          </div>
        )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New project</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {aiDraft && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-1.5">
                <p className="text-sm font-semibold flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-primary" /> AI draft loaded</p>
                <p className="text-xs text-muted-foreground">Review the prefilled items and details before creating this project.</p>
                {aiDraft.items?.length > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {aiDraft.items.map((it, i) => <p key={i}>• {it.quantity}× {it.common_name} {it.size_spec ? `(${it.size_spec})` : ""}</p>)}
                  </div>
                )}
              </div>
            )}
            <div className="space-y-1.5"><Label>Project name</Label><Input value={form.name || ""} onChange={(e) => set("name", e.target.value)} placeholder="Midland Shopping Center Landscaping" /></div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5 col-span-1"><Label>City</Label><Input value={form.delivery_city || ""} onChange={(e) => set("delivery_city", e.target.value)} placeholder="Midland" /></div>
              <div className="space-y-1.5"><Label>State</Label><Input value={form.delivery_state || ""} onChange={(e) => set("delivery_state", e.target.value)} placeholder="TX" /></div>
              <div className="space-y-1.5"><Label>ZIP</Label><Input value={form.delivery_zip || ""} onChange={(e) => set("delivery_zip", e.target.value)} placeholder="79701" /></div>
            </div>
            <div className="space-y-1.5"><Label>Desired delivery date</Label><Input type="date" value={form.desired_delivery_date || ""} onChange={(e) => set("desired_delivery_date", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Notes</Label><Textarea value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); setAiDraft(null); setForm({}); }}>Cancel</Button>
            <Button onClick={create} disabled={saving || !form.name || !form.delivery_city}>{saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}