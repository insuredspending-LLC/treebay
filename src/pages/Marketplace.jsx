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
import { Search, SlidersHorizontal, X, FileText, Sparkles, ShieldCheck, Loader2 } from "lucide-react";
import ProductCard from "@/components/ProductCard";
import SkeletonCard from "@/components/SkeletonCard";
import PullToRefresh from "@/components/PullToRefresh";
import { CATEGORIES, approxDistance } from "@/lib/treebay";

const PAGE_SIZE = 12;
const BATCH_SIZE = 50;
const DEFAULT_FILTERS = { category: "all", state: "all", priceMax: 0, minQty: 0, container: "", caliper: "", native: false, evergreen: "all", sun: "all", water: "all", pickup: false, delivery: false, wholesale: false, verified: false, sort: "relevance" };
const US_STATES = ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC", "PR", "VI", "GU", "AS", "MP"];

export default function Marketplace() {
  const [params, setParams] = useSearchParams();
  const { buyerProfile } = useAppUser();
  const [q, setQ] = useState(params.get("q") || "");
  const [category, setCategory] = useState(params.get("category") || "all");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [products, setProducts] = useState([]);
  const [pendingMatches, setPendingMatches] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [favs, setFavs] = useState({});
  const [sheet, setSheet] = useState(false);
  const [vendorName, setVendorName] = useState("");
  const vendorId = params.get("vendor");
  const myCity = buyerProfile?.city && buyerProfile?.state ? `${buyerProfile.city}, ${buyerProfile.state}` : null;
  const sortConfig = filters.sort === "price_asc" ? { field: "unit_price", sort: "unit_price", direction: 1 } : filters.sort === "price_desc" ? { field: "unit_price", sort: "-unit_price", direction: -1 } : filters.sort === "qty" ? { field: "quantity_available", sort: "-quantity_available", direction: -1 } : { field: "created_date", sort: "-created_date", direction: -1 };

  const serverFilters = useMemo(() => {
    const next = { listing_status: "active", is_test_fixture: false };
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
    const activeOffset = reset ? 0 : offset;
    if (reset) setLoading(true); else setLoadingMore(true);
    let nextOffset = activeOffset;
    let matches = reset ? [] : pendingMatches.slice();
    let exhausted = false;
    for (let scans = 0; scans < 8 && matches.length < PAGE_SIZE; scans += 1) {
      const batch = await base44.entities.Product.filter(serverFilters, sortConfig.sort, BATCH_SIZE, nextOffset);
      if (!batch?.length) { exhausted = true; break; }
      nextOffset += batch.length;
      matches = matches.concat(batch.filter(matchesClientFilters));
      if (batch.length < BATCH_SIZE) { exhausted = true; break; }
    }
    const page = matches.slice(0, PAGE_SIZE);
    const remaining = matches.slice(PAGE_SIZE);
    setProducts((current) => reset ? page : [...current, ...page]);
    setPendingMatches(remaining);
    setOffset(nextOffset);
    setHasMore(!exhausted || remaining.length > 0);
    setLoading(false);
    setLoadingMore(false);
  }, [offset, pendingMatches, serverFilters, matchesClientFilters, sortConfig]);

  useEffect(() => {
    setQ(params.get("q") || "");
    setCategory(params.get("category") || "all");
  }, [params]);
  useEffect(() => {
    if (!vendorId) { setVendorName(""); return; }
    base44.functions.invoke("getPublicVendorProfiles", { vendorIds: [vendorId] }).then(({ data }) => setVendorName(data?.vendors?.[vendorId]?.business_name || "Selected grower")).catch(() => setVendorName("Selected grower"));
  }, [vendorId]);

  useEffect(() => { loadPage({ reset: true }); }, [serverFilters, q, filters.priceMax, filters.container, filters.caliper]);
  useEffect(() => { base44.entities.Favorite.list().then((list) => setFavs(Object.fromEntries((list || []).filter((item) => item.target_type === "product").map((item) => [item.target_id, item])))).catch(() => {}); }, []);

  const distanceAvailable = useMemo(() => myCity && products.filter((product) => approxDistance(myCity, `${product.vendor_city}, ${product.vendor_state}`) !== null).length >= Math.ceil(products.length / 2), [myCity, products]);
  const displayProducts = useMemo(() => {
    const list = products.slice();
    if (filters.sort === "distance" && distanceAvailable) list.sort((a, b) => (approxDistance(myCity, `${a.vendor_city}, ${a.vendor_state}`) ?? 9999) - (approxDistance(myCity, `${b.vendor_city}, ${b.vendor_state}`) ?? 9999));
    return list;
  }, [products, filters.sort, distanceAvailable, myCity]);
  const states = US_STATES;
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

  return (
    <PullToRefresh onRefresh={() => loadPage({ reset: true })}>
      <div className="space-y-8">
        <section className="grid gap-6 border-b border-border/70 pb-8 lg:grid-cols-[1.2fr_.8fr] lg:items-center">
          <div>
            <p className="editorial-kicker">The marketplace</p>
            <h1 className="mt-3 max-w-2xl font-display text-4xl font-semibold leading-[1.02] md:text-5xl">
              Find what grows your next project.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
              Browse nursery inventory, compare specifications, and source with a clearer view of availability.
            </p>
          </div>
          <div className="relative hidden h-40 overflow-hidden rounded-[1.75rem] bg-[#183524] lg:block">
            <img src="/marketplace/tree-marketplace-nursery-hero.webp" alt="" className="h-full w-full object-cover object-[70%_60%]" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#10251a]/70 to-transparent" />
            <div className="absolute bottom-5 left-6 text-white">
              <p className="text-[10px] font-bold uppercase tracking-[.2em] text-white/65">Source with confidence</p>
              <p className="mt-1 font-display text-2xl">From grower to project.</p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="Search trees, plants, sizes, or nurseries"
                aria-label="Search marketplace inventory"
                className="h-14 rounded-2xl border-border/80 bg-card pl-14 text-base shadow-sm"
              />
            </div>
            <Sheet open={sheet} onOpenChange={setSheet}>
              <SheetTrigger asChild>
                <Button variant="outline" className="h-14 rounded-2xl bg-card px-5">
                  <SlidersHorizontal className="h-4 w-4" />
                  Refine search
                  {activeFilters.length > 0 && <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">{activeFilters.length}</span>}
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
                <SheetHeader className="border-b border-border/70 pb-5">
                  <SheetTitle className="font-display text-3xl">Find the right fit.</SheetTitle>
                </SheetHeader>
                <FilterControls filters={filters} setF={setF} category={category} setCategory={setCategory} states={states} reset={reset} onDone={() => setSheet(false)} />
              </SheetContent>
            </Sheet>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <button onClick={() => setCategory("all")} className={"shrink-0 rounded-full border px-4 py-2.5 text-xs font-semibold transition " + (category === "all" ? "border-primary bg-primary text-primary-foreground" : "border-border/80 bg-card text-muted-foreground hover:border-primary/30 hover:text-primary")}>All inventory</button>
            {CATEGORIES.map((item) => (
              <button key={item.name} onClick={() => setCategory(item.name)} className={"shrink-0 rounded-full border px-4 py-2.5 text-xs font-semibold transition " + (category === item.name ? "border-primary bg-primary text-primary-foreground" : "border-border/80 bg-card text-muted-foreground hover:border-primary/30 hover:text-primary")}>{item.name}</button>
            ))}
          </div>

          {activeFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {activeFilters.map((filter) => (
                <button key={filter.key} onClick={filter.clear} className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-secondary/70">
                  {filter.key === "vendor" ? "Grower: " + (vendorName || "Selected grower") : filter.label}
                  <X className="h-3 w-3" />
                </button>
              ))}
              <button onClick={reset} className="px-2 text-xs font-semibold text-primary">Clear all</button>
            </div>
          )}
        </section>

        <section className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
            <div>
              <h2 className="text-lg font-bold">{vendorId ? vendorName || "Grower inventory" : category === "all" ? "Available inventory" : category}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {loading ? "Searching nursery inventory…" : displayProducts.length + " loaded result" + (displayProducts.length === 1 ? "" : "s") + (hasMore ? "+" : "")}
                {myCity ? " · Sourcing from " + myCity : ""}
              </p>
            </div>
            <Select value={filters.sort} onValueChange={(value) => setF("sort", value)}>
              <SelectTrigger className="h-10 w-44 rounded-full border-border/70 bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="relevance">Newest listings</SelectItem>
                <SelectItem value="price_asc">Price: low to high</SelectItem>
                <SelectItem value="price_desc">Price: high to low</SelectItem>
                {distanceAvailable && <SelectItem value="distance">Closest first</SelectItem>}
                <SelectItem value="qty">Most available</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 gap-4 min-[440px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4"><SkeletonCard count={8} /></div>
          ) : displayProducts.length === 0 ? (
            <div className="grid overflow-hidden rounded-[2rem] border border-border/70 bg-card md:grid-cols-[.7fr_1.3fr]">
              <div className="relative hidden min-h-[340px] bg-[#dce3d3] md:block">
                <img src="/marketplace/category-native.webp" alt="" className="absolute inset-0 h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#173522]/35 to-transparent" />
              </div>
              <div className="flex flex-col justify-center p-8 md:p-12">
                <p className="editorial-kicker">Keep the project moving</p>
                <h3 className="mt-3 max-w-lg font-display text-3xl font-semibold leading-none md:text-4xl">
                  {hasMore ? "Let’s look a little further." : "The right plant is worth finding."}
                </h3>
                <p className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground">
                  {hasMore ? "No matches in the inventory searched so far. Continue searching, or broaden your filters." : "No listings match this search yet. Try fewer filters or send growers a project request so they can respond with availability."}
                </p>
                <div className="mt-7 flex flex-wrap gap-3">
                  {hasMore ? (
                    <Button className="rounded-full" onClick={() => loadPage()} disabled={loadingMore}>{loadingMore && <Loader2 className="h-4 w-4 animate-spin" />} Search more inventory</Button>
                  ) : (
                    <Button variant="outline" className="rounded-full" onClick={reset}>Clear filters</Button>
                  )}
                  <Button className="rounded-full" asChild><Link to="/projects"><FileText className="h-4 w-4" /> Request project quotes</Link></Button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 min-[440px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                {displayProducts.map((product) => <ProductCard key={product.id} product={product} favorite={!!favs[product.id]} onToggleFavorite={() => toggleFav(product)} />)}
              </div>
              {hasMore && (
                <div className="flex justify-center pt-5">
                  <Button variant="outline" onClick={() => loadPage()} disabled={loadingMore} className="h-12 rounded-full bg-card px-9">{loadingMore && <Loader2 className="h-4 w-4 animate-spin" />} Load more inventory</Button>
                </div>
              )}
              {!hasMore && <p className="pt-4 text-center text-xs text-muted-foreground">You’ve reached the end of these results.</p>}
            </>
          )}
        </section>

        {!loading && (
          <section className="flex flex-col gap-6 rounded-[1.75rem] bg-[#10251a] p-6 text-white sm:flex-row sm:items-center sm:justify-between md:p-8">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#b7cda3]">Sourcing a bigger project?</p>
              <h2 className="mt-2 font-display text-3xl font-semibold">One request. Better options.</h2>
              <p className="mt-2 text-sm text-white/60">Organize your plant list and compare grower responses.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button className="rounded-full bg-[#dce9c9] text-[#173522] hover:bg-white" asChild><Link to="/projects">Request quotes <FileText className="h-4 w-4" /></Link></Button>
              <Button variant="ghost" className="rounded-full text-white/75 hover:bg-white/10 hover:text-white" onClick={() => window.dispatchEvent(new CustomEvent("trebay-ai-open"))}><Sparkles className="h-4 w-4" /> Sourcing assistant</Button>
            </div>
          </section>
        )}
      </div>
    </PullToRefresh>
  );
}

function FilterControls({ filters, setF, category, setCategory, states, reset, onDone }) {
  return (
    <div className="space-y-7 px-1 pb-6 pt-6">
      <section className="space-y-4">
        <p className="editorial-kicker">Inventory</p>
        <div className="space-y-2">
          <Label>Category</Label>
          <Select value={category} onValueChange={setCategory}><SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All categories</SelectItem>{CATEGORIES.map((item) => <SelectItem key={item.name} value={item.name}>{item.name}</SelectItem>)}</SelectContent></Select>
        </div>
        <div className="space-y-2">
          <Label>Grower state</Label>
          <Select value={filters.state} onValueChange={(value) => setF("state", value)}><SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All states</SelectItem>{states.map((state) => <SelectItem key={state} value={state}>{state}</SelectItem>)}</SelectContent></Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><Label>Container size</Label><Input aria-label="Container size" value={filters.container} onChange={(event) => setF("container", event.target.value)} placeholder="5 gallon" className="h-11 rounded-xl" /></div>
          <div className="space-y-2"><Label>Caliper</Label><Input aria-label="Caliper" value={filters.caliper} onChange={(event) => setF("caliper", event.target.value)} placeholder="4 inch" className="h-11 rounded-xl" /></div>
        </div>
      </section>

      <section className="space-y-5 border-t border-border/70 pt-6">
        <p className="editorial-kicker">Price & quantity</p>
        <div className="space-y-3"><Label>Maximum unit price <span className="float-right font-semibold text-primary">{filters.priceMax > 0 ? "$" + filters.priceMax : "Any"}</span></Label><Slider aria-label="Maximum unit price" value={[filters.priceMax]} max={2000} step={25} onValueChange={(value) => setF("priceMax", value[0])} /></div>
        <div className="space-y-3"><Label>Minimum available <span className="float-right font-semibold text-primary">{filters.minQty || "Any"}</span></Label><Slider aria-label="Minimum available quantity" value={[filters.minQty]} max={500} step={5} onValueChange={(value) => setF("minQty", value[0])} /></div>
      </section>

      <section className="space-y-4 border-t border-border/70 pt-6">
        <p className="editorial-kicker">Preferences</p>
        <ToggleRow label="Verified growers" checked={filters.verified} onChange={(value) => setF("verified", value)} icon={ShieldCheck} />
        <ToggleRow label="Native plants" checked={filters.native} onChange={(value) => setF("native", value)} />
        <ToggleRow label="Pickup available" checked={filters.pickup} onChange={(value) => setF("pickup", value)} />
        <ToggleRow label="Delivery available" checked={filters.delivery} onChange={(value) => setF("delivery", value)} />
        <ToggleRow label="Wholesale eligible" checked={filters.wholesale} onChange={(value) => setF("wholesale", value)} />
      </section>

      <div className="sticky bottom-0 flex gap-3 border-t border-border/70 bg-background/95 pt-5 backdrop-blur">
        <Button variant="outline" className="h-12 flex-1 rounded-full" onClick={reset}>Reset</Button>
        <Button className="h-12 flex-1 rounded-full" onClick={onDone}>Show results</Button>
      </div>
    </div>
  );
}

function ToggleRow({ label, checked, onChange, icon: Icon }) {
  return <div className="flex items-center justify-between gap-4"><Label className="flex items-center gap-2 font-normal">{Icon && <Icon className="h-4 w-4 text-muted-foreground" />}{label}</Label><Switch aria-label={label} checked={checked} onCheckedChange={onChange} /></div>;
}
