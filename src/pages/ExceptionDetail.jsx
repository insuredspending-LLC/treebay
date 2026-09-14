import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, ShieldAlert } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import StatusBadge from "@/components/StatusBadge";
import { shortDate, apiError } from "@/lib/treebay";

export default function ExceptionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [exc, setExc] = useState(null);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const e = await base44.entities.SystemException.get(id);
      setExc(e);
      if (e?.order_id) { try { setOrder(await base44.entities.Order.get(e.order_id)); } catch {} }
    } catch { toast({ title: "Not found", variant: "destructive" }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [id]);

  const resolve = async () => {
    setResolving(true);
    try {
      await base44.entities.SystemException.update(id, { status: "RESOLVED", resolved_at: new Date().toISOString(), resolved_by: "admin", resolution: "Manually resolved by admin" });
      toast({ title: "Exception resolved" });
      navigate("/admin");
    } catch (e) { toast({ title: "Could not resolve", description: apiError(e), variant: "destructive" }); }
    finally { setResolving(false); }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;
  if (!exc) return <p className="text-center text-muted-foreground py-16">Exception not found.</p>;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <button onClick={() => navigate("/admin")} className="text-sm text-muted-foreground flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Back to admin</button>
      <div className="flex items-center gap-2"><ShieldAlert className="w-6 h-6 text-rose-600" /><h1 className="text-xl font-bold">Exception detail</h1></div>
      <Card className="p-4 space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="font-medium capitalize">{(exc.exception_type || "").replace(/_/g, " ")}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Severity</span><StatusBadge status={(exc.severity || "").toLowerCase()} /></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="font-medium">{exc.status}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span className="font-medium">{shortDate(exc.created_date)}</span></div>
        {exc.reason && <div><p className="text-muted-foreground">Reason</p><p className="font-medium">{exc.reason}</p></div>}
        {exc.recommended_action && <div><p className="text-muted-foreground">Recommended action</p><p className="font-medium">{exc.recommended_action}</p></div>}
      </Card>
      {order && (
        <Card className="p-4 space-y-2 text-sm">
          <p className="font-semibold">Related order</p>
          <Link to={`/orders/${order.id}`} className="text-primary underline">{order.order_number}</Link>
          <div className="flex justify-between"><span className="text-muted-foreground">Order status</span><StatusBadge status={order.order_status} /></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Payment</span><StatusBadge status={order.payment_status} /></div>
        </Card>
      )}
      <div className="flex gap-2">
        {order && <Button asChild variant="outline"><Link to={`/orders/${order.id}`}>View order</Link></Button>}
        <Button onClick={resolve} disabled={resolving}>{resolving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}Resolve exception</Button>
      </div>
    </div>
  );
}