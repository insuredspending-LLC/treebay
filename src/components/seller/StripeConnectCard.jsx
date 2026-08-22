import { Card } from "@/components/ui/card";
import { CreditCard, CheckCircle2 } from "lucide-react";

// Status-only while live commerce is paused. Stripe onboarding actions intentionally
// remain unavailable until the live launch controls and operating policies are approved.
export default function StripeConnectCard({ vendor }) {
  const status = vendor?.stripe_onboarding_status || "not_started";
  const enabled = status === "enabled";

  return (
    <Card className="p-4 card-shadow">
      <div className="flex items-start gap-3">
        <div className={"w-10 h-10 rounded-xl flex items-center justify-center shrink-0 " + (enabled ? "bg-emerald-100 text-emerald-700" : "bg-secondary text-primary")}>
          {enabled ? <CheckCircle2 className="w-5 h-5" /> : <CreditCard className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Payouts</p>
          {enabled ? (
            <p className="text-xs text-emerald-700 mt-0.5">Stripe account connected. Live buyer charges and payouts remain paused.</p>
          ) : (
            <p className="text-xs text-muted-foreground mt-0.5">Payout setup is not open yet. Approved testers can use simulated transactions; public purchases remain disabled.</p>
          )}
        </div>
      </div>
    </Card>
  );
}
