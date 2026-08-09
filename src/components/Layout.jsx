import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAppUser } from "@/hooks/useAppUser";
import { useAuth } from "@/lib/AuthContext";
import { createNotification } from "@/lib/treebay";
import { Bell, ShoppingCart, Home as HomeIcon, Store, FolderKanban, MessageSquare, User, LayoutDashboard, Package, FileText, Truck, Leaf, ShieldCheck, ChevronLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";
import KeepAliveOutlet from "@/components/KeepAliveOutlet";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { relativeTime } from "@/lib/treebay";

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

function TopBar() {
  const { user, accountType } = useAppUser();
  const { items, unread, markAllRead } = useNotifications();
  const navigate = useNavigate();
  const location = useLocation();
  const { isChild, title } = getHeaderState(location.pathname);
  return (
    <header className="sticky top-0 z-30 bg-background/90 backdrop-blur border-b border-border pt-[env(safe-area-inset-top)]">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        {isChild ? (
          <div className="flex items-center gap-1 min-w-0">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back" className="shrink-0 -ml-2"><ChevronLeft className="w-5 h-5" /></Button>
            <span className="font-heading font-bold text-base text-foreground truncate">{title}</span>
          </div>
        ) : (
          <button onClick={() => navigate("/")} className="flex items-center gap-2 no-tap-highlight">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Leaf className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-heading font-extrabold text-lg text-primary tracking-tight">Treebay</span>
          </button>
        )}
        <div className="flex items-center gap-1">
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
                ) : items.map((n) => (
                  <div key={n.id} className={cn("px-4 py-3 border-b", !n.read && "bg-secondary/50")}>
                    <p className="text-sm font-medium">{n.title}</p>
                    {n.body && <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>}
                    <p className="text-[10px] text-muted-foreground mt-1">{relativeTime(n.created_date)}</p>
                  </div>
                ))}
              </ScrollArea>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </header>
  );
}

const BUYER_NAV = [
  { to: "/", label: "Home", icon: HomeIcon, match: ["/"] },
  { to: "/marketplace", label: "Marketplace", icon: Store, match: ["/marketplace", "/product", "/vendor"] },
  { to: "/projects", label: "Projects", icon: FolderKanban, match: ["/projects"] },
  { to: "/messages", label: "Messages", icon: MessageSquare, match: ["/messages"] },
  { to: "/account", label: "Account", icon: User, match: ["/account", "/settings", "/favorites", "/privacy", "/terms", "/community-rules"] },
];

const VENDOR_NAV = [
  { to: "/vendor", label: "Dashboard", icon: LayoutDashboard, match: ["/vendor"], exact: true },
  { to: "/vendor/inventory", label: "Inventory", icon: Package, match: ["/vendor/inventory"] },
  { to: "/vendor/rfqs", label: "RFQs", icon: FileText, match: ["/vendor/rfqs"] },
  { to: "/vendor/orders", label: "Orders", icon: ShoppingCart, match: ["/vendor/orders", "/orders"] },
  { to: "/account", label: "Account", icon: User, match: ["/account", "/settings", "/favorites", "/privacy", "/terms", "/community-rules"] },
];

function isItemActive(pathname, item) {
  const prefixes = item.match || [item.to];
  return prefixes.some((p) => {
    if (p === "/") return pathname === "/";
    if (item.exact) return pathname === p;
    return pathname === p || pathname.startsWith(p + "/");
  });
}

export default function Layout() {
  const { accountType } = useAppUser();
  const nav = accountType === "vendor" ? VENDOR_NAV : BUYER_NAV;
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TopBar />
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-5 pb-24">
        <KeepAliveOutlet key={accountType} keepPaths={nav.map((n) => n.to)} />
      </main>
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-background/95 backdrop-blur border-t border-border md:hidden pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-md mx-auto grid grid-cols-5">
          {nav.map((item) => {
            const active = isItemActive(location.pathname, item);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn("flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium no-tap-highlight",
                  active ? "text-primary" : "text-muted-foreground")}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}