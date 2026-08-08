import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Truck, Package, Store, Heart, Flag, Loader2, ArrowLeft } from "lucide-react";
import VerifiedBadge from "@/components/VerifiedBadge";
import StarRating from "@/components/StarRating";
import StatusBadge from "@/components/StatusBadge";
import ProductCard from "@/components/ProductCard";
import ReportDialog from "@/components/ReportDialog";
import EmptyState from "@/components/EmptyState";

export default function VendorPublicProfile() {
  const { id } = useParams();
  const { toast } = useToast();
  const [vendor, setVendor] = useState(null);
  const [products, setProducts] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [fav, setFav] = useState(null);
  const [report, setReport] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const v = await base44.entities.VendorProfile.get(id);
        setVendor(v);
        setProducts(await base44.entities.Product.filter({ vendor_id: id, listing_status: "active" }, "-created_date", 100) || []);
        setReviews(await base44.entities.Review.filter({ vendor_id: id }, "-created_date", 20) || []);
        try { const f = await base44.entities.Favorite.filter({ target_type: "vendor", target_id: id }); setFav(f?.[0] || null); } catch {}
      } catch {}
      finally { setLoading(false); }
    })();
  }, [id]);

  const toggleFav = async () => {
    if (fav) { try { await base44.entities.Favorite.delete(fav.id); setFav(null); } catch {} }
    else { try { const f = await base44.entities.Favorite.create({ target_type: "vendor", target_id: id, target_name: vendor.business_name }); setFav(f); } catch {} }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;
  if (!vendor) return <p className="text-center text-muted-foreground py-16">Vendor not found.</p>;

  return (
    <div className="space-y-5">
      <Link to="/marketplace" className="text-sm text-muted-foreground flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Marketplace</Link>
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center"><Store className="w-7 h-7 text-primary" /></div>
            <div>
              <h1 className="text-xl font-bold">{vendor.business_name}</h1>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" /> {vendor.city}, {vendor.state}</p>
              <div className="mt-1 flex items-center gap-2"><StarRating value={vendor.rating} count={vendor.review_count} /></div>
            </div>
          </div>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" onClick={toggleFav} aria-label="Save vendor"><Heart className={fav ? "fill-rose-500 text-rose-500" : ""} /></Button>
            <Button variant="ghost" size="icon" onClick={() => setReport(true)} aria-label="Report vendor"><Flag className="w-4 h-4" /></Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {vendor.verification_status === "verified" ? <VerifiedBadge status="verified" /> : <StatusBadge status="pending" label="Verification pending" />}
          {vendor.pickup_available && <Badge variant="outline"><Package className="w-3 h-3 mr-1" /> Pickup</Badge>}
          {vendor.delivery_available && <Badge variant="outline"><Truck className="w-3 h-3 mr-1" /> Delivery</Badge>}
          {vendor.wholesale_available && <Badge variant="outline">Wholesale</Badge>}
        </div>
        {vendor.description && <p className="text-sm text-muted-foreground mt-3">{vendor.description}</p>}
        {vendor.service_area && <p className="text-xs text-muted-foreground mt-2">Service area: {vendor.service_area}</p>}
        {vendor.website && <a href={vendor.website} target="_blank" rel="noreferrer" className="text-sm text-primary mt-2 inline-block">{vendor.website}</a>}
      </Card>

      <section>
        <h2 className="font-semibold mb-3">Active inventory ({products.length})</h2>
        {products.length === 0 ? <EmptyState icon={Package} title="No active listings" /> :
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">{products.map((p) => <ProductCard key={p.id} product={p} />)}</div>}
      </section>

      {reviews.length > 0 && (
        <section>
          <h2 className="font-semibold mb-3">Reviews ({vendor.review_count})</h2>
          <div className="space-y-3">
            {reviews.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex items-center justify-between"><span className="text-sm font-medium">{r.reviewer_name}</span><StarRating value={r.rating} showNumber={false} /></div>
                {r.review_text && <p className="text-sm text-muted-foreground mt-1">{r.review_text}</p>}
              </Card>
            ))}
          </div>
        </section>
      )}

      <ReportDialog open={report} onOpenChange={setReport} targetType="vendor" targetId={id} targetLabel="vendor" />
    </div>
  );
}