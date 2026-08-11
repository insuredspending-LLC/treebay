import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { BarChart3, Loader2, Truck, CheckCircle2, Clock } from "lucide-react";
import { formatCents } from "@/lib/treebay";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";

export default function CarrierFinancials() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { const { data: d } = await base44.functions.invoke("getCarrierFinancials", {}); setData(d); } catch {}
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;
  if (!data) return <EmptyState icon={BarChart3} title="No carrier profile found" />;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Financials</h1>
        <p className="text-sm text-muted-foreground">TEST MODE — no real payouts are processed.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={Truck} label="Gross Earnings" value={formatCents(data.totals.gross_freight_earnings_cents)} />
        <StatCard icon={Clock} label="Pending" value={formatCents(data.totals.pending_earnings_cents)} />
        <StatCard icon={CheckCircle2} label="Settled" value={formatCents(data.totals.settled_earnings_cents)} />
      </div>

      <Card className="p-4">
        <h2 className="font-semibold text-sm mb-3">Load Statements</h2>
        {data.loads.length === 0 ? <EmptyState icon={Truck} title="No freight loads yet" /> : (
          <div className="space-y-2">
            {data.loads.map((load) => (
              <div key={load.order_id} className="flex justify-between items-center p-3 rounded-lg border border-border">
                <div>
                  <p className="font-medium text-sm">{load.quote_reference}</p>
                  <p className="text-xs text-muted-foreground">{load.pickup_location || "—"} → {load.delivery_location || "—"}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <StatusBadge status={load.shipment_status} />
                    {load.settled && <span className="text-xs text-emerald-600 font-medium">Settled</span>}
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-sm">{formatCents(load.carrier_pay_cents)}</p>
                  <p className="text-xs text-muted-foreground">LH {formatCents(load.linehaul_cents)} · Fuel {formatCents(load.fuel_surcharge_cents)}</p>
                </div>
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