import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardCheck, FileText, Package, Plus, Sparkles, Truck } from "lucide-react";
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
    confirm: data.orders.filter((order) => ["payment_confirmed", "inventory_reserved"].includes(order.order_status)),
    preparing: data.orders.filter((order) => ["vendor_confirmed", "preparing", "ready_for_pickup", "delivery_assigned"].includes(order.order_status)),
    low: data.products.filter((product) => product.quantity_available > 0 && product.quantity_available <= 5),
  }), [data]);

  const attention = [
    ...summary.confirm.map((order) => ({ id: order.id, label: "Confirm order " + order.order_number, detail: "Buyer payment is confirmed.", to: "/orders/" + order.id, icon: ClipboardCheck })),
    ...summary.preparing.map((order) => ({ id: order.id, label: "Prepare order " + order.order_number, detail: "Next: " + order.order_status.replaceAll("_", " ") + ".", to: "/orders/" + order.id, icon: Truck })),
    ...summary.low.map((product) => ({ id: product.id, label: "Low stock: " + product.common_name, detail: formatNumber(product.quantity_available) + " currently available.", to: "/vendor/inventory/" + product.id, icon: AlertTriangle })),
  ].slice(0, 6);

  if (loading) return (
    <div className="space-y-8">
      <div className="space-y-3"><div className="h-3 w-36 rounded skeleton-shimmer" /><div className="h-10 w-72 rounded skeleton-shimmer" /><div className="h-4 w-80 rounded skeleton-shimmer" /></div>
      <div className="grid grid-cols-2 gap-4 rounded-[1.75rem] border border-border/70 bg-card p-6 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => <div key={index} className="space-y-4"><div className="h-5 w-5 rounded skeleton-shimmer" /><div className="h-8 w-14 rounded skeleton-shimmer" /><div className="h-3 w-28 rounded skeleton-shimmer" /></div>)}
      </div>
      <div className="h-72 rounded-[1.75rem] skeleton-shimmer" />
    </div>
  );

  return (
    <div className="space-y-8 md:space-y-10">
      <header className="flex flex-col justify-between gap-5 border-b border-border/70 pb-7 sm:flex-row sm:items-end">
        <div>
          <p className="editorial-kicker">Seller workspace</p>
          <h1 className="mt-3 font-display text-4xl font-semibold leading-none md:text-5xl">{vendor.business_name}</h1>
          <p className="mt-4 text-sm text-muted-foreground">A clear view of your inventory, opportunities, and orders.</p>
        </div>
        <Button asChild className="h-12 rounded-full px-6"><Link to="/vendor/inventory/new"><Plus className="h-4 w-4" /> Add inventory</Link></Button>
      </header>

      <section className="grid grid-cols-2 overflow-hidden rounded-[1.75rem] border border-border/70 bg-card lg:grid-cols-4">
        <Metric label="Needs confirmation" value={summary.confirm.length} icon={ClipboardCheck} to="/vendor/orders" />
        <Metric label="Preparing orders" value={summary.preparing.length} icon={Package} to="/vendor/orders" />
        <Metric label="Open RFQ opportunities" value={data.rfqs.length} icon={FileText} to="/vendor/rfqs" />
        <Metric label="Low-stock listings" value={summary.low.length} icon={AlertTriangle} to="/vendor/inventory" />
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.4fr_.6fr]">
        <div className="overflow-hidden rounded-[1.75rem] border border-border/70 bg-card">
          <div className="flex items-center justify-between border-b border-border/70 px-6 py-5">
            <div><h2 className="text-lg font-bold">Your next actions</h2><p className="mt-1 text-xs text-muted-foreground">Only the work that needs you now.</p></div>
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-bold text-primary">{attention.length}</span>
          </div>
          {attention.length ? (
            <div className="divide-y divide-border/60">
              {attention.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.id} to={item.to} className="group flex items-center gap-4 px-6 py-5 transition hover:bg-secondary/35">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary"><Icon className="h-4 w-4 text-primary" /></span>
                    <span className="flex-1"><span className="block text-sm font-semibold">{item.label}</span><span className="mt-1 block text-xs text-muted-foreground">{item.detail}</span></span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-[230px] flex-col items-center justify-center px-6 py-10 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary"><CheckCircle2 className="h-6 w-6 text-primary" /></span>
              <h3 className="mt-4 font-display text-3xl font-semibold">You’re clear for now.</h3>
              <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">New orders and inventory alerts will appear here. In the meantime, keep your availability current.</p>
            </div>
          )}
        </div>

        <div className="relative overflow-hidden rounded-[1.75rem] bg-[#10251a] p-7 text-white">
          <img src="/marketplace/category-trees.webp" alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#10251a] via-[#10251a]/70 to-[#10251a]/30" />
          <div className="relative flex h-full flex-col justify-end">
            <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#bfd3ad]">Keep your storefront ready</p>
            <h2 className="mt-4 font-display text-3xl font-semibold leading-none">Fresh availability.<br />Better opportunities.</h2>
            <p className="mt-4 text-sm leading-6 text-white/65">Accurate quantities, photos, and pricing make it easier for buyers to choose your nursery.</p>
            <Button variant="secondary" className="mt-6 w-fit rounded-full bg-[#dce9c9] text-[#173522] hover:bg-white" asChild><Link to="/vendor/inventory">Manage inventory <ArrowRight className="h-4 w-4" /></Link></Button>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <List title="Recent orders" link="/vendor/orders" items={data.orders.slice(0, 4)} render={(order) => (<><b>{order.order_number}</b><span>{shortDate(order.created_date)} · {order.order_status.replaceAll("_", " ")}</span></>)} empty="Your next order will appear here." />
        <List title="Sourcing opportunities" link="/vendor/rfqs" items={data.rfqs.slice(0, 4)} render={(rfq) => (<><b>{rfq.delivery_city}, {rfq.delivery_state}</b><span>{(rfq.items || []).length} requested items · due {rfq.quote_deadline ? shortDate(rfq.quote_deadline) : "not set"}</span></>)} empty="No open requests right now. New opportunities will appear here." />
        <List title="Inventory alerts" link="/vendor/inventory" items={summary.low.slice(0, 4)} render={(product) => (<><b>{product.common_name}</b><span>{formatNumber(product.quantity_available)} currently available</span></>)} empty="No low-stock listings need attention." />
        <List title="Recently listed" link="/vendor/inventory" items={data.products.slice(0, 4)} render={(product) => (<><b>{product.common_name}</b><span>{formatNumber(product.quantity_available)} available · $ {product.unit_price}</span></>)} empty="Add your first product to show buyers what you grow." />
      </section>

      <div className="flex flex-col justify-between gap-4 border-t border-border/70 pt-6 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3"><Sparkles className="h-5 w-5 text-primary" /><p className="text-sm text-muted-foreground">Need help prioritizing your seller work?</p></div>
        <Button variant="outline" className="rounded-full bg-card" onClick={() => window.dispatchEvent(new CustomEvent("trebay-ai-open", { detail: { prompt: "What needs my attention?" } }))}>Open seller assistant <ArrowRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

function Metric({ label, value, icon: Icon, to }) {
  return (
    <Link to={to} className="group border-b border-r border-border/65 p-5 transition hover:bg-secondary/30 sm:p-6 lg:border-b-0">
      <div className="flex items-center justify-between"><Icon className="h-5 w-5 text-primary/65" /><ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition group-hover:opacity-100" /></div>
      <p className="mt-5 font-heading text-4xl font-bold tracking-tight">{value}</p>
      <p className="mt-2 text-xs text-muted-foreground">{label}</p>
    </Link>
  );
}

function List({ title, link, items, render, empty }) {
  return (
    <div className="overflow-hidden rounded-[1.75rem] border border-border/70 bg-card">
      <div className="flex items-center justify-between border-b border-border/60 px-6 py-5"><h2 className="font-bold">{title}</h2><Link className="inline-flex items-center gap-1 text-xs font-semibold text-primary" to={link}>View all <ArrowRight className="h-3.5 w-3.5" /></Link></div>
      {items.length ? (
        <div className="divide-y divide-border/55">
          {items.map((item) => <div key={item.id} className="px-6 py-4 text-sm [&>b]:block [&>b]:font-semibold [&>span]:mt-1 [&>span]:block [&>span]:text-xs [&>span]:text-muted-foreground">{render(item)}</div>)}
        </div>
      ) : (
        <p className="px-6 py-8 text-sm leading-6 text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}
