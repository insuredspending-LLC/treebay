import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ClipboardCheck, FileText, Package, Plus, Sparkles, Truck } from "lucide-react";
import { formatNumber, shortDate } from "@/lib/treebay";

export default function SellerDashboard({ vendor }) {
  const [data, setData] = useState({ products: [], orders: [], rfqs: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      base44.entities.Product.filter({ vendor_id: vendor.id }, "-created_date", 50),
      base44.entities.Order.filter({ vendor_id: vendor.id }, "-created_date", 50),
      base44.entities.RFQ.filter({ status: "open" }, "-created_date", 50),
    ])
      .then(([products, orders, rfqs]) => setData({ products, orders, rfqs }))
      .finally(() => setLoading(false));
  }, [vendor.id]);

  const summary = useMemo(() => ({
    confirm: data.orders.filter((o) => ["payment_confirmed", "inventory_reserved"].includes(o.order_status)),
    preparing: data.orders.filter((o) => ["vendor_confirmed", "preparing", "ready_for_pickup", "delivery_assigned"].includes(o.order_status)),
    low: data.products.filter((p) => p.quantity_available > 0 && p.quantity_available <= 5),
  }), [data]);

  const attention = [
    ...summary.confirm.map((o) => ({ id: o.id, label: `Confirm order ${o.order_number}`, detail: "Buyer payment is confirmed.", to: `/orders/${o.id}`, icon: ClipboardCheck })),
    ...summary.preparing.map((o) => ({ id: o.id, label: `Prepare order ${o.order_number}`, detail: `Next: ${o.order_status.replaceAll("_", " ")}.`, to: `/orders/${o.id}`, icon: Truck })),
    ...summary.low.map((p) => ({ id: p.id, label: `Low stock: ${p.common_name}`, detail: `${formatNumber(p.quantity_available)} currently available.`, to: `/vendor/inventory/${p.id}`, icon: AlertTriangle })),
  ].slice(0, 6);

  if (loading) return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="h-3 w-32 rounded skeleton-shimmer" />
          <div className="h-7 w-48 rounded skeleton-shimmer" />
          <div className="h-4 w-64 rounded skeleton-shimmer" />
        </div>
        <div className="h-11 w-36 rounded-lg skeleton-shimmer" />
      </header>
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-4 space-y-3">
            <div className="h-5 w-5 rounded skeleton-shimmer" />
            <div className="h-7 w-16 rounded skeleton-shimmer" />
            <div className="h-3 w-24 rounded skeleton-shimmer" />
          </Card>
        ))}
      </section>
      <Card className="divide-y">
        <div className="p-4"><div className="h-5 w-48 rounded skeleton-shimmer" /></div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="p-4 space-y-2">
            <div className="h-4 w-40 rounded skeleton-shimmer" />
            <div className="h-3 w-56 rounded skeleton-shimmer" />
          </div>
        ))}
      </Card>
    </div>
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Seller command center</p>
          <h1 className="text-2xl font-heading font-bold">{vendor.business_name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Stay ahead of orders, sourcing opportunities, and inventory.</p>
        </div>
        <Button asChild className="min-h-11"><Link to="/vendor/inventory/new"><Plus className="w-4 h-4" /> Add Product</Link></Button>
      </header>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Metric label="Needs confirmation" value={summary.confirm.length} icon={ClipboardCheck} />
        <Metric label="Preparing orders" value={summary.preparing.length} icon={Package} />
        <Metric label="New RFQ opportunities" value={data.rfqs.length} icon={FileText} />
        <Metric label="Low inventory" value={summary.low.length} icon={AlertTriangle} />
      </section>

      <section>
        <h2 className="font-heading font-bold text-lg mb-3">Needs your attention</h2>
        <Card className="divide-y">
          <div className="p-4"><p className="text-sm font-medium">{attention.length ? "Actionable work, based on your current Tree Marketplace records." : "No orders need your attention."}</p></div>
          {attention.map((item) => (
            <Link key={item.id} to={item.to} className="flex items-center gap-3 p-4 hover:bg-secondary/50">
              <item.icon className="w-5 h-5 text-primary" />
              <span className="flex-1">
                <span className="block text-sm font-semibold">{item.label}</span>
                <span className="block text-xs text-muted-foreground">{item.detail}</span>
              </span>
            </Link>
          ))}
        </Card>
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        <List title="Recent Orders" link="/vendor/orders" items={data.orders.slice(0, 4)} render={(o) => (<><b>{o.order_number}</b><span>{shortDate(o.created_date)} · {o.order_status.replaceAll("_", " ")}</span></>)} empty="No orders yet." />
        <List title="Recent RFQ Opportunities" link="/vendor/rfqs" items={data.rfqs.slice(0, 4)} render={(r) => (<><b>{r.delivery_city}, {r.delivery_state}</b><span>{(r.items || []).length} requested items · due {r.quote_deadline ? shortDate(r.quote_deadline) : "not set"}</span></>)} empty="No open requests right now. New sourcing opportunities will appear here." />
        <List title="Inventory Alerts" link="/vendor/inventory" items={summary.low.slice(0, 4)} render={(p) => (<><b>{p.common_name}</b><span>{formatNumber(p.quantity_available)} currently available</span></>)} empty="No low-stock listings." />
        <List title="Recent Listings" link="/vendor/inventory" items={data.products.slice(0, 4)} render={(p) => (<><b>{p.common_name}</b><span>{formatNumber(p.quantity_available)} available · ${p.unit_price}</span></>)} empty="Your inventory is empty. Add your first product to start showing buyers what you grow." />
      </section>

      <Card className="p-4 flex flex-wrap items-center gap-3">
        <Sparkles className="w-5 h-5 text-primary" />
        <p className="text-sm flex-1">Ask Tree Marketplace Assistant about your seller work.</p>
        {["What needs my attention?", "Which RFQs match my inventory?", "Show low-stock products."].map((prompt) => (
          <Button key={prompt} variant="outline" size="sm" onClick={() => window.dispatchEvent(new CustomEvent("trebay-ai-open", { detail: { prompt } }))}>{prompt}</Button>
        ))}
      </Card>
    </div>
  );
}

function Metric({ label, value, icon: Icon }) {
  return (
    <Card className="p-4">
      <Icon className="w-5 h-5 text-primary" />
      <p className="mt-3 text-2xl font-heading font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </Card>
  );
}

function List({ title, link, items, render, empty }) {
  return (
    <Card className="p-4">
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-semibold">{title}</h2>
        <Link className="text-xs font-medium text-primary" to={link}>View all</Link>
      </div>
      {items.length ? (
        <div className="space-y-2">
          {items.map((item) => <div key={item.id} className="rounded-lg bg-secondary/50 px-3 py-2 text-sm">{render(item)}</div>)}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground py-4">{empty}</p>
      )}
    </Card>
  );
}