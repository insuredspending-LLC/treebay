import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAppUser } from "@/hooks/useAppUser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Leaf, Loader2, ArrowLeft } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export default function BecomeSeller() {
  const { refresh } = useAppUser();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [f, setF] = useState({});
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const finish = async () => {
    if (!f.business_name || !f.contact_name || !f.phone || !f.city || !f.state || !f.zip_code) {
      toast({ title: "Please complete the required fields", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await base44.functions.invoke("createVendorProfile", {
        business_name: f.business_name, contact_name: f.contact_name, phone: f.phone,
        address: f.address, city: f.city, state: f.state, zip_code: f.zip_code,
        website: f.website, description: f.description, service_area: f.service_area,
        pickup_available: f.pickup_available !== false, delivery_available: f.delivery_available !== false,
        wholesale_available: !!f.wholesale_available,
      });
      await refresh();
      toast({ title: "Vendor profile created", description: "Verification starts as pending." });
      navigate("/vendor", { replace: true });
    } catch (e) {
      toast({ title: "Could not save profile", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="max-w-lg mx-auto">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-4"><ArrowLeft className="w-4 h-4" /> Back</button>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center"><Leaf className="w-5 h-5 text-primary-foreground" /></div>
          <h1 className="text-2xl font-bold">Become a Seller</h1>
        </div>
        <p className="text-muted-foreground mt-1">Create a vendor profile to list inventory and respond to RFQs. Verification begins as pending — your listings become purchasable once verified.</p>

        <div className="mt-6 space-y-4">
          <Field label="Business name" value={f.business_name} onChange={(v) => set("business_name", v)} placeholder="West Texas Tree Farm" />
          <Field label="Contact name" value={f.contact_name} onChange={(v) => set("contact_name", v)} placeholder="Sam Greene" />
          <Field label="Phone" value={f.phone} onChange={(v) => set("phone", v)} placeholder="(817) 555-0100" />
          <Field label="Business address" value={f.address} onChange={(v) => set("address", v)} placeholder="123 Farm Rd" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="City" value={f.city} onChange={(v) => set("city", v)} placeholder="Weatherford" />
            <Field label="State" value={f.state} onChange={(v) => set("state", v)} placeholder="TX" />
          </div>
          <Field label="ZIP code" value={f.zip_code} onChange={(v) => set("zip_code", v)} placeholder="76086" />
          <Field label="Website (optional)" value={f.website} onChange={(v) => set("website", v)} placeholder="https://" />
          <Field label="Service area" value={f.service_area} onChange={(v) => set("service_area", v)} placeholder="North & Central Texas" />
          <div className="space-y-2"><Label>Description</Label><Textarea value={f.description} onChange={(e) => set("description", e.target.value)} rows={3} placeholder="Tell buyers about your nursery..." /></div>
        </div>

        <Button onClick={finish} disabled={loading} className="w-full h-12 mt-6 text-base font-medium">
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Create vendor profile
        </Button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-12" />
    </div>
  );
}