import { Badge } from "@/components/ui/badge";
import { ShieldCheck } from "lucide-react";

export default function VerifiedBadge({ status, className }) {
  if (status === "verified") {
    return (
      <Badge variant="outline" className={"gap-1 bg-emerald-50 text-emerald-700 border-emerald-200 " + (className || "")}>
        <ShieldCheck className="w-3 h-3" /> Verified Vendor
      </Badge>
    );
  }
  return null;
}