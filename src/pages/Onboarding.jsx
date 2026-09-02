import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAppUser } from "@/hooks/useAppUser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Leaf, ShoppingCart, Store, Truck, Loader2, ArrowLeft, ShieldCheck, Sparkles } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { BUYER_TYPES, apiError } from "@/lib/treebay";
import AIAssistant from "@/components/AIAssistant";

const ROLES = [
  { id: "buyer", title: "Buy plants & trees", desc: "Source inventory, request quotes, and order for your projects.", icon: ShoppingCart },
  { id: "vendor", title: "Grow and sell plants", desc: "Publish nursery inventory, respond to project requests, and fulfill orders.", icon: Store },
  { id: "carrier", title: "Transportation provider", desc: "Move plants and trees for buyers and vendors in TEST freight mode.", icon: Truck },
];

const REQUIRED_BY_ROLE = {
  buyer: [["full_name", "Full name"], ["buyer_type", "Buyer type"], ["phone", "Phone"], ["city", "City"], ["state", "State"], ["zip_code", "ZIP code"]],
  vendor: [["business_name", "Business name"], ["contact_name", "Contact name"], ["phone", "Phone"], ["city", "City"], ["state", "State"], ["zip_code", "ZIP code"]],
  carrier: [["business_name", "Business name"], ["contact_name", "Contact name"], ["phone", "Phone"], ["city", "City"], ["state", "State"], ["zip_code", "ZIP code"]],
};

export default function Onboarding() {
  const { refresh } = useAppUser();
  const [step, setStep] = useState("role");
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const [f, setF] = useState({});
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const finish = async () => {
    const missing = (REQUIRED_BY_ROLE[role] || []).filter(([key]) => !String(f[key] || "").trim()).map(([, label]) => label);
    if (missing.length) {
      toast({ title: "Complete the required fields", description: missing.join(", ") + ".", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      if (role === "buyer") {
        await base44.entities.BuyerProfile.create({
          full_name: f.full_name, business_name: f.business_name, buyer_type: f.buyer_type,
          phone: f.phone, city: f.city, state: f.state, zip_code: f.zip_code,
        });
      } else if (role === "vendor") {
        await base44.functions.invoke("createVendorProfile", {
          business_name: f.business_name, contact_name: f.contact_name, phone: f.phone,
          address: f.address, city: f.city, state: f.state, zip_code: f.zip_code,
          website: f.website, description: f.description, service_area: f.service_area,
          pickup_available: f.pickup_available !== false, delivery_available: f.delivery_available !== false,
          wholesale_available: !!f.wholesale_available,
        });
      } else {
        await base44.functions.invoke("createCarrierProfile", {
          business_name: f.business_name, contact_name: f.contact_name, phone: f.phone,
          address: f.address, city: f.city, state: f.state, zip_code: f.zip_code,
          equipment_type: f.equipment_type, service_radius: f.service_radius,
          operating_regions: f.operating_regions, load_capabilities: f.load_capabilities,
          description: f.description,
          dot_number: f.dot_number, mc_number: f.mc_number,
        });
      }
      // Commit the selected role and legal consent only after the role profile is successfully created.
      await base44.auth.updateMe({ account_type: role, terms_accepted_at: new Date().toISOString(), terms_version: "2" });
      await refresh();
      navigate(role === "vendor" ? "/vendor" : role === "carrier" ? "/carrier" : "/home", { replace: true });
    } catch (e) {
      toast({ title: "Could not save profile", description: apiError(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (step === "role") {
    return (
      <>
        <div className="min-h-screen bg-gradient-to-b from-secondary/80 via-background to-background px-4 py-8 sm:py-12">
          <div className="w-full max-w-2xl mx-auto">
            <div className="flex items-center justify-between gap-3 mb-7">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/15"><Leaf className="w-5 h-5 text-primary-foreground" /></div>
                <span className="font-heading font-extrabold text-xl text-primary">Tree Marketplace</span>
              </div>
              <span className="rounded-full border border-primary/15 bg-card/80 px-3 py-1.5 text-xs font-semibold text-primary shadow-sm">Step 1 of 2</span>
            </div>
            <div className="rounded-[28px] border border-primary/10 bg-card/95 p-5 sm:p-8 shadow-xl shadow-primary/5">
              <div className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-primary mb-4">
                <Sparkles className="w-3.5 h-3.5" /> AI-guided setup
              </div>
        <h1 className="text-2xl font-bold">How will you use Tree Marketplace?</h1>
        <p className="text-muted-foreground mt-2 max-w-xl">Choose the closest match. Tree Marketplace will personalize the app, and you can switch roles later.</p>
        <Button
          variant="outline"
          className="mt-5 h-11 border-primary/20 bg-secondary/40"
          onClick={() => window.dispatchEvent(new CustomEvent("trebay-ai-open", { detail: { prompt: "Help me choose the right Tree Marketplace role." } }))}
        >
          <Sparkles className="w-4 h-4" /> Help me choose
        </Button>
        <div className="mt-7 space-y-3">
          {ROLES.map((r) => (
            <button key={r.id} onClick={() => { setRole(r.id); setStep("profile"); }}
              className="w-full text-left p-4 sm:p-5 rounded-2xl border border-border bg-background/70 transition flex gap-4 items-start hover:border-primary hover:shadow-md active:scale-[0.99]">
              <div className="w-11 h-11 rounded-xl bg-secondary flex items-center justify-center shrink-0"><r.icon className="w-6 h-6 text-primary" /></div>
              <div className="flex-1">
                <p className="font-semibold flex items-center gap-2">{r.title}{r.id === "carrier" && <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">TEST freight</span>}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{r.desc}</p>
              </div>
            </button>
          ))}
        </div>
        <div className="mt-8 p-4 rounded-2xl bg-secondary/50 space-y-2">
          <p className="text-sm font-medium">What you can do on Tree Marketplace</p>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Find inventory from local growers</li>
            <li>• Request bulk quotes for projects</li>
            <li>• Track orders and deliveries</li>
            <li>• Switch to Seller mode anytime</li>
          </ul>
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Sparkles className="w-3 h-3" /> Your setup assistant stays available from every screen after you finish.</p>
        </div>
            </div>
          </div>
        </div>
        <AIAssistant onboarding onboardingRole={role} />
      </>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-gradient-to-b from-secondary/80 via-background to-background px-4 py-8">
        <div className="max-w-2xl mx-auto rounded-[28px] border border-primary/10 bg-card/95 p-5 sm:p-8 shadow-xl shadow-primary/5">
          <div className="flex items-center justify-between gap-3 mb-5">
            <button onClick={() => setStep("role")} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Back</button>
            <span className="rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-primary">Step 2 of 2</span>
          </div>
        <h1 className="text-2xl font-bold">{role === "buyer" ? "Buyer profile" : role === "vendor" ? "Grower profile" : "Carrier profile"}</h1>
        <p className="text-muted-foreground mt-1">A few details personalize your workspace. Required fields are marked with an asterisk.</p>

        <div className="mt-6 space-y-4">
          {role === "buyer" && (
            <>
              <Field label="Full name *" value={f.full_name} onChange={(v) => set("full_name", v)} placeholder="Jordan Rivera" />
              <Field label="Business name (optional)" value={f.business_name} onChange={(v) => set("business_name", v)} placeholder="Rivera Landscaping" />
              <div className="space-y-2">
                <Label>Buyer type *</Label>
                <Select value={f.buyer_type} onValueChange={(v) => set("buyer_type", v)}>
                  <SelectTrigger className="h-12"><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>{BUYER_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Field label="Phone *" value={f.phone} onChange={(v) => set("phone", v)} placeholder="(432) 555-0100" />
              <div className="grid grid-cols-2 gap-3">
                <Field label="City *" value={f.city} onChange={(v) => set("city", v)} placeholder="Midland" />
                <Field label="State *" value={f.state} onChange={(v) => set("state", v)} placeholder="TX" />
              </div>
              <Field label="ZIP code *" value={f.zip_code} onChange={(v) => set("zip_code", v)} placeholder="79701" />
            </>
          )}

          {role === "vendor" && (
            <>
              <Field label="Business name *" value={f.business_name} onChange={(v) => set("business_name", v)} placeholder="West Texas Tree Farm" />
              <Field label="Contact name *" value={f.contact_name} onChange={(v) => set("contact_name", v)} placeholder="Sam Greene" />
              <Field label="Phone *" value={f.phone} onChange={(v) => set("phone", v)} placeholder="(817) 555-0100" />
              <Field label="Business address" value={f.address} onChange={(v) => set("address", v)} placeholder="123 Farm Rd" />
              <div className="grid grid-cols-2 gap-3">
                <Field label="City *" value={f.city} onChange={(v) => set("city", v)} placeholder="Weatherford" />
                <Field label="State *" value={f.state} onChange={(v) => set("state", v)} placeholder="TX" />
              </div>
              <Field label="ZIP code *" value={f.zip_code} onChange={(v) => set("zip_code", v)} placeholder="76086" />
              <Field label="Website (optional)" value={f.website} onChange={(v) => set("website", v)} placeholder="https://" />
              <Field label="Service area" value={f.service_area} onChange={(v) => set("service_area", v)} placeholder="North & Central Texas" />
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={f.description} onChange={(e) => set("description", e.target.value)} rows={3} placeholder="Tell buyers about your nursery..." />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Toggle label="Pickup" value={f.pickup_available !== false} onChange={(v) => set("pickup_available", v)} />
                <Toggle label="Delivery" value={f.delivery_available !== false} onChange={(v) => set("delivery_available", v)} />
                <Toggle label="Wholesale" value={!!f.wholesale_available} onChange={(v) => set("wholesale_available", v)} />
              </div>
            </>
          )}

          {role === "carrier" && (
            <>
              <Field label="Business name *" value={f.business_name} onChange={(v) => set("business_name", v)} placeholder="Lone Star Hauling" />
              <Field label="Contact name *" value={f.contact_name} onChange={(v) => set("contact_name", v)} placeholder="Pat Driver" />
              <Field label="Phone *" value={f.phone} onChange={(v) => set("phone", v)} placeholder="(817) 555-0200" />
              <Field label="Address" value={f.address} onChange={(v) => set("address", v)} placeholder="456 Haul Rd" />
              <div className="grid grid-cols-2 gap-3">
                <Field label="City *" value={f.city} onChange={(v) => set("city", v)} placeholder="Dallas" />
                <Field label="State *" value={f.state} onChange={(v) => set("state", v)} placeholder="TX" />
              </div>
              <Field label="ZIP code *" value={f.zip_code} onChange={(v) => set("zip_code", v)} placeholder="75201" />
              <Field label="Equipment type" value={f.equipment_type} onChange={(v) => set("equipment_type", v)} placeholder="Flatbed, hotshot" />
              <Field label="Service radius" value={f.service_radius} onChange={(v) => set("service_radius", v)} placeholder="300 miles" />
              <Field label="Operating regions" value={f.operating_regions} onChange={(v) => set("operating_regions", v)} placeholder="Texas, Oklahoma" />
              <Field label="Load capabilities" value={f.load_capabilities} onChange={(v) => set("load_capabilities", v)} placeholder="Up to 26,000 lbs" />
              <div className="space-y-2"><Label>Description</Label><Textarea value={f.description} onChange={(e) => set("description", e.target.value)} rows={3} /></div>
            </>
          )}
        </div>

        <Button onClick={finish} disabled={loading} className="w-full h-12 mt-6 text-base font-medium">
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          {role === "vendor" ? "Open grower workspace" : role === "carrier" ? "Open carrier workspace" : "Open buyer workspace"}
        </Button>
        <p className="text-xs text-muted-foreground text-center mt-4 flex items-center justify-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Contact details stay protected; only marketplace profile information is shown publicly.</p>
        </div>
      </div>
      <AIAssistant onboarding onboardingRole={role} />
    </>
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