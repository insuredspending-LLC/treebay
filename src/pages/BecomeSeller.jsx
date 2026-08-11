import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAppUser } from "@/hooks/useAppUser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Leaf, Loader2, ArrowLeft, ArrowRight, Check, Store, MapPin, Truck, ShieldCheck } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

const STEPS = [
  { num: 1, label: "Business", icon: Store },
  { num: 2, label: "Location", icon: MapPin },
  { num: 3, label: "Capabilities", icon: Truck },
  { num: 4, label: "Review", icon: Check },
];

export default function BecomeSeller() {
  const { refresh } = useAppUser();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [f, setF] = useState({
    pickup_available: true, delivery_available: true, wholesale_available: false,
  });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const next = () => {
    if (step === 1 && (!f.business_name || !f.contact_name || !f.phone)) {
      toast({ title: "Please complete the required fields", variant: "destructive" });
      return;
    }
    if (step === 2 && (!f.city || !f.state || !f.zip_code)) {
      toast({ title: "Please complete the location fields", variant: "destructive" });
      return;
    }
    setStep((s) => Math.min(4, s + 1));
  };
  const back = () => setStep((s) => Math.max(1, s - 1));

  const finish = async () => {
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
        <button onClick={() => (step === 1 ? navigate(-1) : back())} className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="flex items-center gap-2 mb-2">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center"><Leaf className="w-5 h-5 text-primary-foreground" /></div>
          <h1 className="text-2xl font-bold">Become a Seller</h1>
        </div>

        {/* Stepper */}
        <div className="flex items-center my-6">
          {STEPS.map((s, i) => (
            <div key={s.num} className="flex items-center flex-1 last:flex-none">
              <div className={"flex items-center gap-1.5 " + (step >= s.num ? "text-primary" : "text-muted-foreground")}>
                <div className={"w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold " + (step >= s.num ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>
                  {step > s.num ? <Check className="w-3.5 h-3.5" /> : s.num}
                </div>
                <span className="text-xs font-medium hidden sm:inline">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && <div className={"flex-1 h-0.5 mx-1.5 " + (step > s.num ? "bg-primary" : "bg-border")} />}
            </div>
          ))}
        </div>

        {/* Step 1: Business */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="font-semibold">Business Information</h2>
              <p className="text-sm text-muted-foreground">Tell buyers about your nursery.</p>
            </div>
            <Field label="Business name" value={f.business_name} onChange={(v) => set("business_name", v)} placeholder="West Texas Tree Farm" required />
            <Field label="Contact name" value={f.contact_name} onChange={(v) => set("contact_name", v)} placeholder="Sam Greene" required />
            <Field label="Phone" value={f.phone} onChange={(v) => set("phone", v)} placeholder="(817) 555-0100" required />
            <Field label="Website (optional)" value={f.website} onChange={(v) => set("website", v)} placeholder="https://" />
            <div className="space-y-2"><Label>Description</Label><Textarea value={f.description} onChange={(e) => set("description", e.target.value)} rows={3} placeholder="Tell buyers about your nursery..." /></div>
          </div>
        )}

        {/* Step 2: Location & Service Area */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="font-semibold">Location & Service Area</h2>
              <p className="text-sm text-muted-foreground">Where are you located, and what areas do you serve?</p>
            </div>
            <Field label="Business address" value={f.address} onChange={(v) => set("address", v)} placeholder="123 Farm Rd" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="City" value={f.city} onChange={(v) => set("city", v)} placeholder="Weatherford" required />
              <Field label="State" value={f.state} onChange={(v) => set("state", v)} placeholder="TX" required />
            </div>
            <Field label="ZIP code" value={f.zip_code} onChange={(v) => set("zip_code", v)} placeholder="76086" required />
            <Field label="Service area" value={f.service_area} onChange={(v) => set("service_area", v)} placeholder="North & Central Texas" />
          </div>
        )}

        {/* Step 3: Selling Capabilities */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h2 className="font-semibold">Selling Capabilities</h2>
              <p className="text-sm text-muted-foreground">What can you offer buyers?</p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Toggle label="Pickup" value={f.pickup_available !== false} onChange={(v) => set("pickup_available", v)} />
              <Toggle label="Delivery" value={f.delivery_available !== false} onChange={(v) => set("delivery_available", v)} />
              <Toggle label="Wholesale" value={!!f.wholesale_available} onChange={(v) => set("wholesale_available", v)} />
            </div>
            <Card className="p-4 bg-secondary/50 space-y-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary" />
                <p className="text-sm font-medium">Why TreEbay verifies growers</p>
              </div>
              <p className="text-xs text-muted-foreground">TreEbay verifies growers to ensure buyers receive healthy, accurately represented plants. Verification confirms your nursery is a legitimate business.</p>
              <p className="text-xs text-muted-foreground"><span className="font-medium text-amber-700">Pending sellers</span> can create listings and respond to RFQs, but buyers can't purchase until verified.</p>
              <p className="text-xs text-muted-foreground"><span className="font-medium text-emerald-700">Verified sellers</span> can sell directly — buyers can purchase listings and accept quotes.</p>
            </Card>
          </div>
        )}

        {/* Step 4: Review */}
        {step === 4 && (
          <div className="space-y-4">
            <div>
              <h2 className="font-semibold">Review & Submit</h2>
              <p className="text-sm text-muted-foreground">Please review your information before submitting.</p>
            </div>
            <Card className="p-4 space-y-3 text-sm">
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Business</p>
                <p>{f.business_name || "—"}</p>
                <p className="text-muted-foreground">{f.contact_name} · {f.phone}</p>
                {f.description && <p className="text-muted-foreground mt-1">{f.description}</p>}
              </div>
              <div className="pt-3 border-t">
                <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Location</p>
                <p>{f.address || ""} {f.city}, {f.state} {f.zip_code}</p>
                {f.service_area && <p className="text-muted-foreground">Service area: {f.service_area}</p>}
              </div>
              <div className="pt-3 border-t">
                <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Capabilities</p>
                <p>{[f.pickup_available !== false && "Pickup", f.delivery_available !== false && "Delivery", f.wholesale_available && "Wholesale"].filter(Boolean).join(" · ") || "None selected"}</p>
              </div>
            </Card>
            <p className="text-xs text-muted-foreground">By submitting, you confirm your information is accurate. Verification begins as pending — your listings become purchasable once verified.</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-6">
          {step < 4 ? (
            <Button onClick={next} className="flex-1 h-12">Continue <ArrowRight className="w-4 h-4 ml-1" /></Button>
          ) : (
            <Button onClick={finish} disabled={loading} className="flex-1 h-12">
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />} Submit for verification
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, required }) {
  return (
    <div className="space-y-2">
      <Label>{label}{required && <span className="text-destructive"> *</span>}</Label>
      <Input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-12" />
    </div>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!value)}
      className={"flex items-center justify-between px-3 py-3 rounded-xl border text-sm font-medium " + (value ? "border-primary bg-secondary text-primary" : "border-border text-muted-foreground")}>
      {label}
      <span className={"w-9 h-5 rounded-full relative transition " + (value ? "bg-primary" : "bg-muted")}>
        <span className={"absolute top-0.5 w-4 h-4 rounded-full bg-white transition " + (value ? "left-4.5" : "left-0.5")} style={{ left: value ? "1.125rem" : "0.125rem" }} />
      </span>
    </button>
  );
}