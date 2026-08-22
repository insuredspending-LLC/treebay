import { Check, Leaf, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";

const INCLUDED = [
  "Free app download and account",
  "No monthly seller subscription",
  "No buyer marketplace surcharge",
  "Seller storefront, listings, RFQs, orders, and messaging",
];

export default function SellerPlans() {
  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-3xl border bg-gradient-to-br from-emerald-950 via-emerald-900 to-teal-800 px-6 py-8 text-white shadow-xl md:px-10 md:py-12">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
            <Leaf className="h-3.5 w-3.5" /> Simple seller pricing
          </span>
          <h1 className="mt-5 font-heading text-3xl font-bold tracking-tight md:text-5xl">Pay only when a product sells.</h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-emerald-50 md:text-base">
            Tree Marketplace does not charge an app-download, account, or monthly subscription fee.
          </p>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Seller commission</p>
          <div className="mt-2 flex items-end gap-2">
            <strong className="font-heading text-5xl">4%</strong>
            <span className="pb-1 text-sm text-muted-foreground">of merchandise subtotal</span>
          </div>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            The commission is retained from seller product-sale proceeds. It is not added to the buyer's price.
            Each order keeps its original fee snapshot for accurate historical reporting.
          </p>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /><h2 className="font-semibold">Included</h2></div>
          <ul className="mt-5 space-y-3">
            {INCLUDED.map((item) => (
              <li key={item} className="flex gap-2 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {item}</li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="border-amber-200 bg-amber-50 p-5 text-amber-950">
        <h2 className="font-semibold">Payments are not open to the public yet</h2>
        <p className="mt-1 text-sm leading-6">
          Approved closed-test transactions are clearly labeled simulations and move no real money. Live buyer charges and seller payouts remain disabled until launch controls are approved.
        </p>
      </Card>
    </div>
  );
}
