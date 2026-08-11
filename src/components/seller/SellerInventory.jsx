import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Image } from "@/components/ui/image";
import { AlertCircle, Archive, Loader2, Package, Pause, Play, Plus, Search } from "lucide-react";
import { CATEGORIES, formatCurrency, formatNumber, apiError } from "@/lib/treebay";

const PAGE_SIZE = 50;

export default function SellerInventory({ vendorIds }) {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("newest");
  const [low, setLow] = useState(false);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const buildQuery = useCallback((resetCursor) => {
    const q = { vendor_id: { $in: vendorIds } };
    if (status !== "all") q.listing_status = status;
    if (category !== "all") q.category = category;
    if (!resetCursor && cursor) q.created_date = { $lt: cursor };
    return q;
  }, [vendorIds, status, category, cursor]);

  const fetchPage = useCallback(async (reset) => {
    const q = buildQuery(reset);
    return base44.entities.Product.filter(q, "-created_date", PAGE_SIZE);
  }, [buildQuery]);

  const load = useCallback(async (reset = false) => {
    if (reset) { setLoading(true); setCursor(null); }
    else setLoadingMore(true);
    setError(null);
    try {
      const batch = await fetchPage(reset);
      setProducts(reset ? batch : (prev) => [...prev, ...batch]);
      setCursor(batch.length > 0 ? batch[batch.length - 1].created_date : null);
      setHasMore(batch.length === PAGE_SIZE);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [fetchPage]);

  // Reload from scratch when server-side filters or vendor changes
  useEffect(() => {
    if (!vendorIds.length) { setLoading(false); return; }
    load(true);
  }, [vendorIds.join(","), status, category]);

  const visible = useMemo(() => {
    let list = products;
    if (search) {
      const s = search.toLowerCase();
      list = list.filter((p) => `${p.common_name} ${p.category} ${p.botanical_name || ""}`.toLowerCase().includes(s));
    }
    if (low) list = list.filter((p) => p.quantity_available > 0 && p.quantity_available <= 5);
    if (sort === "price") list = [...list].sort((a, b) => a.unit_price - b.unit_price);
    else if (sort === "stock") list = [...list].sort((a, b) => b.quantity_available - a.quantity_available);
    return list;
  }, [products, search, low, sort]);

  const update = async (product, listing_status) => {
    try { await base44.functions.invoke("updateProduct", { productId: product.id, listing_status }); load(true); }
    catch (e) { setError(apiError(e)); }
  };

  const resetFilters = () => { setSearch(""); setStatus("all"); setCategory("all"); setLow(false); setSort("newest"); };

  if (loading) return (
    <div className="space-y-5">
      <InventoryHeader />
      <div className="grid gap-2 md:grid-cols-4">
        <div className="h-11 rounded-md skeleton-shimmer md:col-span-2" />
        <div className="h-11 rounded-md skeleton-shimmer" />
        <div className="h-11 rounded-md skeleton-shimmer" />
      </div>
      <div className="hidden md:block overflow-hidden rounded-xl border">
        <div className="h-10 bg-secondary/60 skeleton-shimmer" />
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 border-t skeleton-shimmer" />)}
      </div>
      <div className="md:hidden space-y-3">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 rounded-xl border skeleton-shimmer" />)}
      </div>
    </div>
  );

  if (error && !products.length) return (
    <div className="space-y-5">
      <InventoryHeader />
      <Card className="p-8 text-center">
        <AlertCircle className="w-10 h-10 mx-auto text-destructive" />
        <h2 className="mt-3 font-semibold">Could not load inventory</h2>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        <Button className="mt-4" onClick={() => load(true)}>Retry</Button>
      </Card>
    </div>
  );

  return (
    <div className="space-y-5">
      <InventoryHeader />

      {/* Filters */}
      <div className="grid gap-2 md:grid-cols-4">
        <div className="relative md:col-span-2">
          <Search className="absolute left-3 top-3.5 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} className="h-11 pl-9" placeholder="Search loaded inventory" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="sold_out">Sold out</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((c) => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="price">Price</SelectItem>
            <SelectItem value="stock">Available stock</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={low} onChange={(e) => setLow(e.target.checked)} className="rounded" /> Low stock only
        </label>
        {(search || status !== "all" || category !== "all" || low || sort !== "newest") && (
          <Button variant="ghost" size="sm" onClick={resetFilters}>Clear filters</Button>
        )}
      </div>

      {error && products.length > 0 && (
        <Card className="p-3 border-amber-300 bg-amber-50 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600" />
          <span className="text-sm text-amber-800">{error}</span>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => load(true)}>Retry</Button>
        </Card>
      )}

      {visible.length ? (
        <>
          <div className="hidden md:block overflow-hidden rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/60 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-3 font-medium">Product</th>
                  <th className="font-medium">Size</th>
                  <th className="font-medium">Physical</th>
                  <th className="font-medium">Reserved</th>
                  <th className="font-medium">Available</th>
                  <th className="font-medium">Sold</th>
                  <th className="font-medium">Price</th>
                  <th className="font-medium">Status</th>
                  <th className="font-medium" />
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => <InventoryRow key={p.id} p={p} update={update} />)}
              </tbody>
            </table>
          </div>
          <div className="md:hidden space-y-3">
            {visible.map((p) => <InventoryCard key={p.id} p={p} update={update} />)}
          </div>
          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" onClick={() => load(false)} disabled={loadingMore}>
                {loadingMore ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading…</> : "Load More"}
              </Button>
            </div>
          )}
        </>
      ) : (
        <Card className="p-8 text-center">
          <Package className="w-10 h-10 mx-auto text-muted-foreground" />
          <h2 className="mt-3 font-semibold">No inventory found</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {products.length ? "No products match your current filters." : "Your inventory is empty. Add your first product to start showing buyers what you grow."}
          </p>
          {products.length ? (
            <Button variant="outline" className="mt-4" onClick={resetFilters}>Clear filters</Button>
          ) : (
            <Button asChild className="mt-4"><Link to="/vendor/inventory/new"><Plus className="w-4 h-4 mr-2" /> Add Product</Link></Button>
          )}
        </Card>
      )}
    </div>
  );
}

function InventoryHeader() {
  return (
    <header className="flex flex-wrap justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Seller inventory</p>
        <h1 className="font-heading text-2xl font-bold">Inventory</h1>
        <p className="text-sm text-muted-foreground">Physical stock is what you own; reserved is held for active orders; available is ready for new orders.</p>
      </div>
      <Button asChild className="min-h-11"><Link to="/vendor/inventory/new"><Plus className="w-4 h-4" /> Add Product</Link></Button>
    </header>
  );
}

function Actions({ p, update }) {
  return (
    <div className="flex gap-1">
      <Button variant="ghost" size="sm" asChild><Link to={`/vendor/inventory/${p.id}`}>Edit</Link></Button>
      {p.listing_status === "active" ? (
        <Button variant="ghost" size="icon" aria-label="Pause listing" onClick={() => update(p, "paused")}><Pause className="w-4 h-4" /></Button>
      ) : (
        <Button variant="ghost" size="icon" aria-label="Activate listing" onClick={() => update(p, "active")}><Play className="w-4 h-4" /></Button>
      )}
      <Button variant="ghost" size="icon" aria-label="Archive listing" onClick={() => update(p, "archived")}><Archive className="w-4 h-4" /></Button>
    </div>
  );
}

function InventoryRow({ p, update }) {
  return (
    <tr className="border-t hover:bg-secondary/30">
      <td className="p-3">
        <Link to={`/vendor/inventory/${p.id}`} className="flex items-center gap-3 font-semibold">
          {p.images?.[0] ? <Image src={p.images[0]} alt={p.common_name} className="h-10 w-10 rounded-md" /> : <div className="h-10 w-10 rounded-md bg-secondary flex items-center justify-center"><Package className="w-4 h-4 text-muted-foreground" /></div>}
          <span>{p.common_name}</span>
        </Link>
      </td>
      <td className="text-muted-foreground">{p.container_size || p.caliper || "—"}</td>
      <td>{formatNumber(p.physical_quantity ?? 0)}</td>
      <td>{formatNumber(p.quantity_reserved ?? 0)}</td>
      <td className="font-semibold">{formatNumber(p.quantity_available)}</td>
      <td>{formatNumber(p.quantity_sold ?? 0)}</td>
      <td>{formatCurrency(p.unit_price)}</td>
      <td><span className="text-xs capitalize">{p.listing_status?.replaceAll("_", " ")}</span></td>
      <td><Actions p={p} update={update} /></td>
    </tr>
  );
}

function InventoryCard({ p, update }) {
  return (
    <Card className="p-3">
      <div className="flex gap-3">
        <div className="h-16 w-16 overflow-hidden rounded-lg bg-secondary shrink-0">
          {p.images?.[0] ? <Image src={p.images[0]} alt={p.common_name} className="h-full w-full" /> : <div className="h-full w-full flex items-center justify-center"><Package className="w-5 h-5 text-muted-foreground" /></div>}
        </div>
        <div className="flex-1 min-w-0">
          <Link to={`/vendor/inventory/${p.id}`}><p className="font-semibold truncate">{p.common_name}</p></Link>
          <p className="text-xs text-muted-foreground">{p.container_size || p.caliper || "Size not specified"} · {formatCurrency(p.unit_price)}</p>
          <div className="mt-2 grid grid-cols-4 gap-1 text-xs">
            <span className="text-center">Physical<b className="block font-semibold">{formatNumber(p.physical_quantity ?? 0)}</b></span>
            <span className="text-center">Reserved<b className="block font-semibold">{formatNumber(p.quantity_reserved ?? 0)}</b></span>
            <span className="text-center">Available<b className="block font-semibold text-primary">{formatNumber(p.quantity_available)}</b></span>
            <span className="text-center">Sold<b className="block font-semibold">{formatNumber(p.quantity_sold ?? 0)}</b></span>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs font-medium capitalize">{p.listing_status?.replaceAll("_", " ")}</span>
        <Actions p={p} update={update} />
      </div>
    </Card>
  );
}