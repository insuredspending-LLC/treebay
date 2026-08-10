import { cn } from "@/lib/utils";

const STATUS_STYLES = {
  active: "bg-emerald-100 text-emerald-700",
  paused: "bg-amber-100 text-amber-700",
  sold_out: "bg-rose-100 text-rose-700",
  archived: "bg-muted text-muted-foreground",
  pending: "bg-amber-100 text-amber-700",
  verified: "bg-emerald-100 text-emerald-700",
  suspended: "bg-rose-100 text-rose-700",
  open: "bg-blue-100 text-blue-700",
  draft: "bg-muted text-muted-foreground",
  quotes_received: "bg-violet-100 text-violet-700",
  awarded: "bg-emerald-100 text-emerald-700",
  closed: "bg-muted text-muted-foreground",
  cancelled: "bg-rose-100 text-rose-700",
  submitted: "bg-blue-100 text-blue-700",
  accepted: "bg-emerald-100 text-emerald-700",
  declined: "bg-rose-100 text-rose-700",
  revised: "bg-amber-100 text-amber-700",
  expired: "bg-muted text-muted-foreground",
  withdrawn: "bg-muted text-muted-foreground",
  paid: "bg-emerald-100 text-emerald-700",
  authorized: "bg-blue-100 text-blue-700",
  failed: "bg-rose-100 text-rose-700",
  refunded: "bg-amber-100 text-amber-700",
  partially_refunded: "bg-amber-100 text-amber-700",
  confirmed: "bg-blue-100 text-blue-700",
  preparing: "bg-amber-100 text-amber-700",
  ready_for_pickup: "bg-violet-100 text-violet-700",
  in_transit: "bg-blue-100 text-blue-700",
  delivered: "bg-emerald-100 text-emerald-700",
  completed: "bg-emerald-100 text-emerald-700",
  pricing_confirmed: "bg-blue-100 text-blue-700",
  payment_confirmed: "bg-emerald-100 text-emerald-700",
  inventory_reserved: "bg-violet-100 text-violet-700",
  vendor_confirmed: "bg-blue-100 text-blue-700",
  delivery_assigned: "bg-blue-100 text-blue-700",
  picked_up: "bg-blue-100 text-blue-700",
  settlement_pending: "bg-amber-100 text-amber-700",
  settled: "bg-emerald-100 text-emerald-700",
  payment_failed: "bg-rose-100 text-rose-700",
  refund_pending: "bg-amber-100 text-amber-700",
  fulfillment_exception: "bg-rose-100 text-rose-700",
  delivery_exception: "bg-rose-100 text-rose-700",
  disputed: "bg-rose-100 text-rose-700",
};

export default function StatusBadge({ status, label, className }) {
  const cls = STATUS_STYLES[status] || "bg-muted text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium", cls, className)}>
      {label || status}
    </span>
  );
}