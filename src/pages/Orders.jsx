import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAppUser } from "@/hooks/useAppUser";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Loader2, Truck, Clock, ChevronRight } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import StatusBadge from "@/components/StatusBadge";
import PullToRefresh from "@/components/PullToRefresh";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, shortDate, formatCurrency, formatNumber } from "@/lib/treebay";

const SELLER_TABS = [
  { key: "all", label: "All", statuses: null },
  { key: "confirm", label: "Needs Confirmation", statuses: ["payment_confirmed", "inventory_reserved"] },
  { key: "preparing", label: "Preparing", statuses: ["vendor_confirmed", "preparing"] },
  { key: "ready", label: "Ready", statuses: ["ready_for_pickup"] },
  { key: "delivery", label: "Delivery", statuses: ["delivery_assigned", "picked_up", "in_transit"] },
  { key: "completed", label: "Completed", statuses: ["delivered", "completed"] },
];

function getNextSellerAction(order) {
  const s = order.order_status;
  const isPickup = order.fulfillment_method === "buyer_pickup" || order.fulfillment_method === "pickup";
  if (s === "payment_confirmed" || s === "inventory_reserved") return "Confirm order";
  if (s === "vendor_confirmed") return "Begin preparing";
  if (s === "preparing") return "Mark ready for pickup";
  if (s === "ready_for_pickup") return isPickup ? "Confirm pickup" : "Assign delivery";
  if (s === "delivery_assigned") return "Confirm pickup";
  if (s === "picked_up") return isPickup ? "Confirm delivery" : "Mark in transit";
  if (s === "in_transit") return "Confirm delivery";
  return null;
}

function jobsiteDisplay(order) {
  const contact = order.contact_name || order.destination_name || "";
  const loc = [order.destination_city, order.destination_state].filter(Boolean).join(", ");
  return [contact, loc].filter(Boolean).join(" · ") || "—";
}

function deliveryLabel(method) {
  if (method === "buyer_pickup" || method === "pickup") return "Buyer pickup";
  if (method === "vendor_delivery") return "Vendor delivery";
  return "Third-party carrier";
}

export default function Orders() {
  const { accountType, user } = useAppUser();
  const isSeller = accountType === "vendor";
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const list = isSeller
        ? await base44.entities.Order.filter({ vendor_owner_id: user.id }, "-created_date", 100)
        : await base44.entities.Order.list("-created_date", 100);
      setOrders(list || []);
    } catch {}
    finally { if (!silent) setLoading(false); }
  };
  useEffect(() => { if (!isSeller || user?.id) load(); }, [user?.id]);

  const activeTab = SELLER_TABS.find((t) => t.key === tab);
  const filtered = isSeller && tab !== "all" ? orders.filter((o) => activeTab.statuses.includes(o.order_status)) : orders;

  return (
    <PullToRefresh onRefresh={() => load(true)}>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold">Orders</h1>
          <p className="text-sm text-muted-foreground">{isSeller ? "Orders from buyers for your nursery." : "Your marketplace orders."}</p>
        </div>

        {isSeller && (
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {SELLER_TABS.map((t) => {
              const count = t.statuses ? orders.filter((o) => t.statuses.includes(o.order_status)).length : orders.length;
              return (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={"shrink-0 rounded-full px-4 py-2 text-sm font-medium transition " + (tab === t.key ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/80")}>
                  {t.label} <span className="ml-1 opacity-70">{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {loading ? <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
          : filtered.length === 0 ? <EmptyState icon={ShoppingCart} title="No orders" description={isSeller ? "No orders in this category right now." : "Orders will appear here once a quote is accepted or a product is purchased."} />
          : (
            <div className="space-y-3">
              {filtered.map((o) => (
                <Link key={o.id} to={`/orders/${o.id}`}>
                  <Card className="p-4 hover:shadow-sm hover:border-primary/40 transition">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2"><p className="font-semibold">{o.order_number}</p><Badge variant={(o.commerce_mode || "test") === "live" ? "default" : "outline"}>{(o.commerce_mode || "test") === "live" ? "LIVE" : "TEST"}</Badge></div>
                        {isSeller ? (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{jobsiteDisplay(o)}</p>
                        ) : (
                          <p className="text-xs text-muted-foreground mt-0.5">{o.vendor_name}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {shortDate(o.created_date)} · {(o.items || []).length} item{(o.items || []).length === 1 ? "" : "s"} · {formatNumber((o.items || []).reduce((s, i) => s + (i.quantity || 0), 0))} units
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Truck className="w-3 h-3" /> {deliveryLabel(o.fulfillment_method)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold">{formatCurrency(o.total)}</p>
                        <div className="flex flex-col gap-1 mt-1 items-end">
                          <StatusBadge status={o.order_status} label={ORDER_STATUS_LABELS[o.order_status]} />
                          <StatusBadge status={o.payment_status} label={PAYMENT_STATUS_LABELS[o.payment_status]} />
                        </div>
                      </div>
                    </div>
                    {isSeller && getNextSellerAction(o) && (
                      <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
                        <Clock className="w-4 h-4 text-primary" />
                        <span className="text-sm font-medium text-primary">Next: {getNextSellerAction(o)}</span>
                        <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto" />
                      </div>
                    )}
                    {isSeller && o.order_status === "delivered" && (
                      <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Tree Marketplace will complete this order automatically.</span>
                      </div>
                    )}
                  </Card>
                </Link>
              ))}
            </div>
          )}
      </div>
    </PullToRefresh>
  );
}