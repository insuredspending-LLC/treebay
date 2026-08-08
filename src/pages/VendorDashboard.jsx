import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAppUser } from "@/hooks/useAppUser";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, FileText, ShoppingCart, Plus, TrendingUp, AlertTriangle, Store } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { formatCurrency, formatNumber, shortDate } from "@/lib/treebay";

export default function VendorDashboard() {
  const { vendorProfiles, accountType } = useAppUser();
  const vendor = vendorProfiles[0];
  const [products, setProducts] = useState([]);
  const [rfqs, setRfqs] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const ownedIds = (vendorProfiles || []).map((v) => v.id);

  useEffect(() => {
    if (!ownedIds.length) { setLoading(false); return; }
    (async () => {
      try {
        const [prods, rfqList, orderList] = await Promise.all([
          base44.entities.Product.list("-created_date", 300),
          base44.entities.RFQ.filter({ status: "open" }, "-created_date", 50),
          base44.entities.Order.list("-created_date", 100),
        ]);
        setProducts((prods || []).filter((p) => ownedIds.includes(p.vendor_id)));
        setRfqs(rfqList || []);
        setOrders((orderList || []).filter((o) => ownedIds.includes(o.vendor_id)));
      } catch {}
      finally { setLoading(false); }
    })();
  }, [ownedIds.join(",")]);

  if (!vendorProfiles.length) return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">Vendor dashboard</h1>
      <Card className="p-6 text-center">
        <Store className="w-10 h-10 mx-auto text-muted-foreground" />
        <p className="mt-3 font-medium">No vendor profile yet</p>
        <p className="text-sm text-muted-foreground">Switch to the vendor role and complete onboarding, or load demo data to act as a sample vendor.</p>
      </Card>
    </div>
  );

  const activeListings = products.filter((p) => p.listing_status === "active");
  const totalInventory = products.reduce((s, p) => s + (p.quantity_available || 0), 0);
  const lowStock = products.filter((p) => p.quantity_available > 0 && p.quantity_available <= 5);
  const pendingOrders = orders.filter((o) => ["pending", "awaiting_payment", "confirmed", "preparing"].includes(o.order_status));
  const salesTotal = orders.filter((o) => o.payment_status === "paid").reduce((s, o) => s + (o.total || 0), 0);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">{vendorProfiles.length > 1 ? `${vendorProfiles.length} vendor profiles` : vendor.business_name}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{vendorProfiles.map((v) => v.business_name).join(" · ")}</p>
        </div>
        <Button asChild><Link to="/vendor/inventory/new"><Plus className="w-4 h-4 mr-1" /> Add inventory</Link></Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat icon={Package} label="Active listings" value={activeListings.length} />
        <Stat icon={TrendingUp} label="Units in stock" value={formatNumber(totalInventory)} />
        <Stat icon={FileText} label="Open RFQs" value={rfqs.length} />
        <Stat icon={ShoppingCart} label="Paid sales" value={formatCurrency(salesTotal)} />
      </div>

      {lowStock.length > 0 && (
        <Card className="p-4 border-amber-200 bg-amber-50">
          <p className="font-semibold text-sm flex items-center gap-2 text-amber-800"><AlertTriangle className="w-4 h-4" /> Low stock alert</p>
          <div className="mt-2 space-y-1">
            {lowStock.map((p) => <p key={p.id} className="text-sm text-amber-800">{p.common_name} — {p.quantity_available} left</p>)}
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Pending orders ({pendingOrders.length})</h2>
          <Button asChild variant="link" className="p-0 h-auto"><Link to="/vendor/orders">View all</Link></Button>
        </div>
        {pendingOrders.length === 0 ? <p className="text-sm text-muted-foreground py-4 text-center">No pending orders.</p> : (
          <div className="space-y-2">
            {pendingOrders.slice(0, 5).map((o) => (
              <Link key={o.id} to={`/orders/${o.id}`} className="flex justify-between items-center p-2 rounded-lg hover:bg-secondary">
                <div><p className="text-sm font-medium">{o.order_number}</p><p className="text-xs text-muted-foreground">{shortDate(o.created_date)}</p></div>
                <StatusBadge status={o.order_status} />
              </Link>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Open RFQs ({rfqs.length})</h2>
          <Button asChild variant="link" className="p-0 h-auto"><Link to="/vendor/rfqs">View all</Link></Button>
        </div>
        {rfqs.length === 0 ? <p className="text-sm text-muted-foreground py-4 text-center">No open RFQs to quote.</p> : (
          <div className="space-y-2">
            {rfqs.slice(0, 5).map((r) => (
              <Link key={r.id} to={`/vendor/rfqs/${r.id}/quote`} className="flex justify-between items-center p-2 rounded-lg hover:bg-secondary">
                <div><p className="text-sm font-medium">{r.delivery_city}, {r.delivery_state}</p><p className="text-xs text-muted-foreground">{(r.items || []).length} line items</p></div>
                <StatusBadge status="open" />
              </Link>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Button asChild variant="outline" className="h-14"><Link to="/vendor/inventory"><Package className="w-4 h-4 mr-2" /> Manage inventory</Link></Button>
        <Button asChild variant="outline" className="h-14"><Link to="/vendor/rfqs"><FileText className="w-4 h-4 mr-2" /> Review RFQs</Link></Button>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }) {
  return (
    <Card className="p-4">
      <Icon className="w-5 h-5 text-primary" />
      <p className="text-2xl font-bold mt-2">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </Card>
  );
}