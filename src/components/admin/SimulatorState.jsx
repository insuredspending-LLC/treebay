import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import StatusBadge from "@/components/StatusBadge";
import { formatCurrency } from "@/lib/treebay";

function Row({ label, value }) {
  return <div className="flex justify-between gap-3 text-sm"><span className="text-muted-foreground">{label}</span><span className="font-medium text-right">{value}</span></div>;
}

export default function SimulatorState({ result }) {
  const s = result.state;
  if (!s) return <Card className="p-4"><p className="text-sm text-muted-foreground">Maintenance run complete: {JSON.stringify(result.result)}</p></Card>;

  const inv = s.inventory;
  const led = s.ledger;
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-sm">{s.order_number}</p>
        <StatusBadge status={s.order_status} />
      </div>

      {result.result?.error && <p className="text-sm text-rose-600">{result.result.error}</p>}

      <div className="space-y-1">
        <Row label="Payment" value={s.payment_status} />
        {s.payment.map((p, i) => <Row key={i} label={p.ref || "Payment record"} value={`${p.status} · ${formatCurrency((p.amount_cents || 0) / 100)}`} />)}
        {s.shipment.length > 0 && <Row label="Shipment" value={s.shipment.join(", ")} />}
        {s.reservation && <Row label="Inventory hold" value={`${s.reservation.status} · ${s.reservation.quantity} units`} />}
        {inv && <Row label="Listing stock" value={`${inv.available} available · ${inv.reserved} held · ${inv.sold} sold`} />}
      </div>

      <div className="pt-2 border-t space-y-1">
        <Row label="Ledger entries" value={`${led.allocation_entries} allocation · ${led.settlement_entries} settlement · ${led.refund_entries} refund`} />
        <Row label="Money in / out" value={`${formatCurrency(led.allocation_debits / 100)} / ${formatCurrency(led.allocation_credits / 100)}`} />
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Books balanced</span>
          <Badge className={led.allocation_reconciled ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}>
            {led.allocation_reconciled ? "Reconciled" : "Out of balance"}
          </Badge>
        </div>
      </div>

      <div className="pt-2 border-t">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Open exceptions</p>
        {s.open_exceptions.length === 0 ? <p className="text-sm text-emerald-700">None — handled autonomously.</p> : (
          <div className="space-y-1">{s.open_exceptions.map((e, i) => (
            <div key={i} className="flex justify-between text-sm"><span className="capitalize">{e.type.replace(/_/g, " ")}</span><StatusBadge status={(e.severity || "").toLowerCase()} /></div>
          ))}</div>
        )}
      </div>
    </Card>
  );
}