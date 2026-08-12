import { Link } from "react-router-dom";
import { Heart, MapPin, Package } from "lucide-react";
import { Image } from "@/components/ui/image";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber } from "@/lib/treebay";
import { BulkPricingBadge, PickupDeliveryBadges } from "@/components/ProductBadges";

export default function ProductCard({ product, favorite, onToggleFavorite }) {
  const img = product.images?.[0];
  const status = product.listing_status || "active";
  return (
    <Link to={`/product/${product.id}`} className="group block rounded-2xl border border-border bg-card overflow-hidden card-shadow card-shadow-hover hover:border-primary/30 no-tap-highlight">
      <div className="relative aspect-[4/3] bg-muted overflow-hidden">
        {img ? (
          <Image src={img} alt={product.common_name} fittingType="fill" className="w-full h-full transition-transform duration-300 group-hover:scale-105" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground/30">
            <Package className="w-10 h-10" />
          </div>
        )}
        {status !== "active" && (
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-semibold uppercase tracking-wide">{status.replace("_", " ")}</span>
        )}
        {product.verified_vendor && (
          <div className="absolute top-2 left-2">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-semibold shadow-sm">
              <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><path d="M20 6L9 17l-5-5" /></svg> Verified
            </span>
          </div>
        )}
        {onToggleFavorite && (
          <button
            onClick={(e) => { e.preventDefault(); onToggleFavorite(); }}
            aria-label="Save product"
            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 backdrop-blur flex items-center justify-center shadow-sm hover:bg-white transition"
          >
            <Heart className={cn("w-4 h-4 transition", favorite ? "fill-rose-500 text-rose-500" : "text-muted-foreground")} />
          </button>
        )}
      </div>
      <div className="p-3 space-y-1.5">
        <div>
          <h3 className="font-heading font-semibold text-sm text-foreground leading-snug line-clamp-1">{product.common_name}</h3>
          {product.botanical_name && <p className="text-xs text-muted-foreground italic line-clamp-1">{product.botanical_name}</p>}
        </div>
        {(product.caliper || product.container_size) && (
          <p className="text-xs text-muted-foreground">{[product.caliper && `${product.caliper} cal`, product.container_size].filter(Boolean).join(" · ")}</p>
        )}
        <BulkPricingBadge product={product} />
        <div className="flex items-end justify-between pt-0.5">
          <div>
            <p className="text-lg font-heading font-bold text-primary leading-none">{formatCurrency(product.unit_price)}<span className="text-xs font-normal text-muted-foreground"> /ea</span></p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{formatNumber(product.quantity_available)} available</p>
          </div>
        </div>
        <div className="pt-2 border-t border-border">
          <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
            <MapPin className="w-3 h-3 shrink-0 text-primary/60" /> {product.vendor_name || "Vendor"} · {[product.vendor_city, product.vendor_state].filter(Boolean).join(", ")}
          </p>
          <PickupDeliveryBadges product={product} className="mt-1.5" />
        </div>
      </div>
    </Link>
  );
}