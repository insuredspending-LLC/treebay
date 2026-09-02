import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAppUser } from "@/hooks/useAppUser";
import { Image } from "@/components/ui/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Heart, MessageSquare, FileText, ShoppingCart, ShieldCheck, Truck, Package, Leaf, ChevronLeft, ChevronRight, Loader2, Store, AlertCircle } from "lucide-react";
import { formatCurrency, formatNumber, priceForQuantity, apiError } from "@/lib/treebay";
import VerifiedBadge from "@/components/VerifiedBadge";
import StarRating from "@/components/StarRating";
import ReportDialog from "@/components/ReportDialog";
import StatusBadge from "@/components/StatusBadge";
import SectionHeader from "@/components/SectionHeader";

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { buyerProfile } = useAppUser();
  const { toast } = useToast();
  const [product, setProduct] = useState(null);
  const [vendor, setVendor] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [fav, setFav] = useState(null);
  const [imgIdx, setImgIdx] = useState(0);
  const [qty, setQty] = useState(1);
  const [projects, setProjects] = useState([]);
  const [addProject, setAddProject] = useState("");
  const [report, setReport] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const p = await base44.entities.Product.get(id);
        if (!p || p.is_test_fixture === true || p.listing_status !== "active") {
          setProduct(null);
          return;
        }
        setProduct(p);
        setFav(await (async () => { try { const f = await base44.entities.Favorite.filter({ target_type: "product", target_id: id }); return f?.[0] || null; } catch { return null; } })());
        if (p?.vendor_id) { try { const { data } = await base44.functions.invoke("getPublicVendorProfiles", { vendorIds: [p.vendor_id] }); setVendor(data?.vendors?.[p.vendor_id] || null); } catch {} }
        try { const r = await base44.entities.Review.filter({ vendor_id: p.vendor_id }, "-created_date", 5); setReviews(r || []); } catch {}
        try { const pr = await base44.entities.Project.list("-created_date", 50); setProjects(pr || []); } catch {}
      } catch { /* */ }
      finally { setLoading(false); }
    })();
  }, [id]);

  if (loading) return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 lg:grid-cols-[1.08fr_.92fr] gap-7 lg:gap-12">
        <div className="aspect-square rounded-2xl bg-muted skeleton-shimmer" />
        <div className="space-y-4">
          <div className="h-8 w-2/3 rounded-lg bg-muted skeleton-shimmer" />
          <div className="h-4 w-1/2 rounded-lg bg-muted skeleton-shimmer" />
          <div className="h-24 rounded-2xl bg-muted skeleton-shimmer" />
          <div className="h-12 rounded-2xl bg-muted skeleton-shimmer" />
        </div>
      </div>
    </div>
  );
  if (!product) return <div className="py-20 text-center text-muted-foreground">This listing is no longer available.</div>;

  const imgs = product.images?.length ? product.images : [];
  const unitPrice = priceForQuantity(product, qty);
  const showReqQuote = unitPrice === null;
  const subtotal = showReqQuote ? null : unitPrice * qty;
  const sellerVerified = vendor?.verification_status === "verified";
  const sellerActive = !!vendor && vendor.verification_status !== "suspended" && !["restricted", "suspended"].includes(vendor.selling_status || "active");
  const canOrder = sellerActive && product.listing_status === "active" && product.quantity_available > 0 && !showReqQuote && qty <= product.quantity_available;

  const toggleFav = async () => {
    if (fav) {
      const prev = fav;
      setFav(null);
      try { await base44.entities.Favorite.delete(prev.id); }
      catch { setFav(prev); }
    } else {
      const temp = { id: "temp-" + Date.now(), target_type: "product", target_id: id, target_name: product.common_name };
      setFav(temp);
      try { const f = await base44.entities.Favorite.create({ target_type: "product", target_id: id, target_name: product.common_name }); setFav(f); }
      catch { setFav(null); }
    }
  };

  const addToProject = async () => {
    if (!addProject) { toast({ title: "Select a project", variant: "destructive" }); return; }
    const proj = projects.find((p) => p.id === addProject);
    try {
      const items = proj.items ? [...proj.items] : [];
      items.push({ product_id: id, common_name: product.common_name, botanical_name: product.botanical_name, quantity: qty, size_spec: [product.caliper, product.container_size].filter(Boolean).join(" · "), unit_price: product.unit_price });
      await base44.entities.Project.update(addProject, { items });
      toast({ title: "Added to project", description: `${qty} × ${product.common_name} → ${proj.name}` });
    } catch (e) { toast({ title: "Could not add", description: e.message, variant: "destructive" }); }
  };

  const startConversation = async () => {
    try {
      const { data } = await base44.functions.invoke("startConversation", { type: "product", referenceId: id });
      navigate(`/messages/${data.conversationId}`);
    } catch (e) { toast({ title: "Could not start conversation", description: apiError(e), variant: "destructive" }); }
  };

  const requestQuote = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const { data } = await base44.functions.invoke("createRFQ", {
        projectId: "",
        delivery_city: buyerProfile?.city || "", delivery_state: buyerProfile?.state || "", delivery_zip: buyerProfile?.zip_code || "",
        requested_delivery_date: "", quote_deadline: "",
        notes: `Inquiry on listing: ${product.common_name}`,
        substitution_allowed: false, delivery_required: product.delivery_eligible,
        items: [{ common_name: product.common_name, botanical_name: product.botanical_name, quantity: qty, size_spec: [product.caliper, product.container_size].filter(Boolean).join(" · "), notes: "" }],
      });
      toast({ title: "Quote request sent", description: "The vendor will respond with pricing." });
      navigate(`/rfqs/${data.rfq.id}`);
    } catch (e) { toast({ title: "Could not send", description: apiError(e), variant: "destructive" }); }
    finally { setSubmitting(false); }
  };

  const buyNow = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const { data } = await base44.functions.invoke("calculateCheckout", {
        productId: id, quantity: qty,
        destination: { city: buyerProfile?.city || "", state: buyerProfile?.state || "", zip: buyerProfile?.zip_code || "" },
      });
      navigate(`/checkout?quote=${data.checkoutQuote.id}`);
    } catch (e) { toast({ title: "Could not start checkout", description: apiError(e), variant: "destructive" }); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-8 md:space-y-10">
      <div className="flex items-center justify-between border-b border-border/60 pb-4">
        <Link to="/marketplace" className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-primary"><ChevronLeft className="h-4 w-4" /> Back to marketplace</Link>
        <Button variant="ghost" size="sm" onClick={() => setReport(true)} className="rounded-full text-muted-foreground">Report listing</Button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-[1.08fr_.92fr] gap-7 lg:gap-12">
        {/* Image gallery */}
        <div className="space-y-4 md:sticky md:top-28 md:self-start">
          <div className="rounded-[2rem] overflow-hidden border border-border/60 bg-muted aspect-[4/5] relative">
            {imgs.length ? (
              <Image src={imgs[imgIdx]} alt={product.common_name} fittingType="fill" className="w-full h-full" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/40 gap-2">
                <Package className="w-16 h-16" />
                <span className="text-sm">No photo available</span>
              </div>
            )}
            {imgs.length > 1 && (
              <>
                <button onClick={() => setImgIdx((i) => (i - 1 + imgs.length) % imgs.length)} className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/80 backdrop-blur flex items-center justify-center shadow-sm no-tap-highlight"><ChevronLeft className="w-5 h-5" /></button>
                <button onClick={() => setImgIdx((i) => (i + 1) % imgs.length)} className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/80 backdrop-blur flex items-center justify-center shadow-sm no-tap-highlight"><ChevronRight className="w-5 h-5" /></button>
                <div className="absolute bottom-3 inset-x-0 flex justify-center gap-1.5">{imgs.map((_, i) => <span key={i} className={"w-1.5 h-1.5 rounded-full transition " + (i === imgIdx ? "bg-white w-4" : "bg-white/50")} />)}</div>
              </>
            )}
          </div>
          {imgs.length > 1 && (
            <div className="flex gap-2 overflow-x-auto scrollbar-hide">
              {imgs.map((src, i) => (
                <button key={i} onClick={() => setImgIdx(i)} className={"w-20 h-20 rounded-xl overflow-hidden border-2 shrink-0 no-tap-highlight " + (i === imgIdx ? "border-primary" : "border-border")}>
                  <Image src={src} alt="" fittingType="fill" className="w-full h-full" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product info */}
        <div className="space-y-6">
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="font-display text-4xl md:text-5xl font-semibold leading-none text-foreground">{product.common_name}</h1>
                {product.botanical_name && <p className="font-display text-xl italic text-muted-foreground mt-3">{product.botanical_name}</p>}
                {product.cultivar && <p className="text-sm text-muted-foreground mt-0.5">Cultivar: {product.cultivar}</p>}
              </div>
              <Button variant="outline" size="icon" onClick={toggleFav} aria-label="Save" className="shrink-0">
                <Heart className={fav ? "fill-rose-500 text-rose-500" : ""} />
              </Button>
            </div>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {product.listing_status !== "active" && <StatusBadge status={product.listing_status} />}
              {product.native_status && <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200"><Leaf className="w-3 h-3 mr-1" /> Native</Badge>}
              {product.foliage_type && product.foliage_type !== "n/a" && <Badge variant="outline" className="capitalize">{product.foliage_type}</Badge>}
              {product.pickup_eligible && <Badge variant="outline"><Package className="w-3 h-3 mr-1" /> Pickup</Badge>}
              {product.delivery_eligible && <Badge variant="outline"><Truck className="w-3 h-3 mr-1" /> Delivery</Badge>}
            </div>
          </div>

          {/* Pricing card */}
          <Card className="rounded-[1.75rem] border-border/65 p-6 md:p-7 card-shadow">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-4xl font-heading font-bold tracking-tight text-primary">{showReqQuote ? "Request Quote" : formatCurrency(product.unit_price)}<span className="text-sm font-normal text-muted-foreground"> /ea</span></p>
                <p className="text-sm text-muted-foreground mt-1">{formatNumber(product.quantity_available)} available · min order {product.minimum_order_quantity || 1}</p>
              </div>
              {sellerVerified && <VerifiedBadge status="verified" />}
            </div>
            {(product.bulk_price_tiers || []).length > 0 && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Bulk pricing</p>
                <div className="space-y-1.5">
                  {(product.bulk_price_tiers || []).slice().sort((a, b) => a.min_qty - b.min_qty).map((t, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t.min_qty}{t.max_qty ? `–${t.max_qty}` : "+"} units</span>
                      <span className="font-medium">{t.request_quote ? "Request quote" : formatCurrency(t.unit_price) + "/ea"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Quantity + CTAs */}
          <div className="space-y-3">
            <div className="flex items-end gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">Quantity</label>
                <Input type="number" min={product.minimum_order_quantity || 1} max={product.quantity_available} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value)))} className="w-28 h-12 rounded-xl bg-card" />
              </div>
              <div className="flex-1 text-right">
                {!showReqQuote && <p className="text-xs text-muted-foreground">Subtotal</p>}
                <p className="text-xl font-heading font-bold text-foreground">{showReqQuote ? "—" : formatCurrency(subtotal)}</p>
              </div>
            </div>
            {qty > product.quantity_available && product.quantity_available > 0 && (
              <p className="text-xs text-rose-600 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> Only {product.quantity_available} available. Reduce quantity or request a quote.</p>
            )}

            <Button onClick={buyNow} disabled={!canOrder || submitting} size="lg" className="w-full h-14 rounded-full text-base">
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShoppingCart className="w-4 h-4 mr-2" />}
              {!sellerActive ? "Seller unavailable" : showReqQuote ? "Request quote to buy" : "Start Order"}
            </Button>
            {!sellerActive && <p className="text-xs text-amber-700 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> This seller account is not currently active for new orders.</p>}
            {sellerActive && !sellerVerified && <p className="text-xs text-muted-foreground flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Seller is active. Tree Marketplace verification badge is still pending.</p>}

            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={requestQuote} disabled={submitting} className="h-11">
                {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />} Request Quote
              </Button>
              <Button variant="outline" onClick={startConversation} className="h-11"><MessageSquare className="w-4 h-4 mr-2" /> Message Seller</Button>
            </div>
          </div>

          {/* Add to project */}
          <Card className="rounded-[1.5rem] border-border/65 bg-secondary/25 p-5 space-y-3">
            <label className="text-xs text-muted-foreground font-medium">Add to a project</label>
            <div className="flex gap-2">
              <Select value={addProject} onValueChange={setAddProject}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
              <Button variant="secondary" onClick={addToProject} className="h-11">Add</Button>
            </div>
            <Button asChild variant="link" className="h-auto p-0 text-sm"><Link to="/projects">+ Create a project</Link></Button>
          </Card>
        </div>
      </div>

      {/* Grower card */}
      {vendor && (
        <Card className="rounded-[1.75rem] border-border/65 p-6 md:p-7 card-shadow">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <Link to={`/vendor/${vendor.id}`} className="flex items-center gap-3 no-tap-highlight">
              <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center shrink-0 overflow-hidden">
                {vendor.logo_url ? <Image src={vendor.logo_url} alt={vendor.business_name} fittingType="fill" className="w-full h-full rounded-xl" /> : <Store className="w-7 h-7 text-primary" />}
              </div>
              <div>
                <p className="font-heading font-semibold text-foreground flex items-center gap-2">{vendor.business_name}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" /> {vendor.city}, {vendor.state}</p>
                <div className="mt-1"><StarRating value={vendor.rating} count={vendor.review_count} /></div>
              </div>
            </Link>
            <div className="flex items-center gap-2">
              {vendor.verification_status === "verified" ? <VerifiedBadge status="verified" /> : <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50"><ShieldCheck className="w-3 h-3 mr-1" /> Verification pending</Badge>}
              <Button variant="outline" size="sm" asChild><Link to={`/vendor/${vendor.id}`}>View Storefront</Link></Button>
            </div>
          </div>
        </Card>
      )}

      {/* Specifications */}
      <div className="grid md:grid-cols-2 gap-6">
        <SpecBlock title="Specifications" specs={[
          ["Container", product.container_size], ["Box", product.box_size], ["Caliper", product.caliper],
          ["Current height", product.current_height], ["Approx. spread", product.approximate_spread], ["SKU", product.sku],
        ]} />
        <SpecBlock title="Plant characteristics" specs={[
          ["Native", product.native_status ? "Yes" : ""], ["Foliage", product.foliage_type],
          ["USDA zones", product.usda_zones], ["Sun", product.sun_requirement], ["Water", product.water_requirement],
          ["Mature height", product.mature_height], ["Mature spread", product.mature_spread],
        ]} />
      </div>

      {product.description && (
        <Card className="rounded-[1.75rem] border-border/65 p-6 md:p-7 card-shadow">
          <h2 className="font-heading font-semibold mb-2">Description</h2>
          <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{product.description}</p>
        </Card>
      )}

      {reviews.length > 0 && (
        <div>
          <SectionHeader title="Vendor reviews" />
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

      <ReportDialog open={report} onOpenChange={setReport} targetType="listing" targetId={id} targetLabel="listing" />
    </div>
  );
}

function SpecBlock({ title, specs }) {
  const rows = specs.filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (!rows.length) return null;
  return (
    <Card className="rounded-[1.75rem] border-border/65 p-6 md:p-7 card-shadow">
      <h2 className="font-display text-2xl font-semibold mb-5">{title}</h2>
      <dl className="grid grid-cols-2 gap-y-5 gap-x-6 text-sm">
        {rows.map(([k, v]) => <div key={k}><dt className="text-muted-foreground text-xs">{k}</dt><dd className="font-medium mt-0.5">{v}</dd></div>)}
      </dl>
    </Card>
  );
}