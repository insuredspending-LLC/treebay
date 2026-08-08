import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export default function StarRating({ value = 0, count, size = "w-4 h-4", showNumber = true, className }) {
  const v = Math.round(Number(value) || 0);
  return (
    <div className={cn("inline-flex items-center gap-1", className)}>
      <div className="inline-flex">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} className={cn(size, i <= v ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />
        ))}
      </div>
      {showNumber && (
        <span className="text-xs text-muted-foreground">
          {value ? Number(value).toFixed(1) : "New"}
          {typeof count === "number" ? ` (${count})` : ""}
        </span>
      )}
    </div>
  );
}