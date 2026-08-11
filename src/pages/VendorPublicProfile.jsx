import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Image } from "@/components/ui/image";
import { MapPin, Truck, Package, Store, Heart, Flag, Loader2, MessageSquare, Globe, ShieldCheck } from "lucide-react";
import VerifiedBadge from "@/components/VerifiedBadge";
import StarRating from "@/components/StarRating";
import StatusBadge from "@/components/StatusBadge";
import ProductCard from "@/components/ProductCard";
import ReportDialog from "@/components/ReportDialog";
import EmptyState from "@/components/EmptyState";
import SectionHeader from "@/components/SectionHeader";
import { apiError } from "@/lib/treebay";

export default function VendorPublicProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
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

  const messageGrower = async () => {
    try {
      const { data } = await base44.functions.invoke("startConversation", { type: "product", referenceId: products[0]?.id || "" });
      navigate(`/messages/${data.conversationId}`);
    } catch (e) { toast({ title: "Could not start conversation", description: apiError(e), variant: "destructive" }); }
  };

  if (loading) return (
    <div className="space-y-4">
      <div className="h-32 rounded-2xl bg-muted skeleton-shimmer" />
      <div className="h-24 rounded-2xl bg-muted skeleton-shimmer" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">{[1,2,3].map((i) => <div key={i} className="h-48 rounded-2xl bg-muted skeleton-shimmer" />)}</div>
    </div>
  );
  if (!vendor) return <p className="text-center text-muted-foreground py-16">Vendor not found.</p>;

  return (
    <div className="space-y-5">
      {/* Cover + header */}
      <div className="relative rounded-2xl overflow-hidden border border-border">
        <div className="h-32 md:h-40 bg-gradient-to-br from-primary/20 to-accent/20">
          {vendor.cover_url && <Image src={vendor.cover_url} alt="" fittingType="fill" className="w-full h-full" />}
        </div>
        <div className="px-5 pb-5 -mt-10 relative">
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div className="flex items-end gap-3">
              <div className="w-20 h-20 rounded-2xl bg-card border-4 border-card shadow-sm flex items-center justify-center shrink-0 overflow-hidden">
                {vendor.logo_url ? <Image src={vendor.logo_url} alt={vendor.business_name} fittingType="fill" className="w-full h-full" /> : <Store className="w-9 h-9 text-primary" />}
              </div>
              <div className="pb-1">
                <h1 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">{vendor.business_name}</h1>
                <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5"><MapPin className="w-3.5 h-3.5" /> {vendor.city}, {vendor.state}</p>
                <div className="mt-1"><StarRating value={vendor.rating} count={vendor.review_count} /></div>
              </div>
            </div>
            <div className="flex gap-2 pb-1">
              <Button variant="outline" size="icon" onClick={toggleFav} aria-label="Save vendor"><Heart className={fav ? "fill-rose-500 text-rose-500" : ""} /></Button>
              <Button variant="ghost" size="icon" onClick={() => setReport(true)} aria-label="Report vendor"><Flag className="w-4 h-4" /></Button>
            </div>
          </div>
        </div>
      </div>

      {/* Verification + capabilities */}
      <div className="flex flex-wrap gap-2">
        {vendor.verification_status === "verified" ? <VerifiedBadge status="verified" /> : <StatusBadge status="pending" label="Verification pending" />}
        {vendor.pickup_available && <Badge variant="outline"><Package className="w-3 h-3 mr-1" /> Pickup available</Badge>}
        {vendor.delivery_available && <Badge variant="outline"><Truck className="w-3 h-3 mr-1" /> Delivery available</Badge>}
        {vendor.wholesale_available && <Badge variant="outline">Wholesale available</Badge>}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={messageGrower}><MessageSquare className="w-4 h-4 mr-2" /> Message Grower</Button>
        <Button asChild className="flex-1"><Link to="/marketplace"><Store className="w-4 h-4 mr-2" /> Browse Inventory</Link></Button>
      </div>

      {/* About */}
      <Card className="p-5 card-shadow space-y-3">
        {vendor.description && (
          <div>
            <h2 className="font-heading font-semibold text-sm mb-1.5">About</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{vendor.description}</p>
          </div>
        )}
        {vendor.service_area && (
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-1">Service area</h3>
            <p className="text-sm text-foreground">{vendor.service_area}</p>
          </div>
        )}
        {vendor.website && (
          <a href={vendor.website} target="_blank" rel="noreferrer" className="text-sm text-primary inline-flex items-center gap-1 hover:underline">
            <Globe className="w-3.5 h-3.5" /> {vendor.website}
          </a>
        )}
      </Card>

      {/* Inventory */}
      <div>
        <SectionHeader title={`Available inventory (${products.length})`} />
        {products.length === 0 ? (
          <EmptyState icon={Package} title="No active listings" description="This grower doesn't have any active listings right now." />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mt-3">
            {products.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </div>

      {/* Reviews */}
      {reviews.length > 0 && (
        <div>
          <SectionHeader title={`Reviews (${vendor.review_count})`} />
          <div className="space-y-3 mt-3">
            {reviews.map((r) => (
              <Card key={r.id} className="p-4 card-shadow">
                <div className="flex items-center justify-between"><span className="text-sm font-medium">{r.reviewer_name}</span><StarRating value={r.rating} showNumber={false} /></div>
                {r.review_text && <p className="text-sm text-muted-foreground mt-1.5">{r.review_text}</p>}
              </Card>
            ))}
          </div>
        </div>
      )}

      <ReportDialog open={report} onOpenChange={setReport} targetType="vendor" targetId={id} targetLabel="vendor" />
    </div>
  );
}