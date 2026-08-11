import { Layers, Truck, Package, Leaf } from "lucide-react";
import { cn } from "@/lib/utils";

export function BulkPricingBadge({ product, className }) {
  const tiers = product?.bulk_price_tiers;
  if (!tiers || !tiers.length) return null;
  const best = tiers.reduce((min, t) => (t.unit_price < min ? t.unit_price : min), tiers[0].unit_price);
  return (
    <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[10px] font-semibold border border-amber-200", className)}>
      <Layers className="w-3 h-3" /> Bulk from ${best}
    </span>
  );
}

export function PickupDeliveryBadges({ product, className }) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {product?.pickup_eligible && (
        <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground font-medium">
          <Package className="w-3 h-3" /> Pickup
        </span>
      )}
      {product?.delivery_eligible && (
        <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground font-medium">
          <Truck className="w-3 h-3" /> Delivery
        </span>
      )}
      {product?.native_status && (
        <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 font-medium">
          <Leaf className="w-3 h-3" /> Native
        </span>
      )}
    </div>
  );
}