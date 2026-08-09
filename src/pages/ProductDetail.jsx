import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAppUser } from "@/hooks/useAppUser";
import { Image } from "@/components/ui/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/components/ui/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Heart, MessageSquare, FileText, ShoppingCart, ShieldCheck, Truck, Package, Leaf, ChevronLeft, ChevronRight } from "lucide-react";
import { formatCurrency, formatNumber, priceForQuantity, approxDistance, createNotification } from "@/lib/treebay";
import VerifiedBadge from "@/components/VerifiedBadge";
import StarRating from "@/components/StarRating";
import ReportDialog from "@/components/ReportDialog";
import StatusBadge from "@/components/StatusBadge";

export default function ProductDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { buyerProfile, vendorProfiles } = useAppUser();
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

  useEffect(() => {
    (async () => {
      try {
        const p = await base44.entities.Product.get(id);
        setProduct(p);
        setFav(await (async () => { try { const f = await base44.entities.Favorite.filter({ target_type: "product", target_id: id }); return f?.[0] || null; } catch { return null; } })());
        if (p?.vendor_id) { try { const v = await base44.entities.VendorProfile.get(p.vendor_id); setVendor(v); } catch {} }
        try { const r = await base44.entities.Review.filter({ vendor_id: p.vendor_id }, "-created_date", 5); setReviews(r || []); } catch {}
        try { const pr = await base44.entities.Project.list("-created_date", 50); setProjects(pr || []); } catch {}
      } catch (e) { /* */ }
      finally { setLoading(false); }
    })();
  }, [id]);

  if (loading) return <div className="flex justify-center py-20"><div className="w-7 h-7 border-4 border-secondary border-t-primary rounded-full animate-spin" /></div>;
  if (!product) return <div className="py-20 text-center text-muted-foreground">This listing is no longer available.</div>;

  const myCity = buyerProfile ? `${buyerProfile.city}, ${buyerProfile.state}` : null;
  const dist = myCity ? approxDistance(myCity, `${product.vendor_city}, ${product.vendor_state}`) : null;
  const imgs = product.images?.length ? product.images : [];
  const unitPrice = priceForQuantity(product, qty);
  const showReqQuote = unitPrice === null;
  const subtotal = showReqQuote ? null : unitPrice * qty;
  const canOrder = product.listing_status === "active" && product.quantity_available > 0 && !showReqQuote && qty <= product.quantity_available;

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
      const me = await base44.auth.me();
      const conv = await base44.entities.Conversation.create({
        type: "product", reference_id: id, reference_label: product.common_name,
        buyer_id: me.id, vendor_owner_id: product.vendor_owner_id, vendor_id: product.vendor_id,
      });
      navigate(`/messages/${conv.id}`);
    } catch (e) { toast({ title: "Could not start conversation", description: e.message, variant: "destructive" }); }
  };

  const requestQuote = async () => {
    try {
      const me = await base44.auth.me();
      const rfq = await base44.entities.RFQ.create({
        buyer_id: me.id, project_id: "",
        delivery_city: buyerProfile?.city || "", delivery_state: buyerProfile?.state || "", delivery_zip: buyerProfile?.zip_code || "",
        requested_delivery_date: "", quote_deadline: "",
        notes: `Inquiry on listing: ${product.common_name}`,
        substitution_allowed: false, delivery_required: product.delivery_eligible, status: "open",
        items: [{ common_name: product.common_name, botanical_name: product.botanical_name, quantity: qty, size_spec: [product.caliper, product.container_size].filter(Boolean).join(" · "), notes: "" }],
      });
      await createNotification(product.vendor_owner_id, "new_rfq", "New RFQ received", `${qty} × ${product.common_name}`, "rfq", rfq.id);
      toast({ title: "Quote request sent", description: "The vendor will respond with pricing." });
      navigate(`/rfqs/${rfq.id}`);
    } catch (e) { toast({ title: "Could not send", description: e.message, variant: "destructive" }); }
  };

  const buyNow = async () => {
    try {
      const me = await base44.auth.me();
      const orderNumber = "TB-" + Math.random().toString(36).slice(2, 8).toUpperCase();
      const lineName = `${product.common_name} (${[product.caliper, product.container_size].filter(Boolean).join(" · ")})`;
      await base44.entities.Order.create({
        order_number: orderNumber, buyer_id: me.id, vendor_id: product.vendor_id, vendor_owner_id: product.vendor_owner_id,
        vendor_name: product.vendor_name, rfq_id: "", quote_id: "",
        items: [{ line_name: lineName, quantity: qty, unit_price: unitPrice, subtotal }],
        subtotal, delivery_charges: 0, taxes: 0, platform_fees: 0, total: subtotal,
        fulfillment_method: product.pickup_eligible ? "pickup" : "vendor_delivery",
        destination_city: buyerProfile?.city || "", destination_state: buyerProfile?.state || "", destination_zip: buyerProfile?.zip_code || "",
        payment_status: "pending", order_status: "pending",
      });
      await createNotification(product.vendor_owner_id, "new_order", "New order received", orderNumber, "order", "");
      await base44.entities.Product.update(product.id, { quantity_available: Math.max(0, product.quantity_available - qty) });
      toast({ title: "Order placed", description: `Order ${orderNumber} created.` });
      navigate("/orders");
    } catch (e) { toast({ title: "Could not place order", description: e.message, variant: "destructive" }); }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => setReport(true)}>Report listing</Button>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="rounded-2xl overflow-hidden border border-border bg-muted aspect-square relative">
          {imgs.length ? (
            <Image src={imgs[imgIdx]} alt={product.common_name} fittingType="fill" className="w-full h-full" />
          ) : <div className="w-full h-full flex items-center justify-center text-muted-foreground">No photo</div>}
          {imgs.length > 1 && (
            <>
              <button onClick={() => setImgIdx((i) => (i - 1 + imgs.length) % imgs.length)} className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/80 flex items-center justify-center"><ChevronLeft className="w-5 h-5" /></button>
              <button onClick={() => setImgIdx((i) => (i + 1) % imgs.length)} className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/80 flex items-center justify-center"><ChevronRight className="w-5 h-5" /></button>
              <div className="absolute bottom-2 inset-x-0 flex justify-center gap-1">{imgs.map((_, i) => <span key={i} className={"w-1.5 h-1.5 rounded-full " + (i === imgIdx ? "bg-white" : "bg-white/50")} />)}</div>
            </>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h1 className="text-2xl font-bold">{product.common_name}</h1>
                {product.botanical_name && <p className="italic text-muted-foreground">{product.botanical_name}</p>}
              </div>
              <Button variant="outline" size="icon" onClick={toggleFav} aria-label="Save"><Heart className={fav ? "fill-rose-500 text-rose-500" : ""} /></Button>
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {product.listing_status !== "active" && <StatusBadge status={product.listing_status} />}
              {product.native_status && <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200"><Leaf className="w-3 h-3 mr-1" /> Native</Badge>}
              {product.foliage_type && product.foliage_type !== "n/a" && <Badge variant="outline" className="capitalize">{product.foliage_type}</Badge>}
              {product.pickup_eligible && <Badge variant="outline"><Package className="w-3 h-3 mr-1" /> Pickup</Badge>}
              {product.delivery_eligible && <Badge variant="outline"><Truck className="w-3 h-3 mr-1" /> Delivery</Badge>}
            </div>
          </div>

          <div className="rounded-2xl border border-border p-4 bg-card">
            <p className="text-3xl font-bold text-primary">{showReqQuote ? "Request Quote" : formatCurrency(product.unit_price)}<span className="text-sm font-normal text-muted-foreground"> /ea</span></p>
            <p className="text-sm text-muted-foreground mt-1">{formatNumber(product.quantity_available)} available · min order {product.minimum_order_quantity || 1}</p>
            {(product.bulk_price_tiers || []).length > 0 && (
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Bulk pricing</p>
                <div className="space-y-1">
                  {(product.bulk_price_tiers || []).slice().sort((a, b) => a.min_qty - b.min_qty).map((t, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{t.min_qty}{t.max_qty ? `–${t.max_qty}` : "+"}</span>
                      <span className="font-medium">{t.request_quote ? "Request quote" : formatCurrency(t.unit_price)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Quantity</label>
              <Input type="number" min={product.minimum_order_quantity || 1} max={product.quantity_available} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value)))} className="w-24 h-11" />
            </div>
            <div className="flex-1">
              {!showReqQuote && <p className="text-sm text-muted-foreground">Subtotal</p>}
              <p className="text-xl font-bold">{showReqQuote ? "—" : formatCurrency(subtotal)}</p>
            </div>
          </div>
          {qty > product.quantity_available && product.quantity_available > 0 && (
            <p className="text-xs text-rose-600">Only {product.quantity_available} available. Reduce quantity or request a quote.</p>
          )}

          <div className="grid grid-cols-1 gap-2">
            <Button onClick={buyNow} disabled={!canOrder} className="h-12 text-base"><ShoppingCart className="w-4 h-4 mr-2" /> {showReqQuote ? "Request quote to buy" : "Buy now"}</Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={requestQuote} className="h-11"><FileText className="w-4 h-4 mr-2" /> Request quote</Button>
              <Button variant="outline" onClick={startConversation} className="h-11"><MessageSquare className="w-4 h-4 mr-2" /> Message</Button>
            </div>
          </div>

          <div className="rounded-2xl border border-border p-4 bg-card space-y-2">
            <label className="text-xs text-muted-foreground">Add to a project</label>
            <div className="flex gap-2">
              <Select value={addProject} onValueChange={setAddProject}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Select project" /></SelectTrigger>
                <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
              <Button variant="secondary" onClick={addToProject} className="h-11">Add</Button>
            </div>
            <Button asChild variant="link" className="h-auto p-0 text-sm"><Link to="/projects/new">+ Create a project</Link></Button>
          </div>
        </div>
      </div>

      {vendor && (
        <div className="rounded-2xl border border-border p-5 bg-card">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <Link to={`/vendor/${vendor.id}`} className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center font-bold text-primary">{(vendor.business_name || "V").slice(0, 1)}</div>
              <div>
                <p className="font-semibold flex items-center gap-2">{vendor.business_name}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" /> {vendor.city}, {vendor.state} {dist !== null && `· ${dist} mi away`}</p>
                <div className="mt-1"><StarRating value={vendor.rating} count={vendor.review_count} /></div>
              </div>
            </Link>
            <div className="flex items-center gap-2">
              {vendor.verification_status === "verified" ? <VerifiedBadge status="verified" /> : <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50"><ShieldCheck className="w-3 h-3 mr-1" /> Verification pending</Badge>}
            </div>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <SpecBlock title="Specifications" specs={[
          ["Container", product.container_size], ["Box", product.box_size], ["Caliper", product.caliper],
          ["Current height", product.current_height], ["Spread", product.approximate_spread], ["SKU", product.sku],
        ]} />
        <SpecBlock title="Plant characteristics" specs={[
          ["Native", product.native_status ? "Yes" : ""], ["Foliage", product.foliage_type],
          ["USDA zones", product.usda_zones], ["Sun", product.sun_requirement], ["Water", product.water_requirement],
          ["Mature height", product.mature_height], ["Mature spread", product.mature_spread],
        ]} />
      </div>

      {product.description && (
        <div className="rounded-2xl border border-border p-5 bg-card">
          <h2 className="font-semibold mb-2">Description</h2>
          <p className="text-sm text-muted-foreground whitespace-pre-line">{product.description}</p>
        </div>
      )}

      {reviews.length > 0 && (
        <div className="rounded-2xl border border-border p-5 bg-card">
          <h2 className="font-semibold mb-3">Vendor reviews</h2>
          <div className="space-y-4">
            {reviews.map((r) => (
              <div key={r.id} className="pb-4 border-b border-border last:border-0 last:pb-0">
                <div className="flex items-center justify-between"><span className="text-sm font-medium">{r.reviewer_name}</span><StarRating value={r.rating} showNumber={false} /></div>
                {r.review_text && <p className="text-sm text-muted-foreground mt-1">{r.review_text}</p>}
              </div>
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
    <div className="rounded-2xl border border-border p-5 bg-card">
      <h2 className="font-semibold mb-3">{title}</h2>
      <dl className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
        {rows.map(([k, v]) => <div key={k}><dt className="text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>)}
      </dl>
    </div>
  );
}