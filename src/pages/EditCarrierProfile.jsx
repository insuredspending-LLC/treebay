import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAppUser } from "@/hooks/useAppUser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Truck, Loader2, ArrowLeft, Check } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function EditCarrierProfile() {
  const { carrierProfile, refresh } = useAppUser();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [f, setF] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!carrierProfile) return;
    setF({
      business_name: carrierProfile.business_name || "",
      contact_name: carrierProfile.contact_name || "",
      phone: carrierProfile.phone || "",
      address: carrierProfile.address || "",
      city: carrierProfile.city || "",
      state: carrierProfile.state || "",
      zip_code: carrierProfile.zip_code || "",
      equipment_type: carrierProfile.equipment_type || "",
      service_radius: carrierProfile.service_radius || "",
      operating_regions: carrierProfile.operating_regions || "",
      load_capabilities: carrierProfile.load_capabilities || "",
      description: carrierProfile.description || "",
      dot_number: carrierProfile.dot_number || "",
      mc_number: carrierProfile.mc_number || "",
    });
  }, [carrierProfile]);

  const set = (key, value) => setF((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    if (!carrierProfile || !f) return;
    setSaving(true);
    try {
      await base44.functions.invoke("updateCarrierProfile", { profileId: carrierProfile.id, fields: f });
      await refresh();
      toast({ title: "Carrier profile updated" });
      navigate("/account");
    } catch (error) {
      toast({ title: "Could not save carrier profile", description: error?.message || "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!carrierProfile) return <div className="py-16 text-center text-muted-foreground">No carrier profile found.</div>;
  if (!f) return <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>;

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center"><Truck className="w-5 h-5 text-primary-foreground" /></div>
        <div>
          <h1 className="text-2xl font-bold">Edit Carrier Profile</h1>
          <p className="text-sm text-muted-foreground">TEST carrier verification remains admin-controlled.</p>
        </div>
      </div>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold text-sm">Business</h2>
        <Field label="Business name" value={f.business_name} onChange={(v) => set("business_name", v)} />
        <Field label="Contact name" value={f.contact_name} onChange={(v) => set("contact_name", v)} />
        <Field label="Phone" value={f.phone} onChange={(v) => set("phone", v)} />
        <div className="space-y-2"><Label>Description</Label><Textarea value={f.description} onChange={(e) => set("description", e.target.value)} rows={3} /></div>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold text-sm">Location & Service Area</h2>
        <Field label="Address" value={f.address} onChange={(v) => set("address", v)} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="City" value={f.city} onChange={(v) => set("city", v)} />
          <Field label="State" value={f.state} onChange={(v) => set("state", v)} />
        </div>
        <Field label="ZIP code" value={f.zip_code} onChange={(v) => set("zip_code", v)} />
        <Field label="Service radius" value={f.service_radius} onChange={(v) => set("service_radius", v)} />
        <Field label="Operating regions" value={f.operating_regions} onChange={(v) => set("operating_regions", v)} />
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold text-sm">Equipment & Authority</h2>
        <Field label="Equipment type" value={f.equipment_type} onChange={(v) => set("equipment_type", v)} />
        <div className="space-y-2"><Label>Load capabilities</Label><Textarea value={f.load_capabilities} onChange={(e) => set("load_capabilities", e.target.value)} rows={3} /></div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="DOT number" value={f.dot_number} onChange={(v) => set("dot_number", v)} />
          <Field label="MC number" value={f.mc_number} onChange={(v) => set("mc_number", v)} />
        </div>
        <p className="text-xs text-amber-700">DOT/MC values are informational in TEST mode. TreEbay is not performing real FMCSA or insurance verification yet.</p>
      </Card>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1 h-12" onClick={() => navigate(-1)}>Cancel</Button>
        <Button className="flex-1 h-12" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />} Save Changes
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
