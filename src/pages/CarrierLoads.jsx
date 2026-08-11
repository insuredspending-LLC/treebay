import { useEffect, useState } from "react";
import { useAppUser } from "@/hooks/useAppUser";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Truck, Package, CheckCircle2, MapPin, Loader2, Clock } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import { formatCents, apiError } from "@/lib/treebay";

export default function CarrierLoads() {
  const { carrierProfile } = useAppUser();
  const { toast } = useToast();
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState("");
  const [pod, setPod] = useState({});

  const load = async () => {
    if (!carrierProfile) return;
    setLoading(true);
    try {
      const list = await base44.entities.Shipment.filter({ carrier_id: carrierProfile.id }, "-created_date", 100);
      setShipments(list || []);
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [carrierProfile]);

  const act = async (shipmentId, action, podData) => {
    setActing(shipmentId + action);
    try {
      const { data } = await base44.functions.invoke("updateCarrierFulfillment", { shipmentId, action, ...podData });
      toast({ title: data.declined ? "Load declined" : `Shipment ${data.shipment_status}` });
      load();
    } catch (e) { toast({ title: "Action failed", description: apiError(e), variant: "destructive" }); }
    finally { setActing(""); }
  };

  if (!carrierProfile) return null;

  const available = shipments.filter((s) => s.shipment_status === "assigned");
  const active = shipments.filter((s) => ["pickup_scheduled", "picked_up", "in_transit"].includes(s.shipment_status));
  const completed = shipments.filter((s) => ["delivered", "confirmed"].includes(s.shipment_status));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Loads</h1>
        <p className="text-sm text-muted-foreground">TEST FREIGHT — no real carrier is booked.</p>
      </div>
      <Tabs defaultValue="available">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="available"><Package className="w-4 h-4 mr-1" /> Available ({available.length})</TabsTrigger>
          <TabsTrigger value="active"><Truck className="w-4 h-4 mr-1" /> My Loads ({active.length})</TabsTrigger>
          <TabsTrigger value="completed"><CheckCircle2 className="w-4 h-4 mr-1" /> Completed ({completed.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="available" className="space-y-2">
          {available.length === 0 ? <EmptyState icon={Package} title="No available loads" description="New freight assignments will appear here." /> : available.map((s) => (
            <LoadCard key={s.id} shipment={s}>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => act(s.id, "accept")} disabled={!!acting}>
                  {acting === s.id + "accept" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Accept Load
                </Button>
                <Button size="sm" variant="outline" onClick={() => act(s.id, "decline")} disabled={!!acting}>Decline</Button>
              </div>
            </LoadCard>
          ))}
        </TabsContent>

        <TabsContent value="active" className="space-y-2">
          {active.length === 0 ? <EmptyState icon={Truck} title="No active loads" /> : active.map((s) => (
            <LoadCard key={s.id} shipment={s}>
              {s.shipment_status === "pickup_scheduled" && (
                <Button size="sm" onClick={() => act(s.id, "pickup")} disabled={!!acting}>
                  {acting === s.id + "pickup" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Confirm Pickup
                </Button>
              )}
              {s.shipment_status === "picked_up" && (
                <Button size="sm" onClick={() => act(s.id, "in_transit")} disabled={!!acting}>
                  {acting === s.id + "in_transit" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Mark In Transit
                </Button>
              )}
              {s.shipment_status === "in_transit" && (
                <PodForm shipmentId={s.id} pod={pod} setPod={setPod} acting={acting} onSubmit={act} />
              )}
            </LoadCard>
          ))}
        </TabsContent>

        <TabsContent value="completed" className="space-y-2">
          {completed.length === 0 ? <EmptyState icon={CheckCircle2} title="No completed loads" /> : completed.map((s) => (
            <LoadCard key={s.id} shipment={s} />
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LoadCard({ shipment: s, children }) {
  return (
    <Card className="p-4 space-y-2 card-shadow">
      <div className="flex justify-between items-start">
        <div>
          <p className="font-semibold text-sm">{s.cargo_description || "Freight load"}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" /> {s.pickup_location || "—"} → {s.delivery_location || "—"}</p>
        </div>
        <StatusBadge status={s.shipment_status} />
      </div>
      {s.delivery_price_cents != null && (
        <p className="text-sm font-medium text-primary">{formatCents(s.delivery_price_cents)}</p>
      )}
      {children}
    </Card>
  );
}

function PodForm({ shipmentId, pod, setPod, acting, onSubmit }) {
  const local = pod[shipmentId] || {};
  const set = (k, v) => setPod((p) => ({ ...p, [shipmentId]: { ...p[shipmentId], [k]: v } }));
  return (
    <div className="space-y-2 pt-2 border-t border-border">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Proof of Delivery</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1"><Label htmlFor={`rn-${shipmentId}`}>Receiver name</Label><Input id={`rn-${shipmentId}`} value={local.receiver_name || ""} onChange={(e) => set("receiver_name", e.target.value)} placeholder="Who received" /></div>
        <div className="space-y-1"><Label htmlFor={`cc-${shipmentId}`}>Confirmation code</Label><Input id={`cc-${shipmentId}`} value={local.confirmation_code || ""} onChange={(e) => set("confirmation_code", e.target.value)} placeholder="Signed code" /></div>
      </div>
      <div className="space-y-1"><Label htmlFor={`dn-${shipmentId}`}>Delivery notes</Label><Textarea id={`dn-${shipmentId}`} value={local.delivery_notes || ""} onChange={(e) => set("delivery_notes", e.target.value)} rows={2} placeholder="Any delivery notes" /></div>
      <Button size="sm" onClick={() => onSubmit(shipmentId, "deliver", local)} disabled={!!acting}>
        {acting === shipmentId + "deliver" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Confirm Delivery
      </Button>
    </div>
  );
}