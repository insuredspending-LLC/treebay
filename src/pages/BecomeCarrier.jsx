import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAppUser } from "@/hooks/useAppUser";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { Truck, Loader2, ChevronLeft } from "lucide-react";
import { apiError } from "@/lib/treebay";

const US_STATES = ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC"];

export default function BecomeCarrier() {
  const navigate = useNavigate();
  const { refresh } = useAppUser();
  const { toast } = useToast();
  const [form, setForm] = useState({ business_name: "", contact_name: "", phone: "", address: "", city: "", state: "", zip_code: "", equipment_type: "flatbed", service_radius: "", load_capabilities: "", description: "" });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.business_name || !form.contact_name || !form.phone || !form.city || !form.state || !form.zip_code) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await base44.functions.invoke("createCarrierProfile", form);
      await refresh();
      toast({ title: "Carrier profile created", description: "Verification is pending. An admin must verify your profile before you can accept loads." });
      navigate("/carrier");
    } catch (e) { toast({ title: "Failed to create carrier profile", description: apiError(e), variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <button onClick={() => navigate(-1)} className="text-sm text-muted-foreground flex items-center gap-1"><ChevronLeft className="w-4 h-4" /> Back</button>
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Truck className="w-6 h-6 text-primary" /> Become a Carrier</h1>
        <p className="text-sm text-muted-foreground mt-1">Register as a TEST freight carrier. No real FMCSA/insurance verification — clearly TEST until real integrations are installed.</p>
      </div>

      <Card className="p-5 space-y-4">
        <div className="space-y-1"><Label>Business Name *</Label><Input value={form.business_name} onChange={(e) => set("business_name", e.target.value)} placeholder="Acme Freight Co." /></div>
        <div className="space-y-1"><Label>Contact Name *</Label><Input value={form.contact_name} onChange={(e) => set("contact_name", e.target.value)} placeholder="Full name" /></div>
        <div className="space-y-1"><Label>Phone *</Label><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(555) 123-4567" /></div>
        <div className="space-y-1"><Label>Address</Label><Input value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Street address" /></div>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1"><Label>City *</Label><Input value={form.city} onChange={(e) => set("city", e.target.value)} /></div>
          <div className="space-y-1"><Label>State *</Label><Select value={form.state} onValueChange={(v) => set("state", v)}><SelectTrigger><SelectValue placeholder="State" /></SelectTrigger><SelectContent>{US_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>ZIP *</Label><Input value={form.zip_code} onChange={(e) => set("zip_code", e.target.value)} /></div>
        </div>
        <div className="space-y-1"><Label>Equipment Type</Label><Select value={form.equipment_type} onValueChange={(v) => set("equipment_type", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="flatbed">Flatbed</SelectItem><SelectItem value="reefer">Reefer</SelectItem><SelectItem value="lowboy">Lowboy</SelectItem><SelectItem value="box_truck">Box Truck</SelectItem></SelectContent></Select></div>
        <div className="space-y-1"><Label>Service Radius</Label><Input value={form.service_radius} onChange={(e) => set("service_radius", e.target.value)} placeholder="e.g. 200 miles" /></div>
        <div className="space-y-1"><Label>Load Capabilities</Label><Textarea value={form.load_capabilities} onChange={(e) => set("load_capabilities", e.target.value)} rows={2} placeholder="Max weight, dimensions, special handling" /></div>
        <div className="space-y-1"><Label>Description</Label><Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="Tell buyers about your carrier service" /></div>
        <Button onClick={submit} disabled={saving} className="w-full h-12">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Truck className="w-4 h-4 mr-2" />} Create Carrier Profile
        </Button>
      </Card>
    </div>
  );
}