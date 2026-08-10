import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAppUser } from "@/hooks/useAppUser";
import { CATEGORIES, approxDistance } from "@/lib/treebay";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Image } from "@/components/ui/image";
import { Search, MapPin, Package, Truck, FileText, ArrowRight, Leaf } from "lucide-react";
import ProductCard from "@/components/ProductCard";
import PullToRefresh from "@/components/PullToRefresh";

export default function Home() {
  const { buyerProfile, accountType } = useAppUser();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [popular, setPopular] = useState([]);
  const [near, setNear] = useState([]);
  const [loading, setLoading] = useState(true);

  const myCity = buyerProfile ? `${buyerProfile.city}, ${buyerProfile.state}` : null;

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const all = await base44.entities.Product.filter({ listing_status: "active" }, "-created_date", 60);
      const list = all || [];
      setPopular(list.filter((p) => p.featured).concat(list).slice(0, 8));
      if (myCity) {
        const withDist = list.map((p) => ({ p, d: approxDistance(myCity, `${p.vendor_city}, ${p.vendor_state}`) }));
        setNear(withDist.filter((x) => x.d !== null).sort((a, b) => a.d - b.d).slice(0, 8).map((x) => x.p));
      } else {
        setNear(list.slice(0, 8));
      }
    } catch (e) { /* */ }
    finally { if (!silent) setLoading(false); }
  };
  useEffect(() => { load(); }, [myCity]);

  const search = (e) => { e.preventDefault(); navigate(`/marketplace?q=${encodeURIComponent(q)}`); };

  return (
    <PullToRefresh onRefresh={() => load(true)}>
    <div className="space-y-8">
      <section className="rounded-3xl bg-gradient-to-br from-primary to-[#2d6a3e] text-primary-foreground p-6 md:p-8 -mx-1">
        <h1 className="text-2xl md:text-3xl font-extrabold leading-tight">Find plants. Compare prices.<br />Get them delivered.</h1>
        <p className="text-primary-foreground/80 mt-2 text-sm">The marketplace for plants, trees, and delivery.</p>
        <form onSubmit={search} className="mt-5 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search trees, plants, nurseries..." className="pl-10 h-12 bg-white text-foreground border-0" />
          </div>
          <Button type="submit" className="h-12 bg-white text-primary hover:bg-white/90 font-semibold">Search</Button>
        </form>
        {myCity && <p className="text-xs text-primary-foreground/70 mt-3 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> Showing inventory near {myCity}</p>}
      </section>

      <section>
        <h2 className="text-lg font-bold mb-3">Shop by category</h2>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {CATEGORIES.map((c) => (
            <Link key={c.name} to={`/marketplace?category=${encodeURIComponent(c.name)}`}
              className="flex flex-col items-center gap-2 p-3 rounded-2xl border border-border bg-card hover:border-primary/40 hover:shadow-sm transition">
              <div className="w-11 h-11 rounded-xl bg-secondary flex items-center justify-center"><Leaf className="w-5 h-5 text-primary" /></div>
              <span className="text-xs font-medium text-center leading-tight">{c.name}</span>
            </Link>
          ))}
        </div>
      </section>

      {myCity && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold">Available near you</h2>
            <Link to="/marketplace" className="text-sm text-primary font-medium flex items-center gap-1">View all <ArrowRight className="w-4 h-4" /></Link>
          </div>
          <ProductRow products={near} loading={loading} />
        </section>
      )}

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">Popular inventory</h2>
          <Link to="/marketplace" className="text-sm text-primary font-medium flex items-center gap-1">Browse <ArrowRight className="w-4 h-4" /></Link>
        </div>
        <ProductRow products={popular} loading={loading} />
      </section>

      <section className="grid sm:grid-cols-2 gap-4">
        <Card className="p-5 border-border">
          <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center mb-3"><FileText className="w-5 h-5 text-primary" /></div>
          <h3 className="font-semibold">Buying in bulk?</h3>
          <p className="text-sm text-muted-foreground mt-1">Post your project and let qualified suppliers provide competitive pricing.</p>
          <Button asChild className="mt-4 w-full"><Link to="/projects">Request quotes</Link></Button>
        </Card>
        <Card className="p-5 border-border">
          <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center mb-3"><Truck className="w-5 h-5 text-primary" /></div>
          <h3 className="font-semibold">Need delivery?</h3>
          <p className="text-sm text-muted-foreground mt-1">Arrange transportation for eligible orders during checkout.</p>
          <Button asChild variant="outline" className="mt-4 w-full"><Link to="/marketplace">Delivery options</Link></Button>
        </Card>
      </section>
    </div>
    </PullToRefresh>
  );
}

function ProductRow({ products, loading }) {
  if (loading) return <div className="flex gap-3 overflow-x-auto scrollbar-hide">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="w-44 shrink-0 rounded-2xl border border-border bg-card h-64 animate-pulse" />)}</div>;
  if (!products.length) return <p className="text-sm text-muted-foreground py-6">No inventory available yet.</p>;
  return (
    <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
      {products.map((p) => <div key={p.id} className="w-44 shrink-0"><ProductCard product={p} /></div>)}
    </div>
  );
}