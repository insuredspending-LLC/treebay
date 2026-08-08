import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAppUser } from "@/hooks/useAppUser";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, SlidersHorizontal, Loader2, X } from "lucide-react";
import ProductCard from "@/components/ProductCard";
import EmptyState from "@/components/EmptyState";
import { CATEGORIES, approxDistance } from "@/lib/treebay";

const DEFAULT_FILTERS = {
  category: "all", state: "all", priceMax: 0, minQty: 0,
  container: "", caliper: "", native: false, evergreen: "all",
  sun: "all", water: "all", pickup: false, delivery: false, wholesale: false, sort: "relevance",
};

export default function Marketplace() {
  const [params] = useSearchParams();
  const { buyerProfile } = useAppUser();
  const [q, setQ] = useState(params.get("q") || "");
  const [category, setCategory] = useState(params.get("category") || "all");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [favs, setFavs] = useState({});
  const [sheet, setSheet] = useState(false);

  const myCity = buyerProfile ? `${buyerProfile.city}, ${buyerProfile.state}` : null;

  useEffect(() => {
    setQ(params.get("q") || "");
    setCategory(params.get("category") || "all");
  }, [params]);

  const load = async () => {
    setLoading(true);
    try {
      const [prods, favList] = await Promise.all([
        base44.entities.Product.filter({ listing_status: "active" }, "-created_date", 200),
        base44.entities.Favorite.list().catch(() => []),
      ]);
      setProducts(prods || []);
      const m = {};
      (favList || []).forEach((f) => { if (f.target_type === "product") m[f.target_id] = f; });
      setFavs(m);
    } catch (e) { /* */ }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const states = useMemo(() => [...new Set(products.map((p) => p.vendor_state).filter(Boolean))].sort(), [products]);

  const filtered = useMemo(() => {
    let list = products.slice();
    const term = q.trim().toLowerCase();
    if (term) {
      list = list.filter((p) =>
        [p.common_name, p.botanical_name, p.cultivar, p.vendor_name, p.category].filter(Boolean)
          .join(" ").toLowerCase().includes(term));
    }
    if (category !== "all") list = list.filter((p) => p.category === category);
    if (filters.state !== "all") list = list.filter((p) => p.vendor_state === filters.state);
    if (filters.priceMax > 0) list = list.filter((p) => p.unit_price <= filters.priceMax);
    if (filters.minQty > 0) list = list.filter((p) => p.quantity_available >= filters.minQty);
    if (filters.container) list = list.filter((p) => (p.container_size || "").toLowerCase().includes(filters.container.toLowerCase()));
    if (filters.caliper) list = list.filter((p) => (p.caliper || "").toLowerCase().includes(filters.caliper.toLowerCase()));
    if (filters.native) list = list.filter((p) => p.native_status);
    if (filters.evergreen !== "all") list = list.filter((p) => p.foliage_type === filters.evergreen);
    if (filters.sun !== "all") list = list.filter((p) => p.sun_requirement === filters.sun);
    if (filters.water !== "all") list = list.filter((p) => p.water_requirement === filters.water);
    if (filters.pickup) list = list.filter((p) => p.pickup_eligible);
    if (filters.delivery) list = list.filter((p) => p.delivery_eligible);
    if (filters.wholesale) list = list.filter((p) => p.wholesale_eligible);

    const withDist = list.map((p) => ({ p, d: myCity ? approxDistance(myCity, `${p.vendor_city}, ${p.vendor_state}`) : null }));
    if (filters.sort === "price_asc") withDist.sort((a, b) => a.p.unit_price - b.p.unit_price);
    else if (filters.sort === "price_desc") withDist.sort((a, b) => b.p.unit_price - a.p.unit_price);
    else if (filters.sort === "distance" && myCity) withDist.sort((a, b) => (a.d ?? 9999) - (b.d ?? 9999));
    else if (filters.sort === "qty") withDist.sort((a, b) => b.p.quantity_available - a.p.quantity_available);
    return withDist;
  }, [products, q, category, filters, myCity]);

  const toggleFav = async (p) => {
    if (favs[p.id]) {
      try { await base44.entities.Favorite.delete(favs[p.id].id); setFavs((m) => { const n = { ...m }; delete n[p.id]; return n; }); } catch {}
    } else {
      try { const f = await base44.entities.Favorite.create({ user_id: "", target_type: "product", target_id: p.id, target_name: p.common_name }); setFavs((m) => ({ ...m, [p.id]: f })); } catch {}
    }
  };

  const setF = (k, v) => setFilters((p) => ({ ...p, [k]: v }));
  const reset = () => setFilters(DEFAULT_FILTERS);
  const activeCount = Object.entries(filters).filter(([k, v]) => v !== DEFAULT_FILTERS[k] && v !== "" && v !== "all" && v !== 0 && v !== false).length;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search trees, plants, nurseries..." className="pl-10 h-11" />
        </div>
        <Sheet open={sheet} onOpenChange={setSheet}>
          <SheetTrigger asChild>
            <Button variant="outline" className="h-11 relative"><SlidersHorizontal className="w-4 h-4" /> Filters {activeCount > 0 && <span className="ml-1 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">{activeCount}</span>}</Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
            <SheetHeader><SheetTitle>Filters</SheetTitle></SheetHeader>
            <div className="space-y-5 px-1 pb-4 mt-2">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {CATEGORIES.map((c) => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>State</Label>
                <Select value={filters.state} onValueChange={(v) => setF("state", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All states</SelectItem>
                    {states.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Max unit price: {filters.priceMax > 0 ? `$${filters.priceMax}` : "Any"}</Label>
                <Slider value={[filters.priceMax]} max={2000} step={25} onValueChange={(v) => setF("priceMax", v[0])} />
              </div>
              <div className="space-y-2">
                <Label>Minimum quantity available: {filters.minQty}</Label>
                <Slider value={[filters.minQty]} max={500} step={5} onValueChange={(v) => setF("minQty", v[0])} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Container size</Label><Input value={filters.container} onChange={(e) => setF("container", e.target.value)} placeholder="5 gallon" /></div>
                <div className="space-y-2"><Label>Caliper</Label><Input value={filters.caliper} onChange={(e) => setF("caliper", e.target.value)} placeholder='4"' /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Foliage</Label>
                  <Select value={filters.evergreen} onValueChange={(v) => setF("evergreen", v)}><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="all">Any</SelectItem><SelectItem value="evergreen">Evergreen</SelectItem><SelectItem value="deciduous">Deciduous</SelectItem></SelectContent></Select>
                </div>
                <div className="space-y-2"><Label>Sun</Label>
                  <Select value={filters.sun} onValueChange={(v) => setF("sun", v)}><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="all">Any</SelectItem><SelectItem value="full sun">Full sun</SelectItem><SelectItem value="part sun">Part sun</SelectItem><SelectItem value="part shade">Part shade</SelectItem><SelectItem value="full shade">Full shade</SelectItem></SelectContent></Select>
                </div>
              </div>
              <div className="space-y-2"><Label>Water</Label>
                <Select value={filters.water} onValueChange={(v) => setF("water", v)}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">Any</SelectItem><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem></SelectContent></Select>
              </div>
              <div className="space-y-3">
                <ToggleRow label="Native plant" checked={filters.native} onChange={(v) => setF("native", v)} />
                <ToggleRow label="Pickup available" checked={filters.pickup} onChange={(v) => setF("pickup", v)} />
                <ToggleRow label="Delivery available" checked={filters.delivery} onChange={(v) => setF("delivery", v)} />
                <ToggleRow label="Wholesale eligible" checked={filters.wholesale} onChange={(v) => setF("wholesale", v)} />
              </div>
              <div className="space-y-2"><Label>Sort by</Label>
                <Select value={filters.sort} onValueChange={(v) => setF("sort", v)}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="relevance">Relevance</SelectItem><SelectItem value="price_asc">Price: low to high</SelectItem><SelectItem value="price_desc">Price: high to low</SelectItem>{myCity && <SelectItem value="distance">Distance</SelectItem>}<SelectItem value="qty">Quantity available</SelectItem></SelectContent></Select>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={reset}>Reset</Button>
                <Button className="flex-1" onClick={() => setSheet(false)}>Show {filtered.length} results</Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{loading ? "Searching..." : `${filtered.length} result${filtered.length === 1 ? "" : "s"}`}</p>
        <Select value={filters.sort} onValueChange={(v) => setF("sort", v)}>
          <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="relevance">Relevance</SelectItem><SelectItem value="price_asc">Price ↑</SelectItem><SelectItem value="price_desc">Price ↓</SelectItem>{myCity && <SelectItem value="distance">Distance</SelectItem>}<SelectItem value="qty">Quantity</SelectItem></SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="No products match your search" description="Try adjusting filters or searching a different term." />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map(({ p }) => <ProductCard key={p.id} product={p} favorite={!!favs[p.id]} onToggleFavorite={() => toggleFav(p)} />)}
        </div>
      )}
    </div>
  );
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between">
      <Label className="font-normal">{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}