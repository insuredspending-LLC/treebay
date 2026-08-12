import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAppUser } from "@/hooks/useAppUser";
import { CATEGORIES, approxDistance } from "@/lib/treebay";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Search, MapPin, Package, FileText, ArrowRight, Leaf, Store, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";
import ProductCard from "@/components/ProductCard";
import SkeletonCard from "@/components/SkeletonCard";
import SectionHeader from "@/components/SectionHeader";
import EmptyState from "@/components/EmptyState";
import PullToRefresh from "@/components/PullToRefresh";
import VerifiedBadge from "@/components/VerifiedBadge";

export default function Home() {
  const { buyerProfile } = useAppUser();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [featured, setFeatured] = useState([]);
  const [near, setNear] = useState([]);
  const [recent, setRecent] = useState([]);
  const [bulk, setBulk] = useState([]);
  const [growers, setGrowers] = useState([]);
  const [loading, setLoading] = useState(true);

  const myCity = buyerProfile ? `${buyerProfile.city}, ${buyerProfile.state}` : null;

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [prods, vendorRes] = await Promise.all([
        base44.entities.Product.filter({ listing_status: "active" }, "-created_date", 60),
        base44.functions.invoke("getPublicVendorProfiles", { verified: true, limit: 12 }),
      ]);
      const vendors = vendorRes?.data?.vendors || [];
      const list = prods || [];
      setFeatured(list.filter((p) => p.featured).slice(0, 8));
      setRecent(list.slice(0, 8));
      setBulk(list.filter((p) => p.bulk_price_tiers?.length > 0).slice(0, 8));
      if (myCity) {
        const withDist = list.map((p) => ({ p, d: approxDistance(myCity, `${p.vendor_city}, ${p.vendor_state}`) }));
        setNear(withDist.filter((x) => x.d !== null).sort((a, b) => a.d - b.d).slice(0, 8).map((x) => x.p));
      } else {
        setNear(list.slice(0, 8));
      }
      setGrowers(vendors || []);
    } catch { /* */ }
    finally { if (!silent) setLoading(false); }
  };
  useEffect(() => { load(); }, [myCity]);

  const search = (e) => { e.preventDefault(); navigate(`/marketplace?q=${encodeURIComponent(q)}`); };

  return (
    <PullToRefresh onRefresh={() => load(true)}>
    <div className="space-y-8">
      {/* Hero */}
      <section className="relative rounded-3xl overflow-hidden -mx-1">
        <div className="absolute inset-0">
          <img src="https://images.unsplash.com/photo-1485955900006-10f4d269d911?w=1200&q=80" alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
        </div>
        <div className="absolute inset-0 bg-gradient-to-br from-primary/95 via-primary/85 to-primary/70" />
        <div className="relative p-6 md:p-10 text-primary-foreground">
          <p className="text-xs font-semibold tracking-widest uppercase text-primary-foreground/80 mb-2">Source Better. Buy Smarter. Grow More.</p>
          <h1 className="text-2xl md:text-4xl font-heading font-extrabold leading-tight text-balance max-w-2xl">
            Find the right plants.<br />Get the right price.<br />Get them where they need to go.
          </h1>
          <form onSubmit={search} className="mt-5 flex gap-2 max-w-lg">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search trees, shrubs, plants, suppliers…" className="pl-10 h-12 bg-white text-foreground border-0 shadow-md" />
            </div>
            <Button type="submit" className="h-12 bg-white text-primary hover:bg-white/90 font-semibold shadow-md">Search</Button>
          </form>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild className="bg-white text-primary hover:bg-white/90"><Link to="/marketplace"><Package className="w-4 h-4" /> Shop Plants</Link></Button>
            <Button asChild variant="outline" className="border-white/40 text-white hover:bg-white/10 hover:text-white"><Link to="/projects"><FileText className="w-4 h-4" /> Request Bulk Quote</Link></Button>
            <Button asChild variant="ghost" className="text-white hover:bg-white/10 hover:text-white"><Link to="/orders">Track Orders <ArrowRight className="w-4 h-4" /></Link></Button>
            <Button asChild variant="ghost" className="text-white hover:bg-white/10 hover:text-white"><Link to="/marketplace"><Store className="w-4 h-4" /> Find Growers</Link></Button>
          </div>
          {myCity && <p className="text-xs text-primary-foreground/70 mt-4 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> Showing inventory near {myCity}</p>}
        </div>
      </section>

      {/* Categories */}
      <section>
        <SectionHeader title="Popular Categories" subtitle="Browse by plant type" to="/marketplace" actionLabel="Browse all" />
        <div className="grid grid-cols-3 md:grid-cols-7 gap-3">
          {CATEGORIES.map((c) => (
            <Link key={c.name} to={`/marketplace?category=${encodeURIComponent(c.name)}`}
              className="flex flex-col items-center gap-2 p-3 rounded-2xl border border-border bg-card hover:border-primary/30 hover:shadow-sm transition no-tap-highlight card-shadow-hover">
              <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center"><Leaf className="w-6 h-6 text-primary" /></div>
              <span className="text-xs font-medium text-center leading-tight text-foreground">{c.name}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured Inventory */}
      <section>
        <SectionHeader title="Featured Inventory" subtitle="Hand-picked listings from verified growers" to="/marketplace" />
        {loading ? (
          <div className="flex gap-3 overflow-x-auto scrollbar-hide">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="w-44 shrink-0"><SkeletonCard /></div>)}</div>
        ) : featured.length > 0 ? (
          <ProductRow products={featured} />
        ) : (
          <Card className="p-6 border-dashed">
            <EmptyState icon={Package} title="No featured inventory yet" description="Browse the marketplace to see all available plants from verified growers." action={<Button asChild><Link to="/marketplace">Browse Marketplace</Link></Button>} />
          </Card>
        )}
      </section>

      {/* Available Near You */}
      {myCity && (
        <section>
          <SectionHeader title="Available Near You" subtitle={`Closest to ${myCity}`} to="/marketplace" />
          {loading ? (
            <div className="flex gap-3 overflow-x-auto scrollbar-hide">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="w-44 shrink-0"><SkeletonCard /></div>)}</div>
          ) : near.length > 0 ? (
            <ProductRow products={near} />
          ) : (
            <Card className="p-6 border-dashed">
              <EmptyState icon={MapPin} title="No inventory nearby yet" description="Try expanding your search to other regions or request a bulk quote." />
            </Card>
          )}
        </section>
      )}

      {/* Bulk Opportunities */}
      <section>
        <SectionHeader title="Bulk Opportunities" subtitle="Volume pricing from participating growers" to="/marketplace" />
        {loading ? (
          <div className="flex gap-3 overflow-x-auto scrollbar-hide">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="w-44 shrink-0"><SkeletonCard /></div>)}</div>
        ) : bulk.length > 0 ? (
          <ProductRow products={bulk} />
        ) : (
          <Card className="p-6 border-dashed">
            <EmptyState icon={TrendingUp} title="No bulk pricing listed yet" description="Post a bulk RFQ and let growers come to you with competitive volume pricing." action={<Button asChild><Link to="/projects">Request Bulk Quote</Link></Button>} />
          </Card>
        )}
      </section>

      {/* Verified Growers */}
      <section>
        <SectionHeader title="Verified Growers" subtitle="Trusted nurseries and tree farms" to="/marketplace" actionLabel="Find growers" />
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-32 rounded-2xl skeleton-shimmer" />)}</div>
        ) : growers.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {growers.slice(0, 4).map((v) => (
              <Link key={v.id} to={`/vendor/${v.id}`} className="block rounded-2xl border border-border bg-card p-4 hover:border-primary/30 hover:shadow-sm transition no-tap-highlight card-shadow-hover">
                <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center mb-2"><Store className="w-5 h-5 text-primary" /></div>
                <p className="font-heading font-semibold text-sm text-foreground line-clamp-1">{v.business_name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{[v.city, v.state].filter(Boolean).join(", ")}</p>
                <VerifiedBadge status="verified" className="mt-2" />
              </Link>
            ))}
          </div>
        ) : (
          <Card className="p-6 border-dashed">
            <EmptyState icon={ShieldCheck} title="No verified growers yet" description="Verified nurseries will appear here once approved." />
          </Card>
        )}
      </section>

      {/* Recently Added */}
      <section>
        <SectionHeader title="Recently Added" subtitle="Fresh listings from across the marketplace" to="/marketplace" />
        {loading ? (
          <div className="flex gap-3 overflow-x-auto scrollbar-hide">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="w-44 shrink-0"><SkeletonCard /></div>)}</div>
        ) : recent.length > 0 ? (
          <ProductRow products={recent} />
        ) : (
          <Card className="p-6 border-dashed">
            <EmptyState icon={Package} title="No listings yet" description="Be the first to list inventory or browse the marketplace." />
          </Card>
        )}
      </section>

      {/* AI Assistant CTA */}
      <section>
        <Card className="p-5 bg-gradient-to-br from-secondary to-secondary/50 border-primary/20">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center shrink-0">
              <Sparkles className="w-6 h-6 text-primary-foreground" />
            </div>
            <div className="flex-1">
              <h3 className="font-heading font-bold text-foreground">Need help sourcing?</h3>
              <p className="text-sm text-muted-foreground mt-1">Ask the TreEbay Assistant to find plants, compare growers, or build an RFQ draft — just describe what you need.</p>
              <Button className="mt-3" onClick={() => window.dispatchEvent(new CustomEvent("trebay-ai-open"))}>
                <Sparkles className="w-4 h-4" /> Ask the Assistant
              </Button>
            </div>
          </div>
        </Card>
      </section>
    </div>
    </PullToRefresh>
  );
}

function ProductRow({ products }) {
  return (
    <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
      {products.map((p) => <div key={p.id} className="w-44 shrink-0"><ProductCard product={p} /></div>)}
    </div>
  );
}