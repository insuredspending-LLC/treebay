import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAppUser } from "@/hooks/useAppUser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Leaf, Loader2, ArrowLeft, Check, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function EditVendorProfile() {
  const { vendorProfiles, refresh } = useAppUser();
  const navigate = useNavigate();
  const { toast } = useToast();
  const vendor = vendorProfiles[0];
  const [f, setF] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  useEffect(() => {
    if (vendor) {
      setF({
        business_name: vendor.business_name || "",
        contact_name: vendor.contact_name || "",
        phone: vendor.phone || "",
        address: vendor.address || "",
        city: vendor.city || "",
        state: vendor.state || "",
        zip_code: vendor.zip_code || "",
        website: vendor.website || "",
        description: vendor.description || "",
        service_area: vendor.service_area || "",
        pickup_available: vendor.pickup_available !== false,
        delivery_available: vendor.delivery_available !== false,
        wholesale_available: !!vendor.wholesale_available,
        logo_url: vendor.logo_url || "",
        cover_url: vendor.cover_url || "",
      });
    }
  }, [vendor]);

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const upload = async (file, field) => {
    if (!file) return;
    if (field === "logo_url") setUploadingLogo(true); else setUploadingCover(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      set(field, file_url);
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      if (field === "logo_url") setUploadingLogo(false); else setUploadingCover(false);
    }
  };

  const save = async () => {
    if (!vendor) return;
    setLoading(true);
    try {
      await base44.functions.invoke("updateVendorProfile", { profileId: vendor.id, fields: f });
      await refresh();
      toast({ title: "Profile updated" });
      navigate("/account");
    } catch (e) {
      toast({ title: "Could not save", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (!vendor) return <div className="py-16 text-center text-muted-foreground">No seller profile found.</div>;
  if (!f) return <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>;

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center"><Leaf className="w-5 h-5 text-primary-foreground" /></div>
        <h1 className="text-2xl font-bold">Edit Seller Profile</h1>
      </div>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold text-sm">Business</h2>
        <Field label="Business name" value={f.business_name} onChange={(v) => set("business_name", v)} />
        <Field label="Contact name" value={f.contact_name} onChange={(v) => set("contact_name", v)} />
        <Field label="Phone" value={f.phone} onChange={(v) => set("phone", v)} />
        <Field label="Website" value={f.website} onChange={(v) => set("website", v)} />
        <div className="space-y-2"><Label>Description</Label><Textarea value={f.description} onChange={(e) => set("description", e.target.value)} rows={3} /></div>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold text-sm">Location</h2>
        <Field label="Address" value={f.address} onChange={(v) => set("address", v)} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="City" value={f.city} onChange={(v) => set("city", v)} />
          <Field label="State" value={f.state} onChange={(v) => set("state", v)} />
        </div>
        <Field label="ZIP code" value={f.zip_code} onChange={(v) => set("zip_code", v)} />
        <Field label="Service area" value={f.service_area} onChange={(v) => set("service_area", v)} />
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold text-sm">Capabilities</h2>
        <div className="grid grid-cols-3 gap-2">
          <Toggle label="Pickup" value={f.pickup_available} onChange={(v) => set("pickup_available", v)} />
          <Toggle label="Delivery" value={f.delivery_available} onChange={(v) => set("delivery_available", v)} />
          <Toggle label="Wholesale" value={f.wholesale_available} onChange={(v) => set("wholesale_available", v)} />
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold text-sm">Images</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="mb-1.5 block">Logo</Label>
            {f.logo_url ? <img src={f.logo_url} alt="" className="w-full h-24 rounded-lg object-cover mb-2" /> : <div className="w-full h-24 rounded-lg bg-secondary flex items-center justify-center mb-2"><ImageIcon className="w-6 h-6 text-muted-foreground" /></div>}
            <input type="file" accept="image/*" onChange={(e) => upload(e.target.files?.[0], "logo_url")} disabled={uploadingLogo} className="text-xs" />
            {uploadingLogo && <p className="text-xs text-muted-foreground mt-1">Uploading…</p>}
          </div>
          <div>
            <Label className="mb-1.5 block">Cover</Label>
            {f.cover_url ? <img src={f.cover_url} alt="" className="w-full h-24 rounded-lg object-cover mb-2" /> : <div className="w-full h-24 rounded-lg bg-secondary flex items-center justify-center mb-2"><ImageIcon className="w-6 h-6 text-muted-foreground" /></div>}
            <input type="file" accept="image/*" onChange={(e) => upload(e.target.files?.[0], "cover_url")} disabled={uploadingCover} className="text-xs" />
            {uploadingCover && <p className="text-xs text-muted-foreground mt-1">Uploading…</p>}
          </div>
        </div>
      </Card>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1 h-12" onClick={() => navigate(-1)}>Cancel</Button>
        <Button onClick={save} disabled={loading} className="flex-1 h-12">
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />} Save Changes
        </Button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value || ""} onChange={(e) => onChange(e.target.value)} className="h-11" />
    </div>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!value)}
      className={"flex items-center justify-between px-3 py-3 rounded-xl border text-sm font-medium " + (value ? "border-primary bg-secondary text-primary" : "border-border text-muted-foreground")}>
      {label}
      <span className={"w-9 h-5 rounded-full relative transition " + (value ? "bg-primary" : "bg-muted")}>
        <span className={"absolute top-0.5 w-4 h-4 rounded-full bg-white transition"} style={{ left: value ? "1.125rem" : "0.125rem" }} />
      </span>
    </button>
  );
}