import { Leaf } from "lucide-react";
import { cn } from "@/lib/utils";

export const BRAND_NAME = "TreEbay";
export const BRAND_TAGLINE = "THE LANDSCAPE SUPPLY MARKETPLACE";
export const BRAND_STATEMENT = "SOURCE BETTER • BUY SMARTER • GROW MORE";

// Centralized brand mark. When an approved logo asset is added, replace the
// Leaf icon with an <img src={logoUrl} /> here and every screen updates.
export function BrandMark({ className }) {
  return (
    <div className={cn("rounded-lg bg-primary flex items-center justify-center", className || "w-8 h-8")}>
      <Leaf className="w-5 h-5 text-primary-foreground" />
    </div>
  );
}

export function BrandWordmark({ className }) {
  return (
    <span className={cn("font-heading font-extrabold text-primary tracking-tight", className || "text-lg")}>
      {BRAND_NAME}
    </span>
  );
}