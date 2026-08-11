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
        <p className="text-sm text-muted-foreground">Authoritative data from transaction ledger — TEST MODE.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard icon={TrendingUp} label="Gross Merch Sales" value={formatCents(v.totals.gross_merchandise_sales_cents)} />
        <StatCard icon={Receipt} label="Tax Collected by TreEbay" value={formatCents(v.totals.tax_collected_cents)} />
        <StatCard icon={Truck} label="Delivery Revenue" value={formatCents(v.totals.vendor_delivery_revenue_cents)} />
        <StatCard icon={CheckCircle2} label="Net Settled Proceeds" value={formatCents(v.totals.net_settled_proceeds_cents)} />
        <StatCard icon={Receipt} label="Refunds" value={formatCents(v.totals.refunds_cents)} />
        <StatCard icon={BarChart3} label="Total Orders" value={v.totals.total_orders} />
      </div>

      <Card className="p-4">
        <h2 className="font-semibold text-sm mb-2">Fee Policy</h2>
        <p className="text-sm text-muted-foreground">
          TreEbay marketplace fee: <strong>{v.totals.fee_payer === "buyer" ? "Buyer-paid" : v.totals.fee_payer}</strong>.
          {v.totals.fee_payer === "buyer" && " The fee is NOT deducted from your proceeds."}
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