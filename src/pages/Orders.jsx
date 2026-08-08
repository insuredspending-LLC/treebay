import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAppUser } from "@/hooks/useAppUser";
import { Card } from "@/components/ui/card";
import { ShoppingCart, Loader2 } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import StatusBadge from "@/components/StatusBadge";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, shortDate, formatCurrency } from "@/lib/treebay";

export default function Orders() {
  const { accountType } = useAppUser();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { setOrders(await base44.entities.Order.list("-created_date", 100) || []); } catch {}
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-bold">Orders</h1><p className="text-sm text-muted-foreground">{accountType === "vendor" ? "Orders from buyers." : "Your marketplace orders."}</p></div>
      {loading ? <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
        : orders.length === 0 ? <EmptyState icon={ShoppingCart} title="No orders yet" description="Orders will appear here once a quote is accepted or a product is purchased." />
        : (
          <div className="space-y-3">
            {orders.map((o) => (
              <Link key={o.id} to={`/orders/${o.id}`}>
                <Card className="p-4 hover:shadow-sm hover:border-primary/40 transition">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{o.order_number}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{accountType === "vendor" ? "Buyer" : "Vendor"}: {o.vendor_name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{shortDate(o.created_date)} · {(o.items || []).length} item{(o.items || []).length === 1 ? "" : "s"}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{formatCurrency(o.total)}</p>
                      <div className="flex flex-col gap-1 mt-1 items-end">
                        <StatusBadge status={o.order_status} label={ORDER_STATUS_LABELS[o.order_status]} />
                        <StatusBadge status={o.payment_status} label={PAYMENT_STATUS_LABELS[o.payment_status]} />
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
    </div>
  );
}