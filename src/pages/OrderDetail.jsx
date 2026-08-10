import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, MessageSquare, Star, Truck, Package, Loader2, ShieldCheck } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { useAppUser } from "@/hooks/useAppUser";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, shortDate, formatCurrency, apiError } from "@/lib/treebay";

const FULFILLMENT_SEQUENCE = ["awaiting_payment", "payment_confirmed", "inventory_reserved", "vendor_confirmed", "preparing", "ready_for_pickup", "delivery_assigned", "picked_up", "in_transit", "delivered", "completed"];
const VENDOR_NEXT_STATUS = {
  inventory_reserved: "vendor_confirmed",
  vendor_confirmed: "preparing",
  preparing: "ready_for_pickup",
  ready_for_pickup: "delivery_assigned",
  delivery_assigned: "picked_up",
  picked_up: "in_transit",
  in_transit: "delivered",
  delivered: "completed",
};

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { accountType } = useAppUser();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [review, setReview] = useState({ rating: 5, text: "" });

  const load = async () => {
    setLoading(true);
    try { setOrder(await base44.entities.Order.get(id)); } catch {}
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [id]);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;
  if (!order) return <p className="text-center text-muted-foreground py-16">Order not found.</p>;

  const isVendor = accountType === "vendor";
  const isBuyer = accountType === "buyer" || accountType === "admin";
  const currentIndex = FULFILLMENT_SEQUENCE.indexOf(order.order_status);
  const canAdvance = isVendor && !!VENDOR_NEXT_STATUS[order.order_status];
  const nextStatus = VENDOR_NEXT_STATUS[order.order_status] || null;

  const advance = async (status) => {
    try {
      await base44.functions.invoke("updateFulfillment", { orderId: id, action: "advance" });
      toast({ title: "Order updated", description: ORDER_STATUS_LABELS[status] });
      load();
    } catch (e) { toast({ title: "Could not update", description: apiError(e), variant: "destructive" }); }
  };

  const message = async () => {
    try {
      const { data } = await base44.functions.invoke("startConversation", { type: "order", referenceId: id });
      navigate(`/messages/${data.conversationId}`);
    } catch (e) { toast({ title: "Could not open conversation", description: apiError(e), variant: "destructive" }); }
  };

  const submitReview = async () => {
    try {
      await base44.functions.invoke("submitReview", { orderId: id, rating: review.rating, reviewText: review.text });
      toast({ title: "Review submitted" });
      setReviewOpen(false);
      load();
    } catch (e) { toast({ title: "Could not submit", description: apiError(e), variant: "destructive" }); }
  };

  const pay = async () => {
    try {
      await base44.functions.invoke("confirmTestPayment", { orderId: id, outcome: "TEST_SUCCESS" });
      toast({ title: "Payment confirmed (Test)", description: "Inventory reserved. Vendor notified." });
      load();
    } catch (e) { toast({ title: "Payment failed", description: apiError(e), variant: "destructive" }); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{order.order_number}</h1>
          <p className="text-sm text-muted-foreground mt-1">{isBuyer ? `Vendor: ${order.vendor_name}` : "Buyer order"} · {shortDate(order.created_date)}</p>
        </div>
        <div className="flex flex-col gap-1.5 items-end">
          <StatusBadge status={order.order_status} label={ORDER_STATUS_LABELS[order.order_status]} />
          <StatusBadge status={order.payment_status} label={PAYMENT_STATUS_LABELS[order.payment_status]} />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1 py-1">
        {FULFILLMENT_SEQUENCE.map((s) => {
          const idx = FULFILLMENT_SEQUENCE.indexOf(s);
          const done = currentIndex >= idx;
          return (
            <div key={s} className={"flex items-center gap-1 px-2.5 py-1 rounded-full text-xs whitespace-nowrap " + (done ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>
              {done && <span>✓</span>}{ORDER_STATUS_LABELS[s]}
            </div>
          );
        })}
      </div>

      <Card className="p-4 space-y-2">
        <h2 className="font-semibold mb-2">Items</h2>
        {(order.items || []).map((it, i) => (
          <div key={i} className="flex justify-between text-sm py-1.5 border-b border-border last:border-0">
            <div><p className="font-medium">{it.line_name}</p><p className="text-xs text-muted-foreground">{it.quantity} × {formatCurrency(it.unit_price)}</p></div>
            <span className="font-medium">{formatCurrency(it.subtotal)}</span>
          </div>
        ))}
        <div className="space-y-1 pt-2 text-sm">
          <Row label="Subtotal" value={formatCurrency(order.subtotal)} />
          <Row label="Delivery" value={formatCurrency(order.delivery_charges)} />
          <Row label="Taxes" value={formatCurrency(order.taxes)} />
          <Row label="Platform fees" value={formatCurrency(order.platform_fees)} />
          <div className="flex justify-between font-bold text-base pt-1 border-t border-border"><span>Total</span><span className="text-primary">{formatCurrency(order.total)}</span></div>
        </div>
      </Card>

      <Card className="p-4 text-sm space-y-1.5">
        <p className="font-semibold mb-1">Fulfillment</p>
        <Row label="Method" value={order.fulfillment_method === "pickup" || order.fulfillment_method === "buyer_pickup" ? "Pickup" : order.fulfillment_method === "vendor_delivery" ? "Vendor delivery" : "Third-party carrier"} />
        <Row label="Destination" value={[order.destination_city, order.destination_state, order.destination_zip].filter(Boolean).join(", ")} />
        {order.requested_date && <Row label="Requested date" value={shortDate(order.requested_date)} />}
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={message}><MessageSquare className="w-4 h-4 mr-2" /> Message</Button>
        {isBuyer && order.order_status === "awaiting_payment" && <Button onClick={pay}><ShieldCheck className="w-4 h-4 mr-2" /> Pay (Test Mode)</Button>}
        {isVendor && canAdvance && nextStatus && <Button onClick={() => advance(nextStatus)}>Advance to {ORDER_STATUS_LABELS[nextStatus]}</Button>}
        {isBuyer && order.order_status === "completed" && <Button onClick={() => setReviewOpen(true)}><Star className="w-4 h-4 mr-2" /> Review vendor</Button>}
      </div>

      {reviewOpen && (
        <Card className="p-4 space-y-3">
          <h2 className="font-semibold">Review {order.vendor_name}</h2>
          <div className="flex gap-1">{[1, 2, 3, 4, 5].map((i) => <button key={i} onClick={() => setReview((p) => ({ ...p, rating: i }))}><Star className={"w-7 h-7 " + (i <= review.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} /></button>)}</div>
          <div className="space-y-1.5"><Label>Your review</Label><Textarea value={review.text} onChange={(e) => setReview((p) => ({ ...p, text: e.target.value }))} rows={3} /></div>
          <div className="flex gap-2"><Button variant="outline" onClick={() => setReviewOpen(false)}>Cancel</Button><Button onClick={submitReview}>Submit review</Button></div>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }) { return <div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span className="font-medium">{value}</span></div>; }