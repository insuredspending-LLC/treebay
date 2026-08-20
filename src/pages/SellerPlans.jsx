import { useState } from "react";
import { Link } from "react-router-dom";
import { BadgeDollarSign, Check, Leaf, Loader2, Megaphone, ShieldCheck, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAppUser } from "@/hooks/useAppUser";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { apiError } from "@/lib/treebay";
import {
  CURRENT_TEST_MARKETPLACE_FEE_PERCENT,
  FEATURED_LISTING_PRODUCTS,
  SELLER_PLANS,
  TARGET_PRODUCTION_MARKETPLACE_FEE_PERCENT,
  VERIFIED_SELLER_PROGRAM,
} from "@/lib/sellerPlans";

export default function SellerPlans() {
  const { vendorProfiles, refresh } = useAppUser();
  const { toast } = useToast();
  const vendor = vendorProfiles[0];
  const selectedPlan = vendor?.requested_seller_plan || vendor?.seller_plan || "free";
  const [busyPlan, setBusyPlan] = useState("");

  async function requestPlan(plan) {
    setBusyPlan(plan);
    try {
      const response = await base44.functions.invoke("requestSellerPlanPreview", { plan });
      const payload = response?.data || response;
      if (payload?.error) throw new Error(payload.error);
      await refresh();
      toast({
        title: "Founding plan saved",
        description: "No charge was created. We will keep this selection ready for test-billing activation.",
      });
    } catch (error) {
      toast({ title: "Could not save plan", description: apiError(error), variant: "destructive" });
    } finally {
      setBusyPlan("");
    }
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl border bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-800 px-6 py-8 text-white shadow-xl md:px-10 md:py-12">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
            <Sparkles className="h-3.5 w-3.5" /> Founding pricing preview
          </span>
          <h1 className="mt-5 font-heading text-3xl font-bold tracking-tight md:text-5xl">Seller tools that grow with your nursery.</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-emerald-50 md:text-base">
            Start free, prove buyer demand, and select the operating capacity that fits your catalog. Paid billing is not active yet, so preview selections create no charge.
          </p>
        </div>
      </section>

      {vendor && (
        <Card className="flex flex-wrap items-center gap-4 border-primary/20 bg-primary/5 p-5">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-primary-foreground"><Leaf className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Your founding selection</p>
            <p className="font-semibold capitalize">{selectedPlan} Seller</p>
            <p className="text-xs text-muted-foreground">Active paid entitlements remain disabled. Current marketplace behavior is unchanged.</p>
          </div>
          <span className="rounded-full border bg-background px-3 py-1 text-xs font-semibold">No charge</span>
        </Card>
      )}

      <section>
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Seller subscriptions</p>
          <h2 className="font-heading text-2xl font-bold">Choose a founding plan</h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {SELLER_PLANS.map((plan) => {
            const selected = selectedPlan === plan.id;
            const featured = plan.id === "professional";
            return (
              <Card key={plan.id} className={"flex min-h-[390px] flex-col p-6 " + (featured ? "border-primary/40 shadow-lg ring-1 ring-primary/10" : "")}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-primary">{plan.eyebrow}</p>
                    <h3 className="mt-1 font-heading text-xl font-bold">{plan.name}</h3>
                  </div>
                  {featured && <span className="rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">Popular</span>}
                </div>
                <div className="mt-5 flex items-end gap-1">
                  <strong className="font-heading text-4xl">{"$" + plan.price}</strong>
                  <span className="pb-1 text-sm text-muted-foreground">/ month</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{plan.description}</p>
                <ul className="my-6 flex-1 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {feature}</li>
                  ))}
                </ul>
                {!vendor ? (
                  <Button asChild variant={featured ? "default" : "outline"}><Link to="/become-seller">Create seller profile</Link></Button>
                ) : (
                  <Button
                    variant={featured ? "default" : "outline"}
                    disabled={selected || Boolean(busyPlan)}
                    onClick={() => requestPlan(plan.id)}
                  >
                    {busyPlan === plan.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {selected ? "Preview selected" : "Select preview"}
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Optional revenue products</p>
          <h2 className="font-heading text-2xl font-bold">Visibility and trust</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-6">
            <div className="flex items-center gap-3"><Megaphone className="h-5 w-5 text-primary" /><h3 className="font-semibold">Featured listings</h3></div>
            <p className="mt-2 text-sm text-muted-foreground">Planned seven-day promotion options for sellers who want additional marketplace visibility.</p>
            <div className="mt-5 divide-y rounded-xl border">
              {FEATURED_LISTING_PRODUCTS.map((product) => (
                <div key={product.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <span><strong className="block">{product.name}</strong><small className="text-muted-foreground">{product.duration}</small></span>
                  <strong>{"$" + product.price}</strong>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-primary" /><h3 className="font-semibold">{VERIFIED_SELLER_PROGRAM.name}</h3></div>
            <div className="mt-5 flex items-end gap-1"><strong className="font-heading text-4xl">{"$" + VERIFIED_SELLER_PROGRAM.annualPrice}</strong><span className="pb-1 text-sm text-muted-foreground">/ year</span></div>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Planned enhanced business review, trust badge, and annual reverification. This is separate from the marketplace's current administrative verification workflow.
            </p>
            <Button className="mt-6 w-full" variant="outline" disabled>Opens with test billing</Button>
          </Card>
        </div>
      </section>

      <Card className="border-amber-200 bg-amber-50 p-5 text-amber-950">
        <div className="flex gap-3">
          <BadgeDollarSign className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <h2 className="font-semibold">Marketplace fee boundary</h2>
            <p className="mt-1 text-sm leading-6">
              The frozen TEST transaction engine remains {CURRENT_TEST_MARKETPLACE_FEE_PERCENT}% buyer-paid. A {TARGET_PRODUCTION_MARKETPLACE_FEE_PERCENT}% fee is the planning target for a future production launch, subject to final disclosure and approval. This pricing preview does not change checkout calculations, payments, payouts, or settlements.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
