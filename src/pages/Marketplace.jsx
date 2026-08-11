import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAppUser } from "@/hooks/useAppUser";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, SlidersHorizontal, X, Package, FileText, Sparkles, ShieldCheck, Loader2 } from "lucide-react";
import ProductCard from "@/components/ProductCard";
import SkeletonCard from "@/components/SkeletonCard";
import EmptyState from "@/components/EmptyState";
import PullToRefresh from "@/components/PullToRefresh";
import { CATEGORIES, approxDistance } from "@/lib/treebay";

const PAGE_SIZE = 12;
const BATCH_SIZE = 50;
const DEFAULT_FILTERS = { category: "all", state: "all", priceMax: 0, minQty: 0, container: "", caliper: "", native: false, evergreen: "all", sun: "all", water: "all", pickup: false, delivery: false, wholesale: false, verified: false, sort: "relevance" };

export default function Marketplace() {
  const [params, setParams] = useSearchParams();
  const { buyerProfile } = useAppUser();
  const [q, setQ] = useState(params.get("q") || "");
  const [category, setCategory] = useState(params.get("category") || "all");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [products, setProducts] = useState([]);
  const [pendingMatches, setPendingMatches] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [favs, setFavs] = useState({});
  const [sheet, setSheet] = useState(false);
  const [vendorName, setVendorName] = useState("");
  const vendorId = params.get("vendor");
  const myCity = buyerProfile?.city && buyerProfile?.state ? `${buyerProfile.city}, ${buyerProfile.state}` : null;

  const serverFilters = useMemo(() => {
    const next = { listing_status: "active" };
    if (vendorId) next.vendor_id = vendorId;
    if (category !== "all") next.category = category;
    if (filters.state !== "all") next.vendor_state = filters.state;
    if (filters.minQty > 0) next.quantity_available = { $gte: filters.minQty };
    if (filters.verified) next.verified_vendor = true;
    if (filters.native) next.native_status = true;
    if (filters.evergreen !== "all") next.foliage_type = filters.evergreen;
    if (filters.sun !== "all") next.sun_requirement = filters.sun;
    if (filters.water !== "all") next.water_requirement = filters.water;
    if (filters.pickup) next.pickup_eligible = true;
    if (filters.delivery) next.delivery_eligible = true;
    if (filters.wholesale) next.wholesale_eligible = true;
    return next;
  }, [vendorId, category, filters]);

  const matchesClientFilters = useCallback((product) => {
    const term = q.trim().toLowerCase();
    if (term && ![product.common_name, product.botanical_name, product.cultivar, product.vendor_name, product.category].filter(Boolean).join(" ").toLowerCase().includes(term)) return false;
    if (filters.priceMax > 0 && product.unit_price > filters.priceMax) return false;
    if (filters.container && !(product.container_size || "").toLowerCase().includes(filters.container.toLowerCase())) return false;
    if (filters.caliper && !(product.caliper || "").toLowerCase().includes(filters.caliper.toLowerCase())) return false;
    return true;
  }, [q, filters.priceMax, filters.container, filters.caliper]);

  const loadPage = useCallback(async ({ reset = false } = {}) => {
    const activeCursor = reset ? null : cursor;
    if (reset) setLoading(true); else setLoadingMore(true);
    let nextCursor = activeCursor;
    let matches = reset ? [] : pendingMatches.slice();
    let exhausted = false;
    for (let scans = 0; scans < 8 && matches.length < PAGE_SIZE; scans += 1) {
      const query = nextCursor ? { ...serverFilters, created_date: { $lt: nextCursor } } : serverFilters;
      const batch = await base44.entities.Product.filter(query, "-created_date", BATCH_SIZE);
      if (!batch?.length) { exhausted = true; break; }
      nextCursor = batch[batch.length - 1].created_date;
      matches = matches.concat(batch.filter(matchesClientFilters));
      if (batch.length < BATCH_SIZE) { exhausted = true; break; }
    }
    const page = matches.slice(0, PAGE_SIZE);
    const remaining = matches.slice(PAGE_SIZE);
    setProducts((current) => reset ? page : [...current, ...page]);
    setPendingMatches(remaining);
    setCursor(nextCursor);
    setHasMore(!exhausted || remaining.length > 0);
    setLoading(false);
    setLoadingMore(false);
  }, [cursor, pendingMatches, serverFilters, matchesClientFilters]);

  useEffect(() => {
    setQ(params.get("q") || "");
    setCategory(params.get("category") || "all");
  }, [params]);
  useEffect(() => {
    if (!vendorId) { setVendorName(""); return; }
    base44.entities.VendorProfile.get(vendorId).then((vendor) => setVendorName(vendor?.business_name || "Selected grower")).catch(() => setVendorName("Selected grower"));
  }, [vendorId]);

  useEffect(() => { loadPage({ reset: true }); }, [serverFilters, q, filters.priceMax, filters.container, filters.caliper]);
  useEffect(() => { base44.entities.Favorite.list().then((list) => setFavs(Object.fromEntries((list || []).filter((item) => item.target_type === "product").map((item) => [item.target_id, item])))).catch(() => {}); }, []);

  const distanceAvailable = useMemo(() => myCity && products.filter((product) => approxDistance(myCity, `${product.vendor_city}, ${product.vendor_state}`) !== null).length >= Math.ceil(products.length / 2), [myCity, products]);
  const displayProducts = useMemo(() => {
    const list = products.slice();
    if (filters.sort === "price_asc") list.sort((a, b) => a.unit_price - b.unit_price);
    else if (filters.sort === "price_desc") list.sort((a, b) => b.unit_price - a.unit_price);
    else if (filters.sort === "qty") list.sort((a, b) => b.quantity_available - a.quantity_available);
    else if (filters.sort === "distance" && distanceAvailable) list.sort((a, b) => (approxDistance(myCity, `${a.vendor_city}, ${a.vendor_state}`) ?? 9999) - (approxDistance(myCity, `${b.vendor_city}, ${b.vendor_state}`) ?? 9999));
    return list;
  }, [products, filters.sort, distanceAvailable, myCity]);
  const states = useMemo(() => [...new Set(products.map((product) => product.vendor_state).filter(Boolean))].sort(), [products]);
  const setF = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const clearVendor = () => { const next = new URLSearchParams(params); next.delete("vendor"); setParams(next); };
  const reset = () => { setFilters(DEFAULT_FILTERS); setCategory("all"); setQ(""); const next = new URLSearchParams(); if (vendorId) next.set("vendor", vendorId); setParams(next); };

  const activeFilters = [];
  if (vendorId) activeFilters.push({ key: "vendor", label: "Grower storefront", clear: clearVendor });
  if (category !== "all") activeFilters.push({ key: "category", label: category, clear: () => setCategory("all") });
  if (q) activeFilters.push({ key: "q", label: `“${q}”`, clear: () => setQ("") });
  Object.entries(filters).forEach(([key, value]) => { if (value !== DEFAULT_FILTERS[key] && value !== "" && value !== "all" && value !== 0 && value !== false) activeFilters.push({ key, label: key === "priceMax" ? `≤$${value}` : key === "minQty" ? `≥${value} qty` : typeof value === "boolean" ? key : String(value), clear: () => setF(key, DEFAULT_FILTERS[key]) }); });

  const toggleFav = async (product) => {
    if (favs[product.id]) { await base44.entities.Favorite.delete(favs[product.id].id); setFavs((current) => { const next = { ...current }; delete next[product.id]; return next; }); }
    else { const favorite = await base44.entities.Favorite.create({ user_id: "", target_type: "product", target_id: product.id, target_name: product.common_name }); setFavs((current) => ({ ...current, [product.id]: favorite })); }
  };

  return <PullToRefresh onRefresh={() => loadPage({ reset: true })}><div className="space-y-4">
    <div className="flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search trees, plants, nurseries…" className="pl-10 h-11" /></div><Sheet open={sheet} onOpenChange={setSheet}><SheetTrigger asChild><Button variant="outline" className="h-11 relative md:hidden"><SlidersHorizontal className="w-4 h-4" /> Filters</Button></SheetTrigger><SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto"><SheetHeader><SheetTitle>Filters</SheetTitle></SheetHeader><FilterControls filters={filters} setF={setF} category={category} setCategory={setCategory} states={states} reset={reset} onDone={() => setSheet(false)} /></SheetContent></Sheet></div>
    {activeFilters.length > 0 && <div className="flex items-center gap-2 flex-wrap">{activeFilters.map((filter) => <button key={filter.key} onClick={filter.clear} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary text-xs font-medium text-foreground hover:bg-secondary/80">{filter.key === "vendor" ? `Grower: ${vendorName || "Selected grower"}` : filter.label} <X className="w-3 h-3" /></button>)}<button onClick={reset} className="text-xs text-primary font-medium">Clear all</button></div>}
    <div className="md:flex gap-6"><aside className="hidden md:block w-56 shrink-0"><div className="sticky top-20 space-y-4"><div className="flex items-center justify-between"><h2 className="font-heading font-semibold text-sm">Filters</h2>{activeFilters.length > 0 && <button onClick={reset} className="text-xs text-primary font-medium">Clear all</button>}</div><FilterControls filters={filters} setF={setF} category={category} setCategory={setCategory} states={states} reset={reset} variant="sidebar" /></div></aside>
      <div className="flex-1 min-w-0 space-y-4"><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{loading ? "Searching…" : `${displayProducts.length} loaded result${displayProducts.length === 1 ? "" : "s"}${hasMore ? "+" : ""}`}</p><Select value={filters.sort} onValueChange={(value) => setF("sort", value)}><SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="relevance">Relevance</SelectItem><SelectItem value="price_asc">Price ↑</SelectItem><SelectItem value="price_desc">Price ↓</SelectItem>{distanceAvailable && <SelectItem value="distance">Distance</SelectItem>}<SelectItem value="qty">Quantity</SelectItem></SelectContent></Select></div>
      {loading ? <div className="grid grid-cols-2 md:grid-cols-3 gap-3"><SkeletonCard count={6} /></div> : displayProducts.length === 0 ? <EmptyState icon={Package} title="No plants match those filters yet." description="Try broadening your search, adjusting filters, or request a bulk quote." action={<div className="flex gap-2 justify-center"><Button variant="outline" onClick={reset}>Clear Filters</Button><Button asChild><Link to="/projects"><FileText className="w-4 h-4" /> Create an RFQ</Link></Button></div>} /> : <><div className="grid grid-cols-2 md:grid-cols-3 gap-3">{displayProducts.map((product) => <ProductCard key={product.id} product={product} favorite={!!favs[product.id]} onToggleFavorite={() => toggleFav(product)} />)}</div>{hasMore && <div className="flex justify-center pt-2"><Button variant="outline" onClick={() => loadPage()} disabled={loadingMore} className="px-8">{loadingMore && <Loader2 className="w-4 h-4 animate-spin" />} Load more</Button></div>}{!hasMore && <p className="text-center text-xs text-muted-foreground">You’ve reached the end of these results.</p>}</>}
      {!loading && <div className="flex items-center gap-3 p-4 rounded-2xl border border-primary/20 bg-primary/5"><Sparkles className="w-5 h-5 text-primary shrink-0" /><p className="text-sm text-foreground flex-1">Can’t find what you need? Ask the TreEbay Assistant to search or build an RFQ draft.</p><Button size="sm" variant="outline" onClick={() => window.dispatchEvent(new CustomEvent("trebay-ai-open"))}>Ask AI</Button></div>}</div></div>
  </div></PullToRefresh>;
}

function FilterControls({ filters, setF, category, setCategory, states, reset, variant = "sheet", onDone }) {
  return <div className={variant === "sidebar" ? "space-y-4" : "space-y-5 px-1 pb-4 mt-2"}><div className="space-y-2"><Label>Category</Label><Select value={category} onValueChange={setCategory}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem>{CATEGORIES.map((item) => <SelectItem key={item.name} value={item.name}>{item.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>State</Label><Select value={filters.state} onValueChange={(value) => setF("state", value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All states</SelectItem>{states.map((state) => <SelectItem key={state} value={state}>{state}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Max unit price: {filters.priceMax > 0 ? `$${filters.priceMax}` : "Any"}</Label><Slider value={[filters.priceMax]} max={2000} step={25} onValueChange={(value) => setF("priceMax", value[0])} /></div><div className="space-y-2"><Label>Min quantity available: {filters.minQty}</Label><Slider value={[filters.minQty]} max={500} step={5} onValueChange={(value) => setF("minQty", value[0])} /></div><div className="space-y-2"><Label>Container size</Label><Input value={filters.container} onChange={(event) => setF("container", event.target.value)} placeholder="5 gallon" /></div><div className="space-y-2"><Label>Caliper</Label><Input value={filters.caliper} onChange={(event) => setF("caliper", event.target.value)} placeholder='4&quot;' /></div><div className="space-y-3"><ToggleRow label="Verified growers" checked={filters.verified} onChange={(value) => setF("verified", value)} icon={ShieldCheck} /><ToggleRow label="Native plant" checked={filters.native} onChange={(value) => setF("native", value)} /><ToggleRow label="Pickup available" checked={filters.pickup} onChange={(value) => setF("pickup", value)} /><ToggleRow label="Delivery available" checked={filters.delivery} onChange={(value) => setF("delivery", value)} /><ToggleRow label="Wholesale eligible" checked={filters.wholesale} onChange={(value) => setF("wholesale", value)} /></div>{variant === "sheet" && <div className="flex gap-2 pt-2"><Button variant="outline" className="flex-1" onClick={reset}>Reset</Button><Button className="flex-1" onClick={onDone}>Show results</Button></div>}</div>;
}
function ToggleRow({ label, checked, onChange, icon: Icon }) { return <div className="flex items-center justify-between"><Label className="font-normal flex items-center gap-1.5">{Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground" />}{label}</Label><Switch checked={checked} onCheckedChange={onChange} /></div>; }