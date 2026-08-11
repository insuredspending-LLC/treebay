import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart3, Loader2, TrendingUp, Receipt, Truck, CheckCircle2, AlertTriangle, DollarSign } from "lucide-react";
import { formatCents } from "@/lib/treebay";

export default function AdminFinancials() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { const { data: d } = await base44.functions.invoke("getAdminFinancials", {}); setData(d); } catch {}
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;
  if (!data) return <Card className="p-4">Failed to load financials.</Card>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold flex items-center gap-2"><BarChart3 className="w-5 h-5 text-primary" /> TreEbay Financials</h2>
          <p className="text-xs text-muted-foreground">Authoritative totals from transaction ledger — TEST MODE.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>Refresh</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat icon={TrendingUp} label="GMV" value={formatCents(data.totals.gmv_cents)} />
        <Stat icon={Receipt} label="Sales Tax Collected" value={formatCents(data.totals.sales_tax_collected_cents)} />
        <Stat icon={DollarSign} label="TreEbay Fee Revenue" value={formatCents(data.totals.treebay_fee_revenue_cents)} />
        <Stat icon={AlertTriangle} label="Open Exceptions" value={data.totals.open_exceptions} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat icon={DollarSign} label="Vendor Payables" value={formatCents(data.totals.vendor_payables_cents)} />
        <Stat icon={Truck} label="Carrier Payables" value={formatCents(data.totals.carrier_payables_cents)} />
        <Stat icon={CheckCircle2} label="Settled Vendor Payouts" value={formatCents(data.totals.settled_vendor_payouts_cents)} />
        <Stat icon={CheckCircle2} label="Settled Carrier Payouts" value={formatCents(data.totals.settled_carrier_payouts_cents)} />
      </div>

      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-2">Active Fee Policy</h3>
        <div className="text-sm space-y-1">
          <p><span className="text-muted-foreground">Rule:</span> {data.active_fee_policy.rule_name}</p>
          <p><span className="text-muted-foreground">Percentage:</span> {data.active_fee_policy.percentage_fee}%</p>
          {data.active_fee_policy.minimum_fee_cents > 0 && <p><span className="text-muted-foreground">Minimum fee:</span> {formatCents(data.active_fee_policy.minimum_fee_cents)}</p>}
          <p><span className="text-muted-foreground">Fee payer:</span> {data.active_fee_policy.fee_payer}</p>
          <p className="text-xs text-muted-foreground pt-1">In buyer-pays mode, the fee is NOT deducted from vendor proceeds.</p>
        </div>
      </Card>

      {data.financial_exceptions.length > 0 && (
        <Card className="p-4 border-rose-200 bg-rose-50">
          <h3 className="font-semibold text-sm mb-2 text-rose-800">Financial Exceptions ({data.financial_exceptions.length})</h3>
          <div className="space-y-1">
            {data.financial_exceptions.map((e) => (
              <div key={e.id} className="text-sm flex justify-between">
                <span className="font-medium capitalize">{(e.type || "").replace(/_/g, " ")}</span>
                <span className="text-xs text-muted-foreground">{e.reason}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {data.partial && <p className="text-xs text-amber-600">Partial TEST totals — more records exist beyond the scanned window.</p>}
      <p className="text-xs text-muted-foreground">Note: "TreEbay Fee Revenue" is NOT profit — processor costs, operating expenses, taxes, refunds, and chargebacks may exist later.</p>
    </div>
  );
}

function Stat({ icon: Icon, label, value }) {
  return <Card className="p-4"><Icon className="w-5 h-5 text-primary" /><p className="text-lg font-bold mt-2">{value}</p><p className="text-xs text-muted-foreground">{label}</p></Card>;
}