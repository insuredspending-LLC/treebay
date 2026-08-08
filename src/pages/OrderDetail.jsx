import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, MessageSquare, Star, Truck, Package, Loader2 } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { useAppUser } from "@/hooks/useAppUser";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, shortDate, formatCurrency, createNotification } from "@/lib/treebay";

const FULFILLMENT_SEQUENCE = ["pending", "awaiting_payment", "paid", "confirmed", "preparing", "ready_for_pickup", "in_transit", "delivered", "completed"];

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
  const canAdvance = isVendor && order.order_status !== "completed" && order.order_status !== "cancelled";
  const currentIndex = FULFILLMENT_SEQUENCE.indexOf(order.order_status);
  const nextStatus = currentIndex >= 0 && currentIndex < FULFILLMENT_SEQUENCE.length - 1 ? FULFILLMENT_SEQUENCE[currentIndex + 1] : null;

  const advance = async (status) => {
    try {
      await base44.entities.Order.update(id, { order_status: status });
      const notifType = status === "ready_for_pickup" ? "order_ready" : status === "in_transit" ? "order_shipped" : status === "delivered" ? "order_delivered" : status === "completed" ? "order_completed" : "general";
      await createNotification(order.buyer_id, notifType, "Order update", `${order.order_number} → ${ORDER_STATUS_LABELS[status]}`, "order", id);
      toast({ title: "Order updated", description: ORDER_STATUS_LABELS[status] });
      load();
    } catch (e) { toast({ title: "Could not update", description: e.message, variant: "destructive" }); }
  };

  const markPaid = async () => {
    try { await base44.entities.Order.update(id, { payment_status: "paid", order_status: order.order_status === "pending" ? "confirmed" : order.order_status }); await base44.entities.PaymentRecord.create({ order_id: id, buyer_id: order.buyer_id, vendor_owner_id: order.vendor_owner_id, amount: order.total, status: "paid", transaction_ref: "demo-" + Date.now() }); toast({ title: "Marked as paid" }); load(); }
    catch (e) { toast({ title: "Could not update", description: e.message, variant: "destructive" }); }
  };

  const message = async () => {
    try {
      const me = await base44.auth.me();
      const conv = await base44.entities.Conversation.create({ type: "order", reference_id: id, reference_label: order.order_number, buyer_id: order.buyer_id, vendor_owner_id: order.vendor_owner_id, vendor_id: order.vendor_id });
      navigate(`/messages/${conv.id}`);
    } catch {}
  };

  const submitReview = async () => {
    try {
      const me = await base44.auth.me();
      await base44.entities.Review.create({ order_id: id, reviewer_id: me.id, reviewer_name: me.full_name || me.email, vendor_id: order.vendor_id, rating: review.rating, review_text: review.text });
      // recompute vendor rating
      const all = await base44.entities.Review.filter({ vendor_id: order.vendor_id }, "-created_date", 500);
      const avg = all.reduce((s, r) => s + (r.rating || 0), 0) / Math.max(1, all.length);
      await base44.entities.VendorProfile.update(order.vendor_id, { rating: Math.round(avg * 10) / 10, review_count: all.length });
      toast({ title: "Review submitted" });
      setReviewOpen(false);
    } catch (e) { toast({ title: "Could not submit", description: e.message, variant: "destructive" }); }
  };

  return (
    <div className="space-y-5">
      <Link to="/orders" className="text-sm text-muted-foreground flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Orders</Link>
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
        <Row label="Method" value={order.fulfillment_method === "pickup" ? "Pickup" : order.fulfillment_method === "vendor_delivery" ? "Vendor delivery" : "Third-party delivery"} />
        <Row label="Destination" value={[order.destination_city, order.destination_state, order.destination_zip].filter(Boolean).join(", ")} />
        {order.requested_date && <Row label="Requested date" value={shortDate(order.requested_date)} />}
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={message}><MessageSquare className="w-4 h-4 mr-2" /> Message</Button>
        {isVendor && order.payment_status !== "paid" && <Button onClick={markPaid} variant="secondary">Mark paid</Button>}
        {isVendor && canAdvance && nextStatus && <Button onClick={() => advance(nextStatus)}>Advance to {ORDER_STATUS_LABELS[nextStatus]}</Button>}
        {isBuyer && order.order_status === "completed" && <Button onClick={() => setReviewOpen(true)}><Star className="w-4 h-4 mr-2" /> Review vendor</Button>}
        {isVendor && order.order_status === "in_transit" && <Button variant="outline" onClick={() => advance("completed")}>Complete</Button>}
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