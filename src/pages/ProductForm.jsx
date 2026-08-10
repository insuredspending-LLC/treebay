import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAppUser } from "@/hooks/useAppUser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import { ArrowLeft, Plus, Trash2, Loader2, Upload, X, Save } from "lucide-react";
import { Image } from "@/components/ui/image";
import { CATEGORIES, apiError } from "@/lib/treebay";

const EMPTY = {
  common_name: "", botanical_name: "", cultivar: "", category: "Trees", description: "", sku: "",
  container_size: "", box_size: "", caliper: "", current_height: "", approximate_spread: "",
  quantity_available: 1, unit_price: 0, minimum_order_quantity: 1,
  wholesale_eligible: false, pickup_eligible: true, delivery_eligible: true,
  native_status: false, foliage_type: "", usda_zones: "", sun_requirement: "", water_requirement: "",
  mature_height: "", mature_spread: "", featured: false, listing_status: "active",
  bulk_price_tiers: [], images: [],
};

export default function ProductForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { vendorProfiles } = useAppUser();
  const vendor = vendorProfiles[0];
  const { toast } = useToast();
  const [f, setF] = useState(EMPTY);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!id);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const p = await base44.entities.Product.get(id);
        setF({ ...EMPTY, ...p, quantity_available: p.physical_quantity ?? ((p.quantity_available || 0) + (p.quantity_reserved || 0)) });
      } catch {}
      finally { setLoading(false); }
    })();
  }, [id]);

  const uploadImage = async (file) => {
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setF((p) => ({ ...p, images: [...(p.images || []), file_url] }));
    } catch (e) { toast({ title: "Upload failed", description: e.message, variant: "destructive" }); }
    finally { setUploading(false); }
  };

  const addTier = () => set((p) => ({ ...p, bulk_price_tiers: [...(p.bulk_price_tiers || []), { min_qty: 1, max_qty: 0, unit_price: 0, request_quote: false }] }));
  const updateTier = (i, key, val) => set((p) => { const t = [...p.bulk_price_tiers]; t[i] = { ...t[i], [key]: val }; return { ...p, bulk_price_tiers: t }; });
  const removeTier = (i) => set((p) => ({ ...p, bulk_price_tiers: p.bulk_price_tiers.filter((_, x) => x !== i) }));

  const save = async () => {
    if (!vendor) { toast({ title: "No vendor profile", variant: "destructive" }); return; }
    if (!f.common_name || !f.category || f.unit_price <= 0) { toast({ title: "Name, category, and price are required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const payload = {
        ...f,
        quantity_available: Number(f.quantity_available) || 0,
        unit_price: Number(f.unit_price) || 0,
        minimum_order_quantity: Number(f.minimum_order_quantity) || 1,
        listing_status: Number(f.quantity_available) <= 0 ? "sold_out" : f.listing_status,
      };
      // Ownership & verification are derived by the secure backend — never sent from the client.
      delete payload.vendor_id; delete payload.vendor_owner_id; delete payload.vendor_name;
      delete payload.vendor_city; delete payload.vendor_state; delete payload.verified_vendor;
      if (id) await base44.functions.invoke("updateProduct", { productId: id, ...payload });
      else await base44.functions.invoke("createProduct", payload);
      toast({ title: id ? "Listing updated" : "Listing created" });
      navigate("/vendor/inventory");
    } catch (e) { toast({ title: "Could not save", description: apiError(e), variant: "destructive" }); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-5 max-w-2xl">
      <h1 className="text-xl font-bold">{id ? "Edit listing" : "New listing"}</h1>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Common name *" value={f.common_name} onChange={(v) => set("common_name", v)} />
          <Field label="Botanical name" value={f.botanical_name} onChange={(v) => set("botanical_name", v)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cultivar" value={f.cultivar} onChange={(v) => set("cultivar", v)} />
          <div className="space-y-1.5">
            <Label>Category *</Label>
            <Select value={f.category} onValueChange={(v) => set("category", v)}><SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent></Select>
          </div>
        </div>
        <div className="space-y-1.5"><Label>Description</Label><Textarea value={f.description} onChange={(e) => set("description", e.target.value)} rows={3} /></div>

        <Separator />
        <h2 className="font-semibold text-sm uppercase text-muted-foreground">Size & specifications</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Field label="Container size" value={f.container_size} onChange={(v) => set("container_size", v)} placeholder="5 gallon" />
          <Field label="Box size" value={f.box_size} onChange={(v) => set("box_size", v)} placeholder='36" box' />
          <Field label="Caliper" value={f.caliper} onChange={(v) => set("caliper", v)} placeholder='4"' />
          <Field label="Current height" value={f.current_height} onChange={(v) => set("current_height", v)} placeholder="8-10 ft" />
          <Field label="Approx. spread" value={f.approximate_spread} onChange={(v) => set("approximate_spread", v)} placeholder="6 ft" />
          <Field label="SKU" value={f.sku} onChange={(v) => set("sku", v)} />
        </div>

        <Separator />
        <h2 className="font-semibold text-sm uppercase text-muted-foreground">Pricing & quantity</h2>
        <div className="grid grid-cols-3 gap-3">
          <NumField label="Current unsold physical units" value={f.quantity_available} onChange={(v) => set("quantity_available", v)} />
          <NumField label="Unit price *" value={f.unit_price} onChange={(v) => set("unit_price", v)} />
          <NumField label="Min order" value={f.minimum_order_quantity} onChange={(v) => set("minimum_order_quantity", v)} />
        </div>
        {id && <p className="text-xs text-muted-foreground">Available stock is calculated after subtracting units already reserved for active orders.</p>}

        <div className="rounded-xl border border-border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <Label className="font-semibold">Bulk pricing tiers</Label>
            <Button variant="outline" size="sm" onClick={addTier}><Plus className="w-4 h-4 mr-1" /> Add tier</Button>
          </div>
          {(f.bulk_price_tiers || []).map((t, i) => (
            <div key={i} className="grid grid-cols-4 gap-2 items-end">
              <div className="space-y-1"><Label className="text-xs">Min qty</Label><Input type="number" value={t.min_qty} onChange={(e) => updateTier(i, "min_qty", Number(e.target.value))} className="h-10" /></div>
              <div className="space-y-1"><Label className="text-xs">Max qty (0=+)</Label><Input type="number" value={t.max_qty} onChange={(e) => updateTier(i, "max_qty", Number(e.target.value))} className="h-10" /></div>
              <div className="space-y-1"><Label className="text-xs">Unit price</Label><Input type="number" value={t.unit_price} disabled={t.request_quote} onChange={(e) => updateTier(i, "unit_price", Number(e.target.value))} className="h-10" /></div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={t.request_quote} onChange={(e) => updateTier(i, "request_quote", e.target.checked)} /> Quote</label>
                <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => removeTier(i)}><Trash2 className="w-4 h-4 text-rose-600" /></Button>
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Buyers reaching a tier's minimum quantity get that price. Set "Quote" for tiers requiring a custom quote.</p>
        </div>

        <Separator />
        <h2 className="font-semibold text-sm uppercase text-muted-foreground">Plant characteristics</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="space-y-1.5"><Label className="text-xs">Foliage</Label>
            <Select value={f.foliage_type || "n/a"} onValueChange={(v) => set("foliage_type", v)}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="n/a">N/A</SelectItem><SelectItem value="evergreen">Evergreen</SelectItem><SelectItem value="deciduous">Deciduous</SelectItem></SelectContent></Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Sun</Label>
            <Select value={f.sun_requirement || ""} onValueChange={(v) => set("sun_requirement", v)}><SelectTrigger className="h-11"><SelectValue placeholder="Any" /></SelectTrigger>
              <SelectContent><SelectItem value={null}>Any</SelectItem><SelectItem value="full sun">Full sun</SelectItem><SelectItem value="part sun">Part sun</SelectItem><SelectItem value="part shade">Part shade</SelectItem><SelectItem value="full shade">Full shade</SelectItem></SelectContent></Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Water</Label>
            <Select value={f.water_requirement || ""} onValueChange={(v) => set("water_requirement", v)}><SelectTrigger className="h-11"><SelectValue placeholder="Any" /></SelectTrigger>
              <SelectContent><SelectItem value={null}>Any</SelectItem><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem></SelectContent></Select>
          </div>
          <Field label="USDA zones" value={f.usda_zones} onChange={(v) => set("usda_zones", v)} placeholder="6-9" />
          <Field label="Mature height" value={f.mature_height} onChange={(v) => set("mature_height", v)} placeholder="40-60 ft" />
          <Field label="Mature spread" value={f.mature_spread} onChange={(v) => set("mature_spread", v)} placeholder="40 ft" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Toggle label="Native" checked={!!f.native_status} onChange={(v) => set("native_status", v)} />
          <Toggle label="Wholesale" checked={!!f.wholesale_eligible} onChange={(v) => set("wholesale_eligible", v)} />
          <Toggle label="Pickup" checked={!!f.pickup_eligible} onChange={(v) => set("pickup_eligible", v)} />
          <Toggle label="Delivery" checked={!!f.delivery_eligible} onChange={(v) => set("delivery_eligible", v)} />
        </div>

        <Separator />
        <h2 className="font-semibold text-sm uppercase text-muted-foreground">Photos</h2>
        <div className="flex flex-wrap gap-3">
          {(f.images || []).map((url, i) => (
            <div key={i} className="relative w-24 h-24 rounded-xl overflow-hidden border border-border">
              <Image src={url} alt="" fittingType="fill" className="w-full h-full" />
              <button onClick={() => set("images", f.images.filter((_, x) => x !== i))} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          <label className="w-24 h-24 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center text-muted-foreground cursor-pointer hover:border-primary">
            {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Upload className="w-5 h-5" /><span className="text-[10px] mt-1">Upload</span></>}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} />
          </label>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={() => navigate("/vendor/inventory")}>Cancel</Button>
          <Button className="flex-1" onClick={save} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}{id ? "Save changes" : "Create listing"}</Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return <div className="space-y-1.5"><Label>{label}</Label><Input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-12" /></div>;
}
function NumField({ label, value, onChange }) {
  return <div className="space-y-1.5"><Label>{label}</Label><Input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-12" /></div>;
}
function Toggle({ label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl border border-border">
      <span className="text-sm">{label}</span><Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}