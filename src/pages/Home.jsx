import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAppUser } from "@/hooks/useAppUser";
import { CATEGORIES, approxDistance } from "@/lib/treebay";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowRight, FileText, MapPin, Search, Sparkles, Store } from "lucide-react";
import ProductCard from "@/components/ProductCard";
import SkeletonCard from "@/components/SkeletonCard";
import SectionHeader from "@/components/SectionHeader";
import PullToRefresh from "@/components/PullToRefresh";
import VerifiedBadge from "@/components/VerifiedBadge";

const COLLECTIONS = [
  { name: "Trees", subtitle: "Structure, shade, and character", image: "/marketplace/category-trees.webp" },
  { name: "Native Plants", subtitle: "Built for the local landscape", image: "/marketplace/category-native.webp" },
  { name: "Palms", subtitle: "A bold architectural statement", image: "/marketplace/category-palms.webp" },
];

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
  const myCity = buyerProfile?.city && buyerProfile?.state ? buyerProfile.city + ", " + buyerProfile.state : null;

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [products, vendorResponse] = await Promise.all([
        base44.entities.Product.filter({ listing_status: "active", is_test_fixture: false }, "-created_date", 60),
        base44.functions.invoke("getPublicVendorProfiles", { verified: true, limit: 12 }),
      ]);
      const list = products || [];
      setFeatured(list.filter((product) => product.featured).slice(0, 8));
      setRecent(list.slice(0, 8));
      setBulk(list.filter((product) => product.bulk_price_tiers?.length > 0).slice(0, 8));
      if (myCity) {
        const withDistance = list.map((product) => ({ product, distance: approxDistance(myCity, product.vendor_city + ", " + product.vendor_state) }));
        setNear(withDistance.filter((item) => item.distance !== null).sort((a, b) => a.distance - b.distance).slice(0, 8).map((item) => item.product));
      } else {
        setNear(list.slice(0, 8));
      }
      setGrowers(vendorResponse?.data?.vendors || []);
    } catch { /* The page remains usable when inventory is unavailable. */ }
    finally { if (!silent) setLoading(false); }
  };

  useEffect(() => { load(); }, [myCity]);

  const search = (event) => {
    event.preventDefault();
    navigate("/marketplace?q=" + encodeURIComponent(q.trim()));
  };
  const inventory = myCity && near.length ? near : featured.length ? featured : recent;

  return (
    <PullToRefresh onRefresh={() => load(true)}>
      <div className="space-y-12 md:space-y-16">
        <section className="relative overflow-hidden rounded-[2rem] bg-[#10251a] text-white">
          <img src="/marketplace/tree-marketplace-nursery-hero.webp" alt="Rows of specimen trees at a wholesale nursery" className="absolute inset-0 h-full w-full object-cover object-[65%_50%]" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(9,28,18,.94),rgba(9,28,18,.70)_52%,rgba(9,28,18,.15))]" />
          <div className="relative max-w-3xl p-7 py-12 sm:p-10 md:p-14">
            <p className="text-[10px] font-bold uppercase tracking-[.24em] text-[#ccddbb]">Your next project starts here</p>
            <h1 className="mt-5 max-w-[13ch] font-display text-[2.65rem] font-semibold leading-[.97] tracking-tight sm:text-6xl md:text-7xl">
              Good projects start with great plants.
            </h1>
            <p className="mt-5 max-w-lg text-sm leading-6 text-white/[0.68] md:text-base">Source inventory, compare growers, and keep the work moving.</p>

            <form onSubmit={search} className="mt-7 flex max-w-xl gap-2 rounded-[1.15rem] bg-white p-2 shadow-xl shadow-black/20">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#657168]" />
                <Input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Trees, plants, sizes, suppliers…" aria-label="Search marketplace" className="h-12 border-0 bg-transparent pl-10 text-[#17291e] shadow-none focus-visible:ring-0" />
              </div>
              <Button type="submit" className="h-12 rounded-xl px-5">Search</Button>
            </form>

            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/65">
              {myCity && <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Sourcing from {myCity}</span>}
              <Link to="/projects" className="inline-flex items-center gap-1.5 font-medium text-[#dce9c9] hover:text-white">Need project pricing? <ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>
          </div>
        </section>

        <section>
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="editorial-kicker">Shop by category</p>
              <h2 className="mt-2 font-display text-3xl font-semibold md:text-4xl">Find your landscape’s next layer.</h2>
            </div>
            <Link to="/marketplace" className="inline-flex items-center gap-2 text-sm font-semibold text-primary">All inventory <ArrowRight className="h-4 w-4" /></Link>
          </div>

          <div className="mt-6 flex gap-4 overflow-x-auto pb-2 scrollbar-hide sm:grid sm:grid-cols-3">
            {COLLECTIONS.map((collection) => (
              <Link key={collection.name} to={"/marketplace?category=" + encodeURIComponent(collection.name)} className="group relative h-64 w-[82%] shrink-0 overflow-hidden sm:w-auto rounded-[1.75rem] bg-[#263c2c] sm:h-72">
                <img src={collection.image} alt="" className="image-zoom absolute inset-0 h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#07170d]/85 via-[#07170d]/5 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-6 text-white">
                  <div><h3 className="text-xl font-bold">{collection.name}</h3><p className="mt-1 text-xs text-white/65">{collection.subtitle}</p></div>
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </div>
              </Link>
            ))}
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto scrollbar-hide">
            {CATEGORIES.map((category) => (
              <Link key={category.name} to={"/marketplace?category=" + encodeURIComponent(category.name)} className="shrink-0 rounded-full border border-border/80 bg-card px-4 py-2 text-xs font-semibold text-muted-foreground transition hover:border-primary/30 hover:text-primary">{category.name}</Link>
            ))}
          </div>
        </section>

        <section>
          <SectionHeader title={myCity && near.length ? "Available near you" : "Explore current inventory"} subtitle={myCity && near.length ? "Growers closest to " + myCity : "Fresh listings from across the marketplace"} to="/marketplace" actionLabel="View marketplace" />
          {loading ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4"><SkeletonCard count={4} /></div>
          ) : inventory.length > 0 ? (
            <ProductRow products={inventory} />
          ) : (
            <div className="rounded-[1.75rem] border border-border/70 bg-card p-7 sm:flex sm:items-center sm:justify-between sm:gap-6 md:p-9">
              <div className="max-w-2xl">
                <p className="editorial-kicker">Inventory is growing</p>
                <h3 className="mt-3 font-display text-3xl font-semibold">Tell growers what you’re looking for.</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">There are no live listings to show yet. A project request lets suppliers respond with the plants, quantities, and terms you need.</p>
              </div>
              <div className="mt-5 flex flex-col gap-2 sm:mt-0"><Button className="shrink-0 rounded-full" asChild><Link to="/projects">Request quotes <ArrowRight className="h-4 w-4" /></Link></Button><Button variant="outline" className="rounded-full" asChild><Link to="/stripe-sandbox">Open test marketplace</Link></Button></div>
            </div>
          )}
        </section>

        <section className="grid overflow-hidden rounded-[2rem] bg-[#ede8dd] text-[#152119] lg:grid-cols-[1fr_1fr]">
          <div className="p-7 sm:p-10 md:p-12">
            <p className="editorial-kicker">Built for bigger plant lists</p>
            <h2 className="mt-4 max-w-lg font-display text-4xl font-semibold leading-none md:text-5xl">One request.<br />Better options.</h2>
            <p className="mt-5 max-w-lg text-sm leading-6 text-[#5c675f]">Create a project, organize the plants you need, and compare grower quotes without starting over in every conversation.</p>
            <Button className="mt-7 rounded-full" asChild><Link to="/projects">Start a project request <FileText className="h-4 w-4" /></Link></Button>
          </div>
          <div className="flex flex-col justify-center border-t border-[#152119]/10 px-7 py-6 lg:border-l lg:border-t-0 lg:px-12">
            {["Organize quantities and specifications", "Compare grower pricing and availability", "Keep order details attached to the project"].map((text, index) => (
              <div key={text} className="flex items-center gap-4 border-b border-[#152119]/10 py-5 last:border-0">
                <span className="font-mono text-xs text-[#778175]">{"0" + (index + 1)}</span>
                <span className="text-sm font-semibold">{text}</span>
              </div>
            ))}
          </div>
        </section>

        {!loading && bulk.length > 0 && (
          <section>
            <SectionHeader title="Volume opportunities" subtitle="Listings with bulk pricing from participating growers" to="/marketplace" />
            <ProductRow products={bulk} />
          </section>
        )}

        {!loading && growers.length > 0 && (
          <section>
            <SectionHeader title="Meet the growers" subtitle="Verified nurseries and tree farms" to="/marketplace" actionLabel="Find growers" />
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {growers.slice(0, 4).map((grower) => (
                <Link key={grower.id} to={"/vendor/" + grower.id} className="rounded-[1.5rem] border border-border/70 bg-card p-5 card-shadow-hover">
                  <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-secondary"><Store className="h-5 w-5 text-primary" /></div>
                  <p className="line-clamp-1 text-sm font-bold">{grower.business_name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{[grower.city, grower.state].filter(Boolean).join(", ")}</p>
                  <VerifiedBadge status="verified" className="mt-3" />
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="flex flex-col gap-4 border-t border-border/70 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-primary" />
            <p className="text-sm text-muted-foreground">Need a hand finding the right plants or drafting an RFQ?</p>
          </div>
          <Button variant="outline" className="rounded-full bg-card" onClick={() => window.dispatchEvent(new CustomEvent("trebay-ai-open"))}>Open sourcing assistant <ArrowRight className="h-4 w-4" /></Button>
        </div>
      </div>
    </PullToRefresh>
  );
}

function ProductRow({ products }) {
  return (
    <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-5 scrollbar-hide">
      {products.map((product) => <div key={product.id} className="w-[240px] shrink-0 sm:w-[280px]"><ProductCard product={product} /></div>)}
    </div>
  );
}