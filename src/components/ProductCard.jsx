import { Link } from "react-router-dom";
import { Heart, MapPin } from "lucide-react";
import { Image } from "@/components/ui/image";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber } from "@/lib/treebay";
import VerifiedBadge from "@/components/VerifiedBadge";

export default function ProductCard({ product, favorite, onToggleFavorite, fromCity }) {
  const img = product.images?.[0];
  const status = product.listing_status || "active";
  return (
    <Link to={`/product/${product.id}`} className="group block rounded-2xl border border-border bg-card overflow-hidden hover:shadow-md hover:border-primary/40 transition no-tap-highlight">
      <div className="relative aspect-[4/3] bg-muted overflow-hidden">
        {img ? (
          <Image src={img} alt={product.common_name} fittingType="fill" className="w-full h-full" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground/40 text-sm">No photo</div>
        )}
        {status !== "active" && (
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-semibold uppercase">{status.replace("_", " ")}</span>
        )}
        {onToggleFavorite && (
          <button
            onClick={(e) => { e.preventDefault(); onToggleFavorite(); }}
            aria-label="Save product"
            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 backdrop-blur flex items-center justify-center shadow-sm"
          >
            <Heart className={cn("w-4 h-4", favorite ? "fill-rose-500 text-rose-500" : "text-muted-foreground")} />
          </button>
        )}
      </div>
      <div className="p-3">
        <h3 className="font-semibold text-sm text-foreground leading-snug line-clamp-1">{product.common_name}</h3>
        {product.botanical_name && <p className="text-xs text-muted-foreground italic line-clamp-1">{product.botanical_name}</p>}
        {(product.caliper || product.container_size) && (
          <p className="text-xs text-muted-foreground mt-1">{[product.caliper && `${product.caliper} cal`, product.container_size].filter(Boolean).join(" · ")}</p>
        )}
        <div className="flex items-end justify-between mt-2">
          <div>
            <p className="text-base font-bold text-primary">{formatCurrency(product.unit_price)}<span className="text-xs font-normal text-muted-foreground"> /ea</span></p>
            <p className="text-[11px] text-muted-foreground">{formatNumber(product.quantity_available)} available</p>
          </div>
        </div>
        <div className="mt-2 pt-2 border-t border-border flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
            <MapPin className="w-3 h-3 shrink-0" /> {product.vendor_name || "Vendor"} · {[product.vendor_city, product.vendor_state].filter(Boolean).join(", ")}
          </p>
          {product.verified_vendor && <span className="text-[10px] text-emerald-700 font-semibold">✓</span>}
        </div>
      </div>
    </Link>
  );
}