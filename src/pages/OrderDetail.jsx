import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { MessageSquare, Star, ShieldCheck, FileText, MapPin, AlertCircle, CheckCircle2, Clock, Truck } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { useAppUser } from "@/hooks/useAppUser";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, shortDate, formatCurrency, apiError } from "@/lib/treebay";
import SectionHeader from "@/components/SectionHeader";

function getFulfillmentSequence(order) {
  const isPickup = order?.fulfillment_method === "buyer_pickup" || order?.fulfillment_method === "pickup";
  const base = ["awaiting_payment", "payment_confirmed", "inventory_reserved", "vendor_confirmed", "preparing", "ready_for_pickup"];
  return isPickup ? [...base, "picked_up", "delivered", "completed"] : [...base, "delivery_assigned", "picked_up", "in_transit", "delivered", "completed"];
}

function getNextStatus(order) {
  const s = order.order_status;
  const isPickup = order.fulfillment_method === "buyer_pickup" || order.fulfillment_method === "pickup";
  if (s === "inventory_reserved") return "vendor_confirmed";
  if (s === "vendor_confirmed") return "preparing";
  if (s === "preparing") return "ready_for_pickup";
  if (s === "ready_for_pickup") return isPickup ? "picked_up" : "delivery_assigned";
  if (s === "delivery_assigned") return "picked_up";
  if (s === "picked_up") return isPickup ? "delivered" : "in_transit";
  if (s === "in_transit") return "delivered";
  return null;
}

const SELLER_ACTION_LABELS = {
  vendor_confirmed: "Confirm order",
  preparing: "Begin preparing",
  ready_for_pickup: "Mark ready for pickup",
  picked_up: "Confirm pickup",
  delivery_assigned: "Assign delivery",
  in_transit: "Mark in transit",
  delivered: "Confirm delivery",
};

const DOCUMENT_LABELS = {
  buyer_order_confirmation: "Order Confirmation",
  buyer_invoice: "Invoice",
  buyer_receipt: "Receipt",
  vendor_purchase_order: "Purchase Order",
  vendor_settlement_statement: "Settlement Statement",
  delivery_manifest: "Delivery Manifest",
};

const EXCEPTION_STATUSES = ["fulfillment_exception", "delivery_exception", "disputed", "payment_failed", "refund_pending"];

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { accountType } = useAppUser();
  const [order, setOrder] = useState(null);
  const [shipment, setShipment] = useState(null);
  const [exceptions, setExceptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [review, setReview] = useState({ rating: 5, text: "" });
  const [documents, setDocuments] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const o = await base44.entities.Order.get(id);
      setOrder(o);
      if (o) {
        try { const s = await base44.entities.Shipment.filter({ order_id: id }); setShipment(s?.[0] || null); } catch {}
        try { const ex = await base44.entities.SystemException.filter({ order_id: id, status: "OPEN" }); setExceptions(ex || []); } catch {}
        try {
          const { data } = await base44.functions.invoke("listTransactionDocuments", { orderId: id });
          setDocuments(data.documents || []);
        } catch {}
      }
    } catch {}
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [id]);

  if (loading) return (
    <div className="space-y-4">
      <div className="h-8 w-1/3 rounded-lg bg-muted skeleton-shimmer" />
      <div className="h-32 rounded-2xl bg-muted skeleton-shimmer" />
      <div className="h-48 rounded-2xl bg-muted skeleton-shimmer" />
    </div>
  );
  if (!order) return <p className="text-center text-muted-foreground py-16">Order not found.</p>;

  const isVendor = accountType === "vendor";
  const isBuyer = accountType === "buyer" || accountType === "admin";
  const sequence = getFulfillmentSequence(order);
  const currentIndex = sequence.indexOf(order.order_status);
  const nextStatus = getNextStatus(order);
  const canAdvance = isVendor && !!nextStatus;
  const hasException = EXCEPTION_STATUSES.includes(order.order_status) || exceptions.length > 0;
  const isPickup = order.fulfillment_method === "buyer_pickup" || order.fulfillment_method === "pickup";
  const sellerActionLabel = nextStatus ? (SELLER_ACTION_LABELS[nextStatus] || `Advance to ${ORDER_STATUS_LABELS[nextStatus]}`) : null;
  const jobsite = [order.contact_name || order.destination_name, [order.destination_city, order.destination_state].filter(Boolean).join(", ")].filter(Boolean).join(" · ") || "—";

  const advance = async () => {
    try {
      await base44.functions.invoke("updateFulfillment", { orderId: id, action: "advance" });
      toast({ title: "Order updated", description: ORDER_STATUS_LABELS[nextStatus] });
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

  const confirmPickup = async () => {
    try {
      await base44.functions.invoke("updateBuyerPickup", { orderId: id, action: "confirm_pickup" });
      toast({ title: "Pickup confirmed" });
      load();
    } catch (e) { toast({ title: "Could not confirm pickup", description: apiError(e), variant: "destructive" }); }
  };

  const confirmReceived = async () => {
    try {
      await base44.functions.invoke("updateBuyerPickup", { orderId: id, action: "confirm_received" });
      toast({ title: "Receipt confirmed" });
      load();
    } catch (e) { toast({ title: "Could not confirm receipt", description: apiError(e), variant: "destructive" }); }
  };

  const openDocument = (doc) => {
    const blob = new Blob([doc.html_content || "<p>No content</p>"], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-heading font-bold">{order.order_number}</h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
            {isBuyer ? (<><Truck className="w-3.5 h-3.5" /> {order.vendor_name}</>) : (<><MapPin className="w-3.5 h-3.5" /> {jobsite}</>)} · {shortDate(order.created_date)}
          </p>
        </div>
        <div className="flex flex-col gap-1.5 items-end">
          <StatusBadge status={order.order_status} label={ORDER_STATUS_LABELS[order.order_status]} />
          <StatusBadge status={order.payment_status} label={PAYMENT_STATUS_LABELS[order.payment_status]} />
        </div>
      </div>

      {/* Exception banner */}
      {hasException && (
        <Card className="p-4 border-amber-300 bg-amber-50">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm text-amber-900">This order needs attention</p>
              <p className="text-xs text-amber-700 mt-0.5">
                {exceptions.length > 0 ? exceptions[0].reason : `Order status: ${ORDER_STATUS_LABELS[order.order_status]}`}
              </p>
              {exceptions[0]?.recommended_action && <p className="text-xs text-amber-700 mt-1">Recommended: {exceptions[0].recommended_action}</p>}
            </div>
          </div>
        </Card>
      )}

      {/* Seller next-action card */}
      {isVendor && canAdvance && (
        <Card className="p-4 border-primary/30 bg-primary/5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Next seller action</p>
              <p className="text-sm font-medium mt-0.5">{sellerActionLabel}</p>
            </div>
            <Button onClick={advance}>{sellerActionLabel}</Button>
          </div>
        </Card>
      )}
      {isVendor && order.order_status === "delivered" && (
        <Card className="p-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">TreEbay will complete this order automatically.</p>
        </Card>
      )}

      {/* Buyer pickup actions — buyer confirms pickup and receipt */}
      {isBuyer && isPickup && order.order_status === "ready_for_pickup" && (
        <Card className="p-4 border-primary/30 bg-primary/5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Your pickup action</p>
              <p className="text-sm font-medium mt-0.5">Confirm pickup</p>
            </div>
            <Button onClick={confirmPickup}>Confirm Pickup</Button>
          </div>
        </Card>
      )}
      {isBuyer && isPickup && order.order_status === "picked_up" && (
        <Card className="p-4 border-primary/30 bg-primary/5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">Your receipt action</p>
              <p className="text-sm font-medium mt-0.5">Confirm receipt</p>
            </div>
            <Button onClick={confirmReceived}>Confirm Receipt</Button>
          </div>
        </Card>
      )}

      {/* Third-party carrier: waiting for automatic freight assignment */}
      {order.fulfillment_method === "third_party_carrier" && order.order_status === "ready_for_pickup" && (
        <Card className="p-4 flex items-center gap-2">
          <Truck className="w-5 h-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">TreEbay is automatically assigning a freight carrier. No action needed.</p>
        </Card>
      )}

      {/* Timeline */}
      <Card className="p-5 card-shadow">
        <h2 className="font-heading font-semibold mb-4">Tracking</h2>
        <div className="space-y-0">
          {sequence.map((s, idx) => {
            const done = currentIndex >= idx;
            const current = currentIndex === idx;
            const isLast = idx === sequence.length - 1;
            return (
              <div key={s} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={"w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition " + (done ? "bg-primary text-primary-foreground" : current ? "bg-primary/20 border-2 border-primary" : "bg-muted border border-border")}>
                    {done ? <CheckCircle2 className="w-4 h-4" /> : <span className="w-2 h-2 rounded-full bg-muted-foreground/40" />}
                  </div>
                  {!isLast && <div className={"w-0.5 flex-1 min-h-[24px] " + (done ? "bg-primary" : "bg-border")} />}
                </div>
                <div className={"pb-4 " + (isLast ? "pb-0" : "")}>
                  <p className={"text-sm font-medium " + (done || current ? "text-foreground" : "text-muted-foreground")}>{ORDER_STATUS_LABELS[s]}</p>
                  {current && <p className="text-xs text-primary mt-0.5">In progress</p>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Items */}
      <div>
        <SectionHeader title="Items" />
        <Card className="p-4 mt-3 card-shadow">
          <div className="space-y-2">
            {(order.items || []).map((it, i) => (
              <div key={i} className="flex justify-between text-sm py-1.5 border-b border-border last:border-0">
                <div><p className="font-medium">{it.line_name}</p><p className="text-xs text-muted-foreground">{it.quantity} × {formatCurrency(it.unit_price)}</p></div>
                <span className="font-medium">{formatCurrency(it.subtotal)}</span>
              </div>
            ))}
          </div>
          <Separator className="my-3" />
          <div className="space-y-1.5 text-sm">
            <Row label="Merchandise" value={formatCurrency(order.subtotal)} />
            <Row label="Delivery" value={formatCurrency(order.delivery_charges)} />
            <Row label="Taxes" value={formatCurrency(order.taxes)} />
            <Row label="TreEbay fee" value={formatCurrency(order.platform_fees)} />
            <div className="flex justify-between font-bold text-base pt-1.5 border-t border-border"><span>Final delivered price</span><span className="text-primary">{formatCurrency(order.total)}</span></div>
          </div>
        </Card>
      </div>

      {/* Jobsite / fulfillment */}
      <div>
        <SectionHeader title="Jobsite & fulfillment" />
        <Card className="p-4 mt-3 card-shadow text-sm space-y-2">
          <Row label="Method" value={isPickup ? "Buyer pickup" : order.fulfillment_method === "vendor_delivery" ? "Vendor delivery" : "Third-party carrier"} />
          <Row label="Destination" value={[order.destination_city, order.destination_state, order.destination_zip].filter(Boolean).join(", ") || "—"} />
          {order.destination_street && <Row label="Street" value={order.destination_street} />}
          {order.destination_name && <Row label="Contact" value={order.destination_name} />}
          {order.requested_date && <Row label="Requested date" value={shortDate(order.requested_date)} />}
        </Card>
      </div>

      {/* Shipment */}
      {shipment && (
        <div>
          <SectionHeader title="Shipment" />
          <Card className="p-4 mt-3 card-shadow text-sm space-y-2">
            <Row label="Status" value={<StatusBadge status={shipment.shipment_status} />} />
            {shipment.pickup_location && <Row label="Pickup" value={shipment.pickup_location} />}
            {shipment.delivery_location && <Row label="Delivery" value={shipment.delivery_location} />}
            {shipment.delivery_window && <Row label="Window" value={shipment.delivery_window} />}
            {shipment.delivery_timestamp && <Row label="Delivered" value={shortDate(shipment.delivery_timestamp)} />}
            {shipment.confirmation_code && <Row label="Confirmation" value={shipment.confirmation_code} />}
          </Card>
        </div>
      )}

      {/* Documents */}
      {documents.length > 0 && (
        <div>
          <SectionHeader title="Documents" />
          <div className="flex flex-wrap gap-2 mt-3">
            {documents.map((doc) => (
              <Button key={doc.id} variant="outline" size="sm" onClick={() => openDocument(doc)}>
                <FileText className="w-3.5 h-3.5 mr-1.5" /> {DOCUMENT_LABELS[doc.document_type] || doc.document_type.replace(/_/g, " ")}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-2">
        <Button variant="outline" onClick={message}><MessageSquare className="w-4 h-4 mr-2" /> Message</Button>
        {isBuyer && order.order_status === "awaiting_payment" && <Button onClick={pay}><ShieldCheck className="w-4 h-4 mr-2" /> Pay (Test)</Button>}
        {isBuyer && order.order_status === "completed" && <Button onClick={() => setReviewOpen(true)}><Star className="w-4 h-4 mr-2" /> Review vendor</Button>}
      </div>

      {reviewOpen && (
        <Card className="p-4 space-y-3 card-shadow">
          <h2 className="font-heading font-semibold">Review {order.vendor_name}</h2>
          <div className="flex gap-1">{[1, 2, 3, 4, 5].map((i) => <button key={i} onClick={() => setReview((p) => ({ ...p, rating: i }))}><Star className={"w-7 h-7 " + (i <= review.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} /></button>)}</div>
          <div className="space-y-1.5"><Label>Your review</Label><Textarea value={review.text} onChange={(e) => setReview((p) => ({ ...p, text: e.target.value }))} rows={3} /></div>
          <div className="flex gap-2"><Button variant="outline" onClick={() => setReviewOpen(false)}>Cancel</Button><Button onClick={submitReview}>Submit review</Button></div>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }) { return <div className="flex justify-between items-center"><span className="text-muted-foreground">{label}</span><span className="font-medium text-right">{value}</span></div>; }