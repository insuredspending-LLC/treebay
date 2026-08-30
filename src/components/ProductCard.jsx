import { Link } from "react-router-dom";
import { ArrowUpRight, Heart, MapPin, TreePine } from "lucide-react";
import { Image } from "@/components/ui/image";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber } from "@/lib/treebay";
import { BulkPricingBadge, PickupDeliveryBadges } from "@/components/ProductBadges";

export default function ProductCard({ product, favorite, onToggleFavorite }) {
  const image = product.images?.[0];
  const status = product.listing_status || "active";
  const location = [product.vendor_city, product.vendor_state].filter(Boolean).join(", ");

  return (
    <Link
      to={"/product/" + product.id}
      className="group block overflow-hidden rounded-[1.6rem] border border-border/65 bg-card card-shadow card-shadow-hover no-tap-highlight"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-[#e7e8df]">
        {image ? (
          <Image
            src={image}
            alt={product.common_name}
            fittingType="fill"
            className="image-zoom h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[linear-gradient(145deg,#e7eadf,#d8dfd2)] text-[#526455]">
            <TreePine className="h-12 w-12 opacity-55" strokeWidth={1.25} />
            <span className="text-[10px] uppercase tracking-[.18em]">Photo not supplied</span>
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#10251a]/38 via-transparent to-transparent opacity-70" />

        {status !== "active" && (
          <span className="absolute left-3 top-3 rounded-full bg-[#7f3029] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
            {status.replaceAll("_", " ")}
          </span>
        )}

        {product.verified_vendor && status === "active" && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-[#173522]/88 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur">
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><path d="M20 6L9 17l-5-5" /></svg>
            Verified grower
          </span>
        )}

        {onToggleFavorite && (
          <button
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggleFavorite();
            }}
            aria-label={favorite ? "Remove from favorites" : "Save product"}
            className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-white/90 text-[#233128] shadow-md backdrop-blur transition hover:scale-105 hover:bg-white"
          >
            <Heart className={cn("h-[18px] w-[18px] transition", favorite ? "fill-[#b64b44] text-[#b64b44]" : "text-[#45534a]")} />
          </button>
        )}
      </div>

      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="line-clamp-1 text-base font-bold leading-snug text-foreground">{product.common_name}</h3>
            {product.botanical_name && (
              <p className="mt-0.5 line-clamp-1 font-display text-sm italic text-muted-foreground">{product.botanical_name}</p>
            )}
          </div>
          <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
        </div>

        {(product.caliper || product.container_size) && (
          <p className="mt-3 text-xs font-medium text-muted-foreground">
            {[product.caliper && product.caliper + " cal", product.container_size].filter(Boolean).join(" · ")}
          </p>
        )}

        <div className="mt-3 flex min-h-5 items-center">
          <BulkPricingBadge product={product} />
        </div>

        <div className="mt-4 flex items-end justify-between gap-3 border-t border-border/70 pt-4">
          <div>
            <p className="font-heading text-xl font-extrabold leading-none text-primary">
              {formatCurrency(product.unit_price)}
              <span className="ml-1 text-xs font-medium text-muted-foreground">each</span>
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">{formatNumber(product.quantity_available)} available</p>
          </div>
        </div>

        <div className="mt-3">
          <p className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-primary/60" />
            {product.vendor_name || "Grower"}{location ? " · " + location : ""}
          </p>
          <PickupDeliveryBadges product={product} className="mt-2" />
        </div>
      </div>
    </Link>
  );
}