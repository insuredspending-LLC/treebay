import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { BarChart3, Loader2, TrendingUp, Receipt, Truck, CheckCircle2 } from "lucide-react";
import { formatCents } from "@/lib/treebay";
import EmptyState from "@/components/EmptyState";

export default function VendorFinancials() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { const { data: d } = await base44.functions.invoke("getVendorFinancials", {}); setData(d); } catch {}
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;
  if (!data || !data.vendors?.length) return <EmptyState icon={BarChart3} title="No vendor profile found" />;

  const v = data.vendors[0];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Seller Financials</h1>
        <p className="text-sm text-muted-foreground">Live earnings only. Test transactions are excluded from sales and payout totals.</p>
      </div>

      {v.totals.test_orders_excluded > 0 && (
        <Card className="p-4 border-amber-200 bg-amber-50">
          <p className="text-sm font-semibold text-amber-900">Test history excluded</p>
          <p className="text-xs text-amber-800 mt-1">{v.totals.test_orders_excluded} simulated orders · {formatCents(v.totals.test_simulated_gmv_cents || 0)} simulated GMV. This is not seller revenue.</p>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard icon={TrendingUp} label="Gross Marketplace Sales" value={formatCents(v.totals.gross_merchandise_sales_cents)} />
        <StatCard icon={Receipt} label="Taxable Marketplace Sales" value={formatCents(v.totals.taxable_marketplace_sales_cents)} />
        <StatCard icon={Receipt} label="Tax Collected by Tree Marketplace" value={formatCents(v.totals.tax_collected_cents)} />
        <StatCard icon={Truck} label="Delivery Revenue" value={formatCents(v.totals.vendor_delivery_revenue_cents)} />
        <StatCard icon={Receipt} label="Seller Commissions Deducted" value={formatCents(v.totals.vendor_fee_deduction_cents)} />
        <StatCard icon={CheckCircle2} label="Net Settled Proceeds" value={formatCents(v.totals.net_settled_proceeds_cents)} />
        <StatCard icon={Receipt} label="Refunds" value={formatCents(v.totals.refunds_cents)} />
      </div>
      {data.partial && <p className="text-xs text-amber-600">Partial totals — more records exist beyond the scanned window.</p>}

      <Card className="p-4">
        <h2 className="font-semibold text-sm mb-2">Fee Policy</h2>
        <p className="text-sm text-muted-foreground">
          Current standard: <strong>{v.totals.current_commission_rate_percent ?? 4}% seller commission</strong> on merchandise subtotal,
          retained from seller product-sale proceeds. It is not a buyer surcharge, download fee, account fee, or subscription.
          {v.totals.fee_payer === "mixed" && " Historical orders with earlier fee rules remain reported under their original snapshots."}
        </p>
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold text-sm mb-3">Period Summaries</h2>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <PeriodBlock label="This Month" data={v.periods.this_month} />
          <PeriodBlock label="Previous Month" data={v.periods.previous_month} />
          <PeriodBlock label="Year to Date" data={v.periods.year_to_date} />
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="font-semibold text-sm mb-3">Recent Orders</h2>
        {v.recent_orders.length === 0 ? <EmptyState icon={BarChart3} title="No orders yet" /> : (
          <div className="space-y-1">
            {v.recent_orders.map((o) => (
              <div key={o.order_number} className="flex justify-between text-sm py-1.5 border-b border-border last:border-0">
                <span className="font-medium">{o.order_number}</span>
                <span className="text-muted-foreground">{o.order_status} · {formatCents(o.total_cents || 0)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }) {
  return <Card className="p-4"><Icon className="w-5 h-5 text-primary" /><p className="text-lg font-bold mt-2">{value}</p><p className="text-xs text-muted-foreground">{label}</p></Card>;
}

function PeriodBlock({ label, data }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{formatCents(data.gross_sales_cents || 0)}</p>
      <p className="text-xs text-muted-foreground">{data.order_count || 0} orders</p>
      <p className="text-xs text-muted-foreground">Tax: {formatCents(data.tax_collected_cents || 0)}</p>
    </div>
  );
}