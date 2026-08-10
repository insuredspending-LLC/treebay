import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { useAppUser } from "@/hooks/useAppUser";
import { ShieldAlert, Users, Store, Package, Flag, ShoppingCart, FileText, CheckCircle2, XCircle, Loader2, BarChart3 } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import { REPORT_REASONS, VERIFICATION_LABELS, shortDate, formatCurrency } from "@/lib/treebay";
import { seedDemoData } from "@/lib/seed";

export default function AdminDashboard() {
  const { toast } = useToast();
  const { user } = useAppUser();
  const [tab, setTab] = useState("overview");
  const [vendors, setVendors] = useState([]);
  const [products, setProducts] = useState([]);
  const [reports, setReports] = useState([]);
  const [orders, setOrders] = useState([]);
  const [rfqs, setRfqs] = useState([]);
  const [users, setUsers] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  const seed = async () => { setSeeding(true); try { const r = await seedDemoData(); toast({ title: r.ok ? "Demo data loaded" : "Already seeded" }); load(); } catch (e) { toast({ title: "Failed", variant: "destructive" }); } finally { setSeeding(false); } };

  const load = async () => {
    setLoading(true);
    try {
      const [v, p, r, o, rfq, exc] = await Promise.all([
        base44.entities.VendorProfile.list("-created_date", 100),
        base44.entities.Product.list("-created_date", 100),
        base44.entities.ContentReport.filter({ status: "open" }, "-created_date", 50),
        base44.entities.Order.list("-created_date", 50),
        base44.entities.RFQ.list("-created_date", 50),
        base44.entities.SystemException.filter({ status: "OPEN" }, "-created_date", 50),
      ]);
      setVendors(v || []); setProducts(p || []); setReports(r || []); setOrders(o || []); setRfqs(rfq || []); setExceptions(exc || []);
      try { setUsers(await base44.entities.User.list() || []); } catch {}
    } catch {}
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  if (user && user.role !== "admin") return <Navigate to="/" replace />;
  if (!user) return <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;

  const setVerification = async (id, status) => { try { await base44.entities.VendorProfile.update(id, { verification_status: status }); load(); toast({ title: `Vendor ${VERIFICATION_LABELS[status]}` }); } catch (e) { toast({ title: "Failed", variant: "destructive" }); } };
  const setListingStatus = async (id, status) => { try { await base44.entities.Product.update(id, { listing_status: status }); load(); toast({ title: `Listing ${status}` }); } catch {} };
  const resolveReport = async (id, resolution) => { try { await base44.entities.ContentReport.update(id, { status: "actioned", resolution }); load(); toast({ title: "Report resolved" }); } catch {} };
  const dismissReport = async (id) => { try { await base44.entities.ContentReport.update(id, { status: "dismissed" }); load(); } catch {} };

  const pendingVendors = vendors.filter((v) => v.verification_status === "pending");
  const totalSales = orders.filter((o) => o.payment_status === "paid").reduce((s, o) => s + (o.total || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-primary" />
          <div><h1 className="text-xl font-bold">Admin console</h1><p className="text-sm text-muted-foreground">Marketplace oversight & moderation.</p></div>
        </div>
        <Button variant="outline" size="sm" onClick={seed} disabled={seeding}>{seeding ? "Loading…" : "Seed demo data"}</Button>
      </div>

      {loading ? <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div> : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="overview"><BarChart3 className="w-4 h-4 mr-1" /> Overview</TabsTrigger>
            <TabsTrigger value="exceptions"><ShieldAlert className="w-4 h-4 mr-1" /> Exceptions {exceptions.length > 0 && <span className="ml-1 px-1.5 rounded-full bg-rose-500 text-white text-[10px]">{exceptions.length}</span>}</TabsTrigger>
            <TabsTrigger value="vendors"><Store className="w-4 h-4 mr-1" /> Vendors {pendingVendors.length > 0 && <span className="ml-1 px-1.5 rounded-full bg-amber-500 text-white text-[10px]">{pendingVendors.length}</span>}</TabsTrigger>
            <TabsTrigger value="listings"><Package className="w-4 h-4 mr-1" /> Listings</TabsTrigger>
            <TabsTrigger value="reports"><Flag className="w-4 h-4 mr-1" /> Reports {reports.length > 0 && <span className="ml-1 px-1.5 rounded-full bg-rose-500 text-white text-[10px]">{reports.length}</span>}</TabsTrigger>
            <TabsTrigger value="orders"><ShoppingCart className="w-4 h-4 mr-1" /> Orders</TabsTrigger>
            <TabsTrigger value="rfqs"><FileText className="w-4 h-4 mr-1" /> RFQs</TabsTrigger>
            <TabsTrigger value="users"><Users className="w-4 h-4 mr-1" /> Users</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {exceptions.length > 0 && (
              <Card className="p-4 border-rose-200 bg-rose-50">
                <div className="flex items-center justify-between">
                  <div><p className="text-sm font-semibold text-rose-800">REQUIRES YOUR ATTENTION</p><p className="text-3xl font-bold text-rose-800">{exceptions.length}</p></div>
                  <Button size="sm" onClick={() => setTab("exceptions")}>Review Exceptions</Button>
                </div>
              </Card>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat icon={ShoppingCart} label="Orders today" value={orders.filter((o) => shortDate(o.created_date) === shortDate(new Date())).length} />
              <Stat icon={BarChart3} label="Gross volume" value={formatCurrency(orders.reduce((s, o) => s + (o.total || 0), 0))} />
              <Stat icon={Store} label="Vendors" value={vendors.length} />
              <Stat icon={Package} label="Listings" value={products.length} />
            </div>
            <Card className="p-4">
              <h2 className="font-semibold mb-2">System health</h2>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <HealthRow label="Marketplace" status="Operational" />
                <HealthRow label="Payments" status="Test Mode" />
                <HealthRow label="Tax calculation" status="Test/Estimated" />
                <HealthRow label="Delivery quoting" status="Not Configured" />
                <HealthRow label="Document generation" status="Not Configured" />
                <HealthRow label="Notifications" status="Operational" />
              </div>
            </Card>
            {pendingVendors.length > 0 && (
              <Card className="p-4">
                <h2 className="font-semibold mb-2">Pending vendor verifications</h2>
                <div className="space-y-2">{pendingVendors.map((v) => (
                  <div key={v.id} className="flex items-center justify-between p-2 rounded-lg bg-amber-50">
                    <div><p className="font-medium text-sm">{v.business_name}</p><p className="text-xs text-muted-foreground">{v.city}, {v.state}</p></div>
                    <div className="flex gap-1">
                      <Button size="sm" onClick={() => setVerification(v.id, "verified")}><CheckCircle2 className="w-4 h-4 mr-1" /> Verify</Button>
                      <Button size="sm" variant="outline" onClick={() => setVerification(v.id, "suspended")}><XCircle className="w-4 h-4 mr-1" /> Suspend</Button>
                    </div>
                  </div>
                ))}</div>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="exceptions">
            {exceptions.length === 0 ? <EmptyState icon={ShieldAlert} title="No open exceptions" description="The marketplace is operating normally. Autonomously resolved exceptions do not appear here." /> : (
              <div className="space-y-2">{exceptions.map((e) => (
                <Link key={e.id} to={`/admin/exceptions/${e.id}`}><Card className="p-3 flex justify-between"><div><p className="font-medium text-sm capitalize">{(e.exception_type || "").replace(/_/g, " ")}</p><p className="text-xs text-muted-foreground">{e.reason}</p></div><div className="text-right"><StatusBadge status={(e.severity || "").toLowerCase()} /><p className="text-xs text-muted-foreground mt-1">{shortDate(e.created_date)}</p></div></Card></Link>
              ))}</div>
            )}
          </TabsContent>

          <TabsContent value="vendors">
            {vendors.length === 0 ? <EmptyState icon={Store} title="No vendors" /> : (
              <div className="space-y-2">{vendors.map((v) => (
                <Card key={v.id} className="p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0"><p className="font-medium text-sm truncate">{v.business_name}</p><p className="text-xs text-muted-foreground">{v.city}, {v.state} · {v.contact_name}</p></div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={v.verification_status} label={VERIFICATION_LABELS[v.verification_status]} />
                    <Select value={v.verification_status} onValueChange={(s) => setVerification(v.id, s)}>
                      <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="verified">Verify</SelectItem><SelectItem value="suspended">Suspend</SelectItem></SelectContent>
                    </Select>
                    <Button asChild variant="ghost" size="sm"><Link to={`/vendor/${v.id}`}>View</Link></Button>
                  </div>
                </Card>
              ))}</div>
            )}
          </TabsContent>

          <TabsContent value="listings">
            {products.length === 0 ? <EmptyState icon={Package} title="No listings" /> : (
              <div className="space-y-2">{products.map((p) => (
                <Card key={p.id} className="p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0"><p className="font-medium text-sm truncate">{p.common_name}</p><p className="text-xs text-muted-foreground">{p.vendor_name} · {formatCurrency(p.unit_price)}</p></div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={p.listing_status} />
                    <Select value={p.listing_status} onValueChange={(s) => setListingStatus(p.id, s)}>
                      <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="paused">Pause</SelectItem><SelectItem value="sold_out">Sold out</SelectItem><SelectItem value="archived">Archive</SelectItem></SelectContent>
                    </Select>
                    <Button asChild variant="ghost" size="sm"><Link to={`/product/${p.id}`}>View</Link></Button>
                  </div>
                </Card>
              ))}</div>
            )}
          </TabsContent>

          <TabsContent value="reports">
            {reports.length === 0 ? <EmptyState icon={Flag} title="No open reports" description="Reported content will queue here for review." /> : (
              <div className="space-y-2">{reports.map((r) => (
                <Card key={r.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="capitalize">{r.target_type}</Badge>
                    <span className="text-xs text-muted-foreground">{shortDate(r.created_date)}</span>
                  </div>
                  <p className="text-sm font-medium">{REPORT_REASONS.find((x) => x.value === r.reason)?.label || r.reason}</p>
                  {r.details && <p className="text-sm text-muted-foreground">{r.details}</p>}
                  <p className="text-xs text-muted-foreground">Target ID: {r.target_id}</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => dismissReport(r.id)}>Dismiss</Button>
                    <Button size="sm" onClick={() => resolveReport(r.id, "content_removed")}>Mark actioned</Button>
                  </div>
                </Card>
              ))}</div>
            )}
          </TabsContent>

          <TabsContent value="orders">
            {orders.length === 0 ? <EmptyState icon={ShoppingCart} title="No orders" /> : (
              <div className="space-y-2">{orders.map((o) => (
                <Link key={o.id} to={`/orders/${o.id}`}><Card className="p-3 flex justify-between"><div><p className="font-medium text-sm">{o.order_number}</p><p className="text-xs text-muted-foreground">{o.vendor_name} · {shortDate(o.created_date)}</p></div><div className="text-right"><p className="font-semibold text-sm">{formatCurrency(o.total)}</p><StatusBadge status={o.order_status} /></div></Card></Link>
              ))}</div>
            )}
          </TabsContent>

          <TabsContent value="rfqs">
            {rfqs.length === 0 ? <EmptyState icon={FileText} title="No RFQs" /> : (
              <div className="space-y-2">{rfqs.map((r) => (
                <Link key={r.id} to={`/rfqs/${r.id}`}><Card className="p-3 flex justify-between"><div><p className="font-medium text-sm">{r.delivery_city}, {r.delivery_state}</p><p className="text-xs text-muted-foreground">{(r.items || []).length} lines · {shortDate(r.created_date)}</p></div><StatusBadge status={r.status} /></Card></Link>
              ))}</div>
            )}
          </TabsContent>

          <TabsContent value="users">
            {users.length === 0 ? <EmptyState icon={Users} title="No users" /> : (
              <div className="space-y-2">{users.map((u) => (
                <Card key={u.id} className="p-3 flex justify-between"><div><p className="font-medium text-sm">{u.full_name || u.email}</p><p className="text-xs text-muted-foreground">{u.email}</p></div><Badge>{u.role}</Badge></Card>
              ))}</div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value }) {
  return <Card className="p-4"><Icon className="w-5 h-5 text-primary" /><p className="text-2xl font-bold mt-2">{value}</p><p className="text-xs text-muted-foreground">{label}</p></Card>;
}

function HealthRow({ label, status }) {
  const color = status === "Operational" ? "text-emerald-600" : status === "Test Mode" || status === "Test/Estimated" ? "text-amber-600" : "text-muted-foreground";
  return <div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span className={"font-medium " + color}>{status}</span></div>;
}