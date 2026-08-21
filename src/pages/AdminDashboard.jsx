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
import { ShieldAlert, Users, Store, Package, Flag, ShoppingCart, FileText, CheckCircle2, XCircle, Loader2, BarChart3, FlaskConical, Truck, Bug } from "lucide-react";
import TestSimulator from "@/components/admin/TestSimulator";
import AdminFinancials from "@/components/admin/AdminFinancials";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import { REPORT_REASONS, VERIFICATION_LABELS, shortDate, formatCurrency, apiError } from "@/lib/treebay";
import { seedDemoData } from "@/lib/seed";

export default function AdminDashboard() {
  const { toast } = useToast();
  const { user } = useAppUser();
  const [tab, setTab] = useState("overview");
  const [vendors, setVendors] = useState([]);
  const [products, setProducts] = useState([]);
  const [reports, setReports] = useState([]);
  const [appIssues, setAppIssues] = useState([]);
  const [orders, setOrders] = useState([]);
  const [rfqs, setRfqs] = useState([]);
  const [users, setUsers] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [carriers, setCarriers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  const seed = async () => { setSeeding(true); try { const r = await seedDemoData(); toast({ title: r.ok ? "Demo data loaded" : "Already seeded" }); load(); } catch { toast({ title: "Failed", variant: "destructive" }); } finally { setSeeding(false); } };
  const [runningMaint, setRunningMaint] = useState(false);
  const runMaintenance = async () => { setRunningMaint(true); try { const { data } = await base44.functions.invoke("runTransactionMaintenance", {}); toast({ title: "Maintenance complete", description: `Released: ${data.released}, Reminders: ${data.reminders}, Escalated: ${data.escalated}, Completed: ${data.completed}, Settled: ${data.settled}` }); load(); } catch (e) { toast({ title: "Maintenance failed", description: apiError(e), variant: "destructive" }); } finally { setRunningMaint(false); } };
  const generateDocs = async (orderId) => { try { for (const dt of ["buyer_order_confirmation", "buyer_invoice", "buyer_receipt", "vendor_purchase_order", "vendor_settlement_statement", "delivery_manifest"]) { await base44.functions.invoke("generateTransactionDocument", { orderId, documentType: dt }); } toast({ title: "Documents generated" }); } catch (e) { toast({ title: "Failed", description: apiError(e), variant: "destructive" }); } };

  const load = async () => {
    setLoading(true);
    try {
      const [v, p, r, o, rfq, exc, carr, issues] = await Promise.all([
        base44.entities.VendorProfile.list("-created_date", 100),
        base44.entities.Product.list("-created_date", 100),
        base44.entities.ContentReport.filter({ status: "open" }, "-created_date", 50),
        base44.entities.Order.list("-created_date", 50),
        base44.entities.RFQ.list("-created_date", 50),
        base44.entities.SystemException.filter({ requires_admin: true }, "-created_date", 50),
        base44.entities.CarrierProfile.list("-created_date", 100),
        base44.entities.CrashReport.list("-created_date", 100),
      ]);
      setVendors(v || []); setProducts(p || []); setReports(r || []); setAppIssues((issues || []).filter((issue) => issue.status !== "resolved" && issue.status !== "dismissed")); setOrders(o || []); setRfqs(rfq || []); setExceptions((exc || []).filter((e) => e.status !== "RESOLVED" && e.status !== "CLOSED")); setCarriers(carr || []);
      try { setUsers(await base44.entities.User.list() || []); } catch {}
    } catch {}
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  if (user && user.role !== "admin") return <Navigate to="/" replace />;
  if (!user) return <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;

  const setVerification = async (id, status) => { try { await base44.entities.VendorProfile.update(id, { verification_status: status }); load(); toast({ title: `Vendor ${VERIFICATION_LABELS[status]}` }); } catch { toast({ title: "Failed", variant: "destructive" }); } };
  const setSellingStatus = async (id, status) => { try { await base44.entities.VendorProfile.update(id, { selling_status: status }); load(); toast({ title: `Seller ${status}` }); } catch { toast({ title: "Failed", variant: "destructive" }); } };
  const setCarrierVerification = async (id, status) => { try { await base44.entities.CarrierProfile.update(id, { verification_status: status }); load(); toast({ title: `Carrier ${VERIFICATION_LABELS[status]}` }); } catch { toast({ title: "Failed", variant: "destructive" }); } };
  const setListingStatus = async (id, status) => { try { await base44.entities.Product.update(id, { listing_status: status }); load(); toast({ title: `Listing ${status}` }); } catch {} };
  const resolveReport = async (id, resolution) => { try { await base44.entities.ContentReport.update(id, { status: "actioned", resolution }); load(); toast({ title: "Report resolved" }); } catch {} };
  const dismissReport = async (id) => { try { await base44.entities.ContentReport.update(id, { status: "dismissed" }); load(); } catch {} };
  const updateAppIssue = async (id, status) => {
    try {
      await base44.entities.CrashReport.update(id, {
        status,
        resolution: status === "resolved" ? "Reviewed and resolved from the TreEbay admin issue inbox." : "Marked in progress from the TreEbay admin issue inbox.",
      });
      load();
      toast({ title: status === "resolved" ? "Issue resolved" : "Issue marked in progress" });
    } catch (e) {
      toast({ title: "Could not update issue", description: apiError(e), variant: "destructive" });
    }
  };

  const pendingVendors = vendors.filter((v) => v.verification_status === "pending");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-primary" />
          <div><h1 className="text-xl font-bold">Admin console</h1><p className="text-sm text-muted-foreground">Marketplace oversight & moderation.</p></div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={runMaintenance} disabled={runningMaint}>{runningMaint ? "Running…" : "Run maintenance"}</Button>
          <Button variant="outline" size="sm" onClick={seed} disabled={seeding}>{seeding ? "Loading…" : "Seed demo data"}</Button>
        </div>
      </div>

      {loading ? <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div> : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="overview"><BarChart3 className="w-4 h-4 mr-1" /> Overview</TabsTrigger>
            <TabsTrigger value="exceptions"><ShieldAlert className="w-4 h-4 mr-1" /> Exceptions {exceptions.length > 0 && <span className="ml-1 px-1.5 rounded-full bg-rose-500 text-white text-[10px]">{exceptions.length}</span>}</TabsTrigger>
            <TabsTrigger value="vendors"><Store className="w-4 h-4 mr-1" /> Vendors {pendingVendors.length > 0 && <span className="ml-1 px-1.5 rounded-full bg-amber-500 text-white text-[10px]">{pendingVendors.length}</span>}</TabsTrigger>
            <TabsTrigger value="listings"><Package className="w-4 h-4 mr-1" /> Listings</TabsTrigger>
            <TabsTrigger value="issues"><Bug className="w-4 h-4 mr-1" /> App Issues {appIssues.length > 0 && <span className="ml-1 px-1.5 rounded-full bg-amber-500 text-white text-[10px]">{appIssues.length}</span>}</TabsTrigger>
            <TabsTrigger value="reports"><Flag className="w-4 h-4 mr-1" /> Content Reports {reports.length > 0 && <span className="ml-1 px-1.5 rounded-full bg-rose-500 text-white text-[10px]">{reports.length}</span>}</TabsTrigger>
            <TabsTrigger value="orders"><ShoppingCart className="w-4 h-4 mr-1" /> Orders</TabsTrigger>
            <TabsTrigger value="rfqs"><FileText className="w-4 h-4 mr-1" /> RFQs</TabsTrigger>
            <TabsTrigger value="users"><Users className="w-4 h-4 mr-1" /> Users</TabsTrigger>
            <TabsTrigger value="financials"><BarChart3 className="w-4 h-4 mr-1" /> Financials</TabsTrigger>
            <TabsTrigger value="carriers"><Truck className="w-4 h-4 mr-1" /> Carriers</TabsTrigger>
            <TabsTrigger value="simulator"><FlaskConical className="w-4 h-4 mr-1" /> Simulator</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {exceptions.length > 0 && (
              <Card className="p-4 border-rose-200 bg-rose-50">
                <div className="flex items-center justify-between">
                  <div><p className="text-sm font-semibold text-rose-800">COMMERCE EXCEPTIONS</p><p className="text-3xl font-bold text-rose-800">{exceptions.length}</p></div>
                  <Button size="sm" onClick={() => setTab("exceptions")}>Review Exceptions</Button>
                </div>
              </Card>
            )}
            {appIssues.length > 0 && (
              <Card className="p-4 border-amber-200 bg-amber-50">
                <div className="flex items-center justify-between gap-3">
                  <div><p className="text-sm font-semibold text-amber-900">USER & APP ISSUES</p><p className="text-3xl font-bold text-amber-900">{appIssues.length}</p></div>
                  <Button size="sm" variant="outline" onClick={() => setTab("issues")}>Open Issue Inbox</Button>
                </div>
              </Card>
            )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat icon={ShoppingCart} label="LIVE orders today" value={orders.filter((o) => o.commerce_mode === "live" && shortDate(o.created_date) === shortDate(new Date())).length} />
              <Stat icon={BarChart3} label="LIVE gross volume" value={formatCurrency(orders.filter((o) => o.commerce_mode === "live").reduce((s, o) => s + (o.total || 0), 0))} />
              <Stat icon={Store} label="Vendors" value={vendors.length} />
              <Stat icon={Package} label="Listings" value={products.length} />
            </div>
            <Card className="p-4">
              <h2 className="font-semibold mb-2">System health</h2>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <HealthRow label="Marketplace" status="Operational" />
                <HealthRow label="Payments" status="Test Mode" />
                <HealthRow label="Tax calculation" status="Test/Estimated" />
                <HealthRow label="Delivery pricing" status="Test Estimates Available" />
                <HealthRow label="Real carrier integration" status="Not Configured" />
                <HealthRow label="Document generation" status="Operational / Test" />
                <HealthRow label="Notifications" status="Operational" />
              </div>
            </Card>
            {pendingVendors.length > 0 && (
              <Card className="p-4">
                <h2 className="font-semibold mb-1">Pending TreEbay trust verifications</h2>
                <p className="text-xs text-muted-foreground mb-2">Seller accounts activate automatically. Verification only controls the public trust badge; suspend selling only for an exception.</p>
                <div className="space-y-2">{pendingVendors.map((v) => (
                  <div key={v.id} className="flex items-center justify-between p-2 rounded-lg bg-amber-50">
                    <div><p className="font-medium text-sm">{v.business_name}</p><p className="text-xs text-muted-foreground">{v.city}, {v.state} · Selling {(v.selling_status || "active")}</p></div>
                    <div className="flex gap-1">
                      <Button size="sm" onClick={() => setVerification(v.id, "verified")}><CheckCircle2 className="w-4 h-4 mr-1" /> Mark Verified</Button>
                      <Button size="sm" variant="outline" onClick={() => setSellingStatus(v.id, "suspended")}><XCircle className="w-4 h-4 mr-1" /> Suspend Selling</Button>
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
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <StatusBadge status={v.verification_status} label={VERIFICATION_LABELS[v.verification_status]} />
                    <StatusBadge status={v.selling_status || "active"} label={`Selling ${v.selling_status || "active"}`} />
                    <Select value={v.verification_status === "suspended" ? "pending" : v.verification_status} onValueChange={(s) => setVerification(v.id, s)}>
                      <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="pending">Badge pending</SelectItem><SelectItem value="verified">Verified badge</SelectItem></SelectContent>
                    </Select>
                    <Select value={v.selling_status || "active"} onValueChange={(s) => setSellingStatus(v.id, s)}>
                      <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="active">Selling active</SelectItem><SelectItem value="restricted">Restricted</SelectItem><SelectItem value="suspended">Suspended</SelectItem></SelectContent>
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

          <TabsContent value="issues">
            {appIssues.length === 0 ? <EmptyState icon={Bug} title="No open app issues" description="Automatic errors and user-submitted usability reports will appear here." /> : (
              <div className="space-y-3">{appIssues.map((issue) => (
                <Card key={issue.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className="capitalize">{(issue.report_type || "manual bug").replace(/_/g, " ")}</Badge>
                        <Badge variant={issue.impact === "blocked" ? "destructive" : "secondary"} className="capitalize">{(issue.impact || "unknown").replace(/_/g, " ")}</Badge>
                      </div>
                      <p className="font-semibold text-sm mt-2">{issue.message || "App issue"}</p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{shortDate(issue.created_date)}</span>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{issue.details || "No description was included."}</p>
                  {issue.expected_behavior && <div className="rounded-lg bg-secondary/60 p-3 text-sm"><span className="font-semibold">Expected:</span> {issue.expected_behavior}</div>}
                  <p className="text-xs text-muted-foreground break-all">Screen: {issue.route || "Unknown"}</p>
                  {(issue.stack || issue.component_stack) && (
                    <details className="text-xs text-muted-foreground">
                      <summary className="cursor-pointer font-medium">Technical details</summary>
                      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3">{issue.stack || issue.component_stack}</pre>
                    </details>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => updateAppIssue(issue.id, "in_progress")}>Mark in progress</Button>
                    <Button size="sm" onClick={() => updateAppIssue(issue.id, "resolved")}><CheckCircle2 className="w-4 h-4" /> Resolve</Button>
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
                <Card key={o.id} className="p-3 space-y-2">
                  <Link to={`/orders/${o.id}`}><div className="flex justify-between"><div><p className="font-medium text-sm">{o.order_number}</p><p className="text-xs text-muted-foreground">{o.vendor_name} · {shortDate(o.created_date)}</p></div><div className="text-right"><p className="font-semibold text-sm">{formatCurrency(o.total)}</p><StatusBadge status={o.order_status} /></div></div></Link>
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => generateDocs(o.id)}>Generate all documents</Button>
                </Card>
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

          <TabsContent value="financials">
            <AdminFinancials />
          </TabsContent>

          <TabsContent value="carriers">
            {carriers.length === 0 ? <EmptyState icon={Truck} title="No carriers" /> : (
              <div className="space-y-2">{carriers.map((c) => (
                <Card key={c.id} className="p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0"><p className="font-medium text-sm truncate">{c.business_name}</p><p className="text-xs text-muted-foreground">{c.city}, {c.state} · {c.contact_name}</p></div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={c.verification_status} label={VERIFICATION_LABELS[c.verification_status]} />
                    <Select value={c.verification_status} onValueChange={(s) => setCarrierVerification(c.id, s)}>
                      <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="verified">Verify</SelectItem><SelectItem value="suspended">Suspend</SelectItem></SelectContent>
                    </Select>
                  </div>
                </Card>
              ))}</div>
            )}
          </TabsContent>

          <TabsContent value="simulator">
            <TestSimulator orders={orders} onChanged={load} />
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