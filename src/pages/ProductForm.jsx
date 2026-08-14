import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAppUser } from "@/hooks/useAppUser";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Plus, Trash2, Loader2, Upload, X, Save, Package, Check, Truck, DollarSign, Image as ImageIcon, ClipboardList, Leaf } from "lucide-react";
import { Image } from "@/components/ui/image";
import { CATEGORIES, formatNumber, formatCurrency, apiError } from "@/lib/treebay";

const EMPTY = {
  common_name: "", botanical_name: "", cultivar: "", category: "Trees", description: "", sku: "",
  container_size: "", box_size: "", caliper: "", current_height: "", approximate_spread: "",
  quantity_available: 1, unit_price: 0, minimum_order_quantity: 1,
  wholesale_eligible: false, pickup_eligible: true, delivery_eligible: true,
  native_status: false, foliage_type: "", usda_zones: "", sun_requirement: "", water_requirement: "",
  mature_height: "", mature_spread: "", featured: false, listing_status: "active",
  bulk_price_tiers: [], images: [],
};

function SectionTitle({ icon: Icon, title, children }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-primary" />
        <h2 className="font-heading font-semibold text-sm uppercase tracking-wide text-muted-foreground">{title}</h2>
      </div>
      {children}
    </div>
  );
}

export default function ProductForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { vendorProfiles, switchAccountType } = useAppUser();
  const vendor = vendorProfiles[0];
  const { toast } = useToast();
  const [f, setF] = useState(EMPTY);
  const [existing, setExisting] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!id);
  const [searchParams] = useSearchParams();
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const exitToBuyer = async () => {
    await switchAccountType("buyer");
    navigate("/", { replace: true });
  };

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const p = await base44.entities.Product.get(id);
        setExisting(p);
        setF({ ...EMPTY, ...p, quantity_available: p.physical_quantity ?? ((p.quantity_available || 0) + (p.quantity_reserved || 0)) });
      } catch {} finally { setLoading(false); }
    })();
  }, [id]);

  // AI listing draft prefill
  useEffect(() => {
    if (id) return;
    const draftParam = searchParams.get("ai_draft");
    if (draftParam) {
      try {
        const draft = JSON.parse(decodeURIComponent(draftParam));
        setF((p) => ({
          ...p,
          common_name: draft.common_name || p.common_name,
          category: draft.category || p.category,
          unit_price: Number(draft.unit_price) || p.unit_price,
          quantity_available: Number(draft.physical_quantity) || p.quantity_available,
          container_size: draft.container_size || p.container_size,
          bulk_price_tiers: draft.bulk_price_tiers?.length ? draft.bulk_price_tiers : p.bulk_price_tiers,
        }));
      } catch {}
    }
  }, [id, searchParams]);

  const uploadImage = async (file) => {
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setF((p) => ({ ...p, images: [...(p.images || []), file_url] }));
    } catch (e) { toast({ title: "Upload failed", description: e.message, variant: "destructive" }); }
    finally { setUploading(false); }
  };

  const addTier = () => set("bulk_price_tiers", [...(f.bulk_price_tiers || []), { min_qty: 1, max_qty: 0, unit_price: 0, request_quote: false }]);
  const updateTier = (i, key, val) => setF((p) => { const t = [...p.bulk_price_tiers]; t[i] = { ...t[i], [key]: val }; return { ...p, bulk_price_tiers: t }; });
  const removeTier = (i) => setF((p) => ({ ...p, bulk_price_tiers: p.bulk_price_tiers.filter((_, x) => x !== i) }));

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
      delete payload.vendor_id; delete payload.vendor_owner_id; delete payload.vendor_name;
      delete payload.vendor_city; delete payload.vendor_state; delete payload.verified_vendor;
      delete payload.quantity_reserved; delete payload.quantity_sold; delete payload.physical_quantity;
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
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{id ? "Edit listing" : "New listing"}</h1>
        <Button type="button" variant="outline" onClick={exitToBuyer}>Exit to Buying</Button>
      </div>

      {/* Basic Information */}
      <Card className="p-4 space-y-4">
        <SectionTitle icon={ClipboardList} title="Basic Information" />
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
      </Card>

      {/* Photos */}
      <Card className="p-4 space-y-3">
        <SectionTitle icon={ImageIcon} title="Photos" />
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
      </Card>

      {/* Size & Specifications */}
      <Card className="p-4 space-y-4">
        <SectionTitle icon={Package} title="Size & Specifications" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Field label="Container size" value={f.container_size} onChange={(v) => set("container_size", v)} placeholder="5 gallon" />
          <Field label="Box size" value={f.box_size} onChange={(v) => set("box_size", v)} placeholder='36" box' />
          <Field label="Caliper" value={f.caliper} onChange={(v) => set("caliper", v)} placeholder='4"' />
          <Field label="Current height" value={f.current_height} onChange={(v) => set("current_height", v)} placeholder="8-10 ft" />
          <Field label="Approx. spread" value={f.approximate_spread} onChange={(v) => set("approximate_spread", v)} placeholder="6 ft" />
          <Field label="SKU" value={f.sku} onChange={(v) => set("sku", v)} />
        </div>
      </Card>

      {/* Inventory */}
      <Card className="p-4 space-y-4">
        <SectionTitle icon={Package} title="Inventory" />
        {id && existing ? (
          <>
            <div className="grid grid-cols-4 gap-2">
              <InvStat label="Physical" value={existing.physical_quantity} />
              <InvStat label="Reserved" value={existing.quantity_reserved} />
              <InvStat label="Available" value={existing.quantity_available} highlight />
              <InvStat label="Sold" value={existing.quantity_sold} />
            </div>
            <p className="text-xs text-muted-foreground">Reserved and sold quantities are managed by TreEbay as orders progress. Available stock is calculated automatically.</p>
            <NumField label="Current unsold physical units" value={f.quantity_available} onChange={(v) => set("quantity_available", v)} />
          </>
        ) : (
          <NumField label="Current unsold physical units" value={f.quantity_available} onChange={(v) => set("quantity_available", v)} />
        )}
      </Card>

      {/* Pricing */}
      <Card className="p-4 space-y-4">
        <SectionTitle icon={DollarSign} title="Pricing" />
        <div className="grid grid-cols-2 gap-3">
          <NumField label="Unit price *" value={f.unit_price} onChange={(v) => set("unit_price", v)} />
          <NumField label="Min order qty" value={f.minimum_order_quantity} onChange={(v) => set("minimum_order_quantity", v)} />
        </div>
      </Card>

      {/* Bulk Pricing */}
      <Card className="p-4 space-y-3">
        <SectionTitle icon={DollarSign} title="Bulk Pricing">
          <Button variant="outline" size="sm" onClick={addTier}><Plus className="w-4 h-4 mr-1" /> Add tier</Button>
        </SectionTitle>
        {(f.bulk_price_tiers || []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No bulk tiers set. Buyers pay the unit price. Add a tier to offer volume discounts.</p>
        ) : (
          <div className="space-y-2">
            {(f.bulk_price_tiers || []).map((t, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end p-3 rounded-lg bg-secondary/40">
                <div className="col-span-3 space-y-1"><Label className="text-xs">Min qty</Label><Input type="number" value={t.min_qty} onChange={(e) => updateTier(i, "min_qty", Number(e.target.value))} className="h-10" /></div>
                <div className="col-span-3 space-y-1"><Label className="text-xs">Max qty (0=+)</Label><Input type="number" value={t.max_qty} onChange={(e) => updateTier(i, "max_qty", Number(e.target.value))} className="h-10" /></div>
                <div className="col-span-3 space-y-1"><Label className="text-xs">Unit price</Label><Input type="number" value={t.unit_price} disabled={t.request_quote} onChange={(e) => updateTier(i, "unit_price", Number(e.target.value))} className="h-10" /></div>
                <div className="col-span-2 flex items-center gap-2 pb-2"><label className="flex items-center gap-1 text-xs whitespace-nowrap"><input type="checkbox" checked={t.request_quote} onChange={(e) => updateTier(i, "request_quote", e.target.checked)} /> Quote</label></div>
                <div className="col-span-1 flex justify-end pb-2"><Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => removeTier(i)}><Trash2 className="w-4 h-4 text-rose-600" /></Button></div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">Buyers reaching a tier's minimum quantity get that price. Set "Quote" for tiers requiring a custom quote.</p>
          </div>
        )}
      </Card>

      {/* Fulfillment */}
      <Card className="p-4 space-y-3">
        <SectionTitle icon={Truck} title="Fulfillment" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <Toggle label="Pickup" checked={!!f.pickup_eligible} onChange={(v) => set("pickup_eligible", v)} />
          <Toggle label="Delivery" checked={!!f.delivery_eligible} onChange={(v) => set("delivery_eligible", v)} />
          <Toggle label="Wholesale" checked={!!f.wholesale_eligible} onChange={(v) => set("wholesale_eligible", v)} />
        </div>
      </Card>

      {/* Plant Characteristics */}
      <Card className="p-4 space-y-4">
        <SectionTitle icon={Leaf} title="Plant Characteristics" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="space-y-1.5"><Label className="text-xs">Foliage</Label>
            <Select value={f.foliage_type || "n/a"} onValueChange={(v) => set("foliage_type", v)}><SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="n/a">N/A</SelectItem><SelectItem value="evergreen">Evergreen</SelectItem><SelectItem value="deciduous">Deciduous</SelectItem></SelectContent></Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Sun</Label>
            <Select value={f.sun_requirement || "any"} onValueChange={(v) => set("sun_requirement", v === "any" ? "" : v)}><SelectTrigger className="h-11"><SelectValue placeholder="Any" /></SelectTrigger>
              <SelectContent><SelectItem value="any">Any</SelectItem><SelectItem value="full sun">Full sun</SelectItem><SelectItem value="part sun">Part sun</SelectItem><SelectItem value="part shade">Part shade</SelectItem><SelectItem value="full shade">Full shade</SelectItem></SelectContent></Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs">Water</Label>
            <Select value={f.water_requirement || "any"} onValueChange={(v) => set("water_requirement", v === "any" ? "" : v)}><SelectTrigger className="h-11"><SelectValue placeholder="Any" /></SelectTrigger>
              <SelectContent><SelectItem value="any">Any</SelectItem><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem></SelectContent></Select>
          </div>
          <Field label="USDA zones" value={f.usda_zones} onChange={(v) => set("usda_zones", v)} placeholder="6-9" />
          <Field label="Mature height" value={f.mature_height} onChange={(v) => set("mature_height", v)} placeholder="40-60 ft" />
          <Field label="Mature spread" value={f.mature_spread} onChange={(v) => set("mature_spread", v)} placeholder="40 ft" />
        </div>
        <Toggle label="Native plant" checked={!!f.native_status} onChange={(v) => set("native_status", v)} />
      </Card>

      {/* Review */}
      <Card className="p-4 space-y-3">
        <SectionTitle icon={Check} title="Review" />
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Product</span><span className="font-medium">{f.common_name || "—"}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Category</span><span className="font-medium">{f.category}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Unit price</span><span className="font-medium">{formatCurrency(Number(f.unit_price) || 0)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Physical units</span><span className="font-medium">{formatNumber(Number(f.quantity_available) || 0)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Photos</span><span className="font-medium">{(f.images || []).length}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Bulk tiers</span><span className="font-medium">{(f.bulk_price_tiers || []).length}</span></div>
        </div>
      </Card>

      <div className="flex gap-2 pt-1 pb-4">
        <Button variant="outline" className="flex-1" onClick={() => navigate("/vendor/inventory")}>Cancel</Button>
        <Button className="flex-1" onClick={save} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}{id ? "Save changes" : "Create listing"}</Button>
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
  return <div className="flex items-center justify-between p-3 rounded-xl border border-border"><span className="text-sm">{label}</span><Switch checked={checked} onCheckedChange={onChange} /></div>;
}
function InvStat({ label, value, highlight }) {
  return <div className="rounded-lg bg-secondary/40 p-3 text-center"><p className="text-xs text-muted-foreground">{label}</p><p className={"text-lg font-heading font-bold " + (highlight ? "text-primary" : "")}>{formatNumber(value ?? 0)}</p></div>;
}