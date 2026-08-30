import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAppUser } from "@/hooks/useAppUser";
import { Bell, ShoppingCart, Store, MessageSquare, User, LayoutDashboard, Package, FileText, Truck, Leaf, ChevronLeft, Sparkles, ChevronsUpDown, AlertCircle, CheckCircle2, BarChart3, Shield } from "lucide-react";
import AIAssistant from "@/components/AIAssistant";
import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { relativeTime } from "@/lib/treebay";

const NOTIFICATION_META = {
  order_accepted: { icon: ShoppingCart, label: "Order" },
  order_ready: { icon: Package, label: "Order" },
  order_shipped: { icon: Truck, label: "Order" },
  order_delivered: { icon: CheckCircle2, label: "Order" },
  order_completed: { icon: CheckCircle2, label: "Order" },
  new_order: { icon: ShoppingCart, label: "Order" },
  new_quote: { icon: FileText, label: "RFQ" },
  quote_updated: { icon: FileText, label: "RFQ" },
  quote_accepted: { icon: CheckCircle2, label: "RFQ" },
  new_rfq: { icon: FileText, label: "RFQ" },
  rfq_awarded: { icon: FileText, label: "RFQ" },
  new_message: { icon: MessageSquare, label: "Message" },
  inventory_low: { icon: AlertCircle, label: "Inventory" },
  general: { icon: Bell, label: "System" },
};

function notificationPath(notification) {
  const t = notification.type;
  const refId = notification.reference_id;
  // Message → exact conversation
  if (t === "new_message") return refId ? `/messages/${refId}` : "/messages";
  // Inventory → seller inventory
  if (t === "inventory_low") return "/vendor/inventory";
  // RFQ notifications — routing by meaning, not presentation mode
  // Buyer received a quote on their RFQ
  if (t === "new_quote" || t === "quote_updated") {
    return refId ? `/rfqs/${refId}` : "/rfqs";
  }
  // Seller's quote was accepted / seller received new RFQ / RFQ awarded → seller RFQ experience
  if (t === "quote_accepted" || t === "new_rfq" || t === "rfq_awarded") {
    if (notification.reference_type === "order" && refId) return `/orders/${refId}`;
    return "/vendor/rfqs";
  }
  // Order notifications → Order Detail (both buyer and seller can view)
  if (["new_order", "order_accepted", "order_ready", "order_shipped", "order_delivered", "order_completed"].includes(t)) {
    return refId ? `/orders/${refId}` : "/orders";
  }
  // Fallback to reference_type
  if (notification.reference_type === "order") return `/orders/${refId}`;
  if (notification.reference_type === "rfq") return `/rfqs/${refId}`;
  if (notification.reference_type === "product") return `/product/${refId}`;
  if (notification.reference_type === "conversation") return `/messages/${refId}`;
  return null;
}

function useNotifications() {
  const { user } = useAppUser();
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const location = useLocation();
  const load = async () => {
    if (!user) return;
    try {
      const list = await base44.entities.Notification.list("-created_date", 30);
      setItems(list || []);
      setUnread((list || []).filter((n) => !n.read).length);
    } catch { /* */ }
  };
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [user, location.pathname]);
  const markAllRead = async () => {
    const unread = items.filter((n) => !n.read);
    if (!unread.length) return;
    for (const n of unread) { try { await base44.entities.Notification.update(n.id, { read: true }); } catch {} }
    setItems(items.map((n) => ({ ...n, read: true }))); setUnread(0);
  };
  return { items, unread, markAllRead, load };
}

const DETAIL_HEADERS = [
  { re: /^\/product\/[^/]+/, title: "Listing" },
  { re: /^\/projects\/[^/]+/, title: "Project" },
  { re: /^\/rfqs\/[^/]+/, title: "RFQ" },
  { re: /^\/orders\/[^/]+/, title: "Order" },
  { re: /^\/messages\/[^/]+/, title: "Conversation" },
  { re: /^\/vendor\/inventory\/[^/]+/, title: "Listing" },
  { re: /^\/vendor\/rfqs\/[^/]+/, title: "Quote" },
  { re: /^\/vendor\/[^/]+/, title: "Vendor" },
];

function getHeaderState(pathname) {
  for (const d of DETAIL_HEADERS) if (d.re.test(pathname)) return { isChild: true, title: d.title };
  return { isChild: false, title: "" };
}

const BUYER_NAV = [
  { to: "/marketplace", label: "Marketplace", icon: Store, match: ["/marketplace", "/product", "/vendor", "/home"] },
  { to: "/projects", label: "Quotes", icon: FileText, match: ["/projects", "/rfqs"] },
  { to: "/orders", label: "Orders", icon: ShoppingCart, match: ["/orders"] },
  { to: "/messages", label: "Messages", icon: MessageSquare, match: ["/messages"] },
  { to: "/account", label: "Account", icon: User, match: ["/account", "/profile", "/edit-buyer-profile", "/settings", "/favorites", "/privacy", "/terms", "/community-rules", "/report-problem"] },
];

const VENDOR_NAV = [
  { to: "/vendor", label: "Dashboard", icon: LayoutDashboard, match: ["/vendor"], exact: true },
  { to: "/vendor/inventory", label: "Inventory", icon: Package, match: ["/vendor/inventory"] },
  { to: "/vendor/rfqs", label: "RFQs", icon: FileText, match: ["/vendor/rfqs"] },
  { to: "/vendor/orders", label: "Orders", icon: ShoppingCart, match: ["/vendor/orders", "/orders"] },
  { to: "/account", label: "Account", icon: User, match: ["/account", "/profile", "/edit-buyer-profile", "/settings", "/favorites", "/privacy", "/terms", "/community-rules", "/report-problem"] },
];

const CARRIER_NAV = [
  { to: "/carrier", label: "Dashboard", icon: LayoutDashboard, match: ["/carrier"], exact: true },
  { to: "/carrier/loads", label: "Loads", icon: Truck, match: ["/carrier/loads"] },
  { to: "/carrier/financials", label: "Earnings", icon: BarChart3, match: ["/carrier/financials"] },
  { to: "/account", label: "Account", icon: User, match: ["/account", "/profile", "/edit-buyer-profile", "/settings", "/privacy", "/terms", "/community-rules", "/report-problem"] },
];

const BUYER_DESKTOP_NAV = [
  { to: "/marketplace", label: "Marketplace", match: ["/marketplace", "/product", "/vendor", "/home"] },
  { to: "/projects", label: "Projects & quotes", match: ["/projects", "/rfqs"] },
  { to: "/orders", label: "Orders", match: ["/orders"] },
  { to: "/messages", label: "Messages", match: ["/messages"] },
];

const VENDOR_DESKTOP_NAV = [
  { to: "/vendor", label: "Dashboard", match: ["/vendor"], exact: true },
  { to: "/vendor/inventory", label: "Inventory", match: ["/vendor/inventory"] },
  { to: "/vendor/rfqs", label: "RFQs", match: ["/vendor/rfqs"] },
  { to: "/orders", label: "Orders", match: ["/orders", "/vendor/orders"] },
];

const CARRIER_DESKTOP_NAV = [
  { to: "/carrier", label: "Dashboard", match: ["/carrier"], exact: true },
  { to: "/carrier/loads", label: "Loads", match: ["/carrier/loads"] },
  { to: "/carrier/financials", label: "Financials", match: ["/carrier/financials"] },
];

function isItemActive(pathname, item) {
  const prefixes = item.match || [item.to];
  return prefixes.some((p) => {
    if (p === "/") return pathname === "/";
    if (item.exact) return pathname === p;
    return pathname === p || pathname.startsWith(p + "/");
  });
}

function TopBar() {
  const { user, accountType, vendorProfiles, carrierProfile, switchAccountType } = useAppUser();
  const { items, unread, markAllRead } = useNotifications();
  const navigate = useNavigate();
  const location = useLocation();
  const { isChild, title } = getHeaderState(location.pathname);
  const desktopNav = accountType === "vendor" ? VENDOR_DESKTOP_NAV : accountType === "carrier" ? CARRIER_DESKTOP_NAV : BUYER_DESKTOP_NAV;
  const switchMode = async (type) => {
    const ok = await switchAccountType(type);
    if (!ok) return;
    navigate(type === "vendor" ? "/vendor" : type === "carrier" ? "/carrier" : "/home");
  };

  return (
    <header className="sticky top-0 z-30 bg-card/92 backdrop-blur-xl border-b border-border/65 pt-[env(safe-area-inset-top)]">
      <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 md:h-20 flex items-center justify-between gap-2">
        {/* Left: brand + desktop nav */}
        <div className="flex items-center gap-6 min-w-0">
          {isChild ? (
            <div className="flex items-center gap-1 min-w-0">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back" className="shrink-0 -ml-2"><ChevronLeft className="w-5 h-5" /></Button>
              <span className="font-heading font-bold text-base text-foreground truncate">{title}</span>
            </div>
          ) : (
            <button onClick={() => navigate(accountType === "vendor" ? "/vendor" : accountType === "carrier" ? "/carrier" : "/home")} className="flex items-center gap-2 no-tap-highlight shrink-0">
              <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shadow-sm">
                <Leaf className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-heading font-bold text-base sm:text-lg text-primary tracking-tight">Tree Marketplace</span>
            </button>
          )}
          {!isChild && (
            <nav className="hidden lg:flex items-center gap-1">
              {desktopNav.map((item) => {
                const active = isItemActive(location.pathname, item);
                return (
                  <Link key={item.to} to={item.to} className={cn("px-3 py-2 rounded-full text-[13px] font-semibold no-tap-highlight transition-colors", active ? "bg-secondary/80 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50")}>
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>

        {/* Right: role switch + actions */}
        <div className="flex items-center gap-1 shrink-0">
          {(vendorProfiles?.length > 0 || carrierProfile) && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="mr-1 h-9 gap-1.5 rounded-full border-border/70 bg-card px-3" aria-label="Switch marketplace workspace">
                  <span className="hidden text-xs font-semibold sm:inline">{accountType === "vendor" ? "Seller" : accountType === "carrier" ? "Carrier" : "Buyer"}</span>
                  <ChevronsUpDown className="h-3.5 w-3.5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-48 rounded-2xl p-2">
                <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-[.18em] text-muted-foreground">Switch workspace</p>
                <button onClick={() => switchMode("buyer")} className={cn("w-full rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-secondary/60", accountType === "buyer" && "bg-secondary font-semibold text-primary")}>Buyer marketplace</button>
                {vendorProfiles?.length > 0 && <button onClick={() => switchMode("vendor")} className={cn("w-full rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-secondary/60", accountType === "vendor" && "bg-secondary font-semibold text-primary")}>Seller workspace</button>}
                {carrierProfile && <button onClick={() => switchMode("carrier")} className={cn("w-full rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-secondary/60", accountType === "carrier" && "bg-secondary font-semibold text-primary")}>Carrier workspace</button>}
              </PopoverContent>
            </Popover>
          )}
          <Button variant="ghost" size="icon" className="hidden sm:inline-flex lg:hidden" asChild aria-label="Messages">
            <Link to="/messages"><MessageSquare className="w-5 h-5" /></Link>
          </Button>
          <Button variant="ghost" size="icon" className="hidden lg:inline-flex" onClick={() => window.dispatchEvent(new CustomEvent("trebay-ai-open"))} aria-label="Tree Marketplace Assistant">
            <Sparkles className="w-5 h-5 text-primary" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
                <Bell className="w-5 h-5" />
                {unread > 0 && <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-accent text-[10px] text-white flex items-center justify-center font-bold">{unread}</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <span className="font-semibold text-sm">Notifications</span>
                {unread > 0 && <button onClick={markAllRead} className="text-xs text-primary font-medium">Mark all read</button>}
              </div>
              <ScrollArea className="h-80">
                {items.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">No notifications yet.</div>
                ) : items.map((n) => {
                  const meta = NOTIFICATION_META[n.type] || { icon: Bell, label: "System" };
                  const path = notificationPath(n);
                  const Icon = meta.icon;
                  return (
                    <div key={n.id} className={cn("border-b", !n.read && "bg-secondary/50")}>
                      {path ? (
                        <Link to={path} className="block px-4 py-3 hover:bg-secondary/50">
                          <div className="flex items-start gap-2.5">
                            <Icon className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{meta.label}</p>
                              <p className="text-sm font-medium">{n.title}</p>
                              {n.body && <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>}
                              <p className="text-[10px] text-muted-foreground mt-1">{relativeTime(n.created_date)}</p>
                            </div>
                            {!n.read && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                          </div>
                        </Link>
                      ) : (
                        <div className="px-4 py-3">
                          <div className="flex items-start gap-2.5">
                            <Icon className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{meta.label}</p>
                              <p className="text-sm font-medium">{n.title}</p>
                              {n.body && <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>}
                              <p className="text-[10px] text-muted-foreground mt-1">{relativeTime(n.created_date)}</p>
                            </div>
                            {!n.read && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </ScrollArea>
            </PopoverContent>
          </Popover>
          {user?.role === "admin" && (
            <Button variant="ghost" size="icon" asChild aria-label="Admin console">
              <Link to="/admin"><Shield className="w-5 h-5 text-primary" /></Link>
            </Button>
          )}
          <Button variant="ghost" size="icon" className="hidden lg:inline-flex" asChild aria-label="Profile and account">
            <Link to="/account"><User className="w-5 h-5" /></Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

export default function Layout() {
  const { accountType } = useAppUser();
  const nav = accountType === "vendor" ? VENDOR_NAV : accountType === "carrier" ? CARRIER_NAV : BUYER_NAV;
  const location = useLocation();

  return (
    <div className="app-shell min-h-screen bg-background flex flex-col" data-workspace={accountType || "buyer"}>
      <TopBar />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-6 py-6 md:py-9 pb-24 lg:pb-12">
        <Outlet />
      </main>
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-card/95 backdrop-blur-xl border-t border-border/60 shadow-[0_-8px_35px_hsl(var(--foreground)/0.035)] lg:hidden pb-[env(safe-area-inset-bottom)]">
        <div className={nav.length === 4 ? "max-w-md mx-auto grid grid-cols-4" : "max-w-md mx-auto grid grid-cols-5"}>
          {nav.map((item) => {
            const active = isItemActive(location.pathname, item);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn("relative mx-0.5 my-1 flex flex-col items-center gap-0.5 rounded-xl py-2 text-[11px] font-medium no-tap-highlight transition-colors",
                  active ? "bg-secondary/80 text-primary" : "text-muted-foreground hover:bg-muted/70")}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
      <AIAssistant />
    </div>
  );
}