import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, CheckCircle2, ExternalLink } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { apiError } from "@/lib/treebay";

// Seller-facing Stripe Connect status. Selling is automatic; this card lets a seller
// start/resume KYC onboarding so they can receive live payouts, or open their Stripe
// dashboard once enabled.
export default function StripeConnectCard({ vendor }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(vendor.stripe_onboarding_status || "not_started");

  const redirect = (url) => {
    if (window.self !== window.top) {
      toast({ title: "Unavailable in preview", description: "Complete this from the published app.", variant: "destructive" });
      return false;
    }
    window.location.href = url;
    return true;
  };

  const startOnboarding = async () => {
    setLoading(true);
    try {
      const { data } = await base44.functions.invoke("createStripeConnectAccount", {});
      if (redirect(data.url)) setStatus("pending");
    } catch (e) { toast({ title: "Could not start onboarding", description: apiError(e), variant: "destructive" }); }
    finally { setLoading(false); }
  };

  const resume = async (type) => {
    setLoading(true);
    try {
      const { data } = await base44.functions.invoke("getStripeAccountLink", { type });
      redirect(data.url);
    } catch (e) { toast({ title: "Could not continue", description: apiError(e), variant: "destructive" }); }
    finally { setLoading(false); }
  };

  const enabled = status === "enabled";
  const restricted = status === "restricted";
  const pending = status === "pending";

  return (
    <Card className="p-4 card-shadow">
      <div className="flex items-start gap-3">
        <div className={"w-10 h-10 rounded-xl flex items-center justify-center shrink-0 " + (enabled ? "bg-emerald-100 text-emerald-700" : restricted ? "bg-amber-100 text-amber-700" : "bg-secondary text-primary")}>
          {enabled ? <CheckCircle2 className="w-5 h-5" /> : <CreditCard className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Payouts</p>
          {enabled ? (
            <p className="text-xs text-emerald-700 mt-0.5">Stripe account connected. Connection alone does not enable live buyer charges.</p>
          ) : restricted ? (
            <p className="text-xs text-amber-700 mt-0.5">Onboarding incomplete — Stripe needs more details before you can receive payouts.</p>
          ) : pending ? (
            <p className="text-xs text-muted-foreground mt-0.5">Onboarding started. Resume to finish and enable payouts.</p>
          ) : (
            <p className="text-xs text-muted-foreground mt-0.5">Connect Stripe to receive live payouts. You can sell in test mode without it.</p>
          )}
        </div>
      </div>
      <div className="mt-3">
        {enabled ? (
          <Button variant="outline" size="sm" onClick={() => resume("dashboard")} disabled={loading} className="w-full">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />} Open Stripe dashboard
          </Button>
        ) : (
          <Button size="sm" onClick={startOnboarding} disabled={loading} className="w-full">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CreditCard className="w-4 h-4 mr-2" />}
            {status === "not_started" ? "Set up payouts" : "Resume onboarding"}
          </Button>
        )}
      </div>
    </Card>
  );
}