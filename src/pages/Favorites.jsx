import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Heart, Store, Loader2 } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import ProductCard from "@/components/ProductCard";

export default function Favorites() {
  const [favs, setFavs] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const list = await base44.entities.Favorite.list("-created_date", 100) || [];
        setFavs(list);
        const productFavs = list.filter((f) => f.target_type === "product");
        const prods = [];
        for (const f of productFavs) {
          try {
            const product = await base44.entities.Product.get(f.target_id);
            if (product && product.is_test_fixture !== true && product.listing_status === "active") prods.push(product);
          } catch {}
        }
        setProducts(prods);
      } catch {}
      finally { setLoading(false); }
    })();
  }, []);

  const vendors = favs.filter((f) => f.target_type === "vendor");

  return (
    <div className="space-y-5">
      <div><h1 className="text-xl font-bold">Favorites</h1><p className="text-sm text-muted-foreground">Saved products and vendors.</p></div>
      {loading ? <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div> : (
        <>
          <section>
            <h2 className="font-semibold mb-3">Products</h2>
            {products.length === 0 ? <EmptyState icon={Heart} title="No saved products" description="Tap the heart on any product to save it here." /> :
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">{products.map((p) => <ProductCard key={p.id} product={p} favorite={true} onToggleFavorite={() => {}} />)}</div>}
          </section>
          <section>
            <h2 className="font-semibold mb-3">Vendors</h2>
            {vendors.length === 0 ? <p className="text-sm text-muted-foreground">No saved vendors.</p> :
              <div className="space-y-2">{vendors.map((v) => <Link key={v.id} to={`/vendor/${v.target_id}`} className="block p-3 rounded-xl border border-border bg-card flex items-center gap-3"><Store className="w-5 h-5 text-primary" /><span className="font-medium text-sm">{v.target_name}</span></Link>)}</div>}
          </section>
        </>
      )}
    </div>
  );
}