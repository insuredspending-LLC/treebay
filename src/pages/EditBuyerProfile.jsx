import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAppUser } from "@/hooks/useAppUser";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Check, Loader2, ShoppingCart } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { BUYER_TYPES, apiError } from "@/lib/treebay";

export default function EditBuyerProfile() {
  const { user, buyerProfile, refresh } = useAppUser();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({ full_name: "", business_name: "", buyer_type: "", phone: "", city: "", state: "", zip_code: "" });

  useEffect(() => {
    setF({
      full_name: buyerProfile?.full_name || user?.full_name || "",
      business_name: buyerProfile?.business_name || "",
      buyer_type: buyerProfile?.buyer_type || "",
      phone: buyerProfile?.phone || "",
      city: buyerProfile?.city || "",
      state: buyerProfile?.state || "",
      zip_code: buyerProfile?.zip_code || "",
    });
  }, [buyerProfile, user]);

  const set = (key, value) => setF((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    const required = [f.full_name, f.buyer_type, f.city, f.state, f.zip_code];
    if (required.some((value) => !String(value || "").trim())) {
      toast({
        title: "Required information is missing",
        description: "Enter your name, buyer type, city, state, and ZIP code.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        full_name: f.full_name.trim(),
        business_name: f.business_name.trim(),
        buyer_type: f.buyer_type,
        phone: f.phone.trim(),
        city: f.city.trim(),
        state: f.state.trim(),
        zip_code: f.zip_code.trim(),
      };
      if (buyerProfile) await base44.entities.BuyerProfile.update(buyerProfile.id, payload);
      else await base44.entities.BuyerProfile.create(payload);
      try { await base44.auth.updateMe({ full_name: payload.full_name }); } catch {}
      await refresh();
      toast({ title: buyerProfile ? "Buyer profile updated" : "Buyer profile created" });
      navigate("/account", { replace: true });
    } catch (error) {
      toast({ title: "Could not save buyer profile", description: apiError(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <button onClick={() => navigate("/account")} className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="w-4 h-4" /> Back to profile
      </button>
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center"><ShoppingCart className="w-5 h-5 text-primary-foreground" /></div>
        <div>
          <h1 className="text-2xl font-bold">{buyerProfile ? "Edit Buyer Profile" : "Create Buyer Profile"}</h1>
          <p className="text-sm text-muted-foreground">Used for sourcing, RFQs, checkout defaults, and delivery estimates.</p>
        </div>
      </div>

      <Card className="p-4 space-y-4">
        <Field label="Full name *" value={f.full_name} onChange={(v) => set("full_name", v)} />
        <Field label="Business name" value={f.business_name} onChange={(v) => set("business_name", v)} />
        <div className="space-y-2">
          <Label>Buyer type *</Label>
          <Select value={f.buyer_type || undefined} onValueChange={(v) => set("buyer_type", v)}>
            <SelectTrigger className="h-11"><SelectValue placeholder="Select buyer type" /></SelectTrigger>
            <SelectContent>{BUYER_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <Field label="Phone" value={f.phone} onChange={(v) => set("phone", v)} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="City *" value={f.city} onChange={(v) => set("city", v)} />
          <Field label="State *" value={f.state} onChange={(v) => set("state", v)} />
        </div>
        <Field label="ZIP code *" value={f.zip_code} onChange={(v) => set("zip_code", v)} />
      </Card>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1 h-12" onClick={() => navigate("/account")}>Cancel</Button>
        <Button className="flex-1 h-12" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
          Save Profile
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
