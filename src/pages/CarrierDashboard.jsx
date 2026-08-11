import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAppUser } from "@/hooks/useAppUser";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Truck, Package, CheckCircle2, BarChart3, Loader2, MapPin, Clock } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { formatCents } from "@/lib/treebay";

export default function CarrierDashboard() {
  const { carrierProfile } = useAppUser();
  const navigate = useNavigate();
  const [stats, setStats] = useState({ available: 0, active: 0, completed: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!carrierProfile) return;
    (async () => {
      try {
        const shipments = await base44.entities.Shipment.filter({ carrier_id: carrierProfile.id }, "-created_date", 100);
        const list = shipments || [];
        setStats({
          available: list.filter((s) => s.shipment_status === "assigned").length,
          active: list.filter((s) => ["pickup_scheduled", "picked_up", "in_transit"].includes(s.shipment_status)).length,
          completed: list.filter((s) => ["delivered", "confirmed"].includes(s.shipment_status)).length,
        });
      } catch {}
      finally { setLoading(false); }
    })();
  }, [carrierProfile]);

  if (!carrierProfile) return null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">{carrierProfile.business_name}</h1>
        <p className="text-sm text-muted-foreground">TEST MODE — no real carrier is booked.</p>
      </div>

      {carrierProfile.verification_status !== "verified" && (
        <Card className="p-4 border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-800">
            <strong>Carrier verification: {carrierProfile.verification_status}.</strong>{" "}
            TEST freight assignments may only use verified carriers. An admin must verify your carrier profile before you can accept loads.
          </p>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <StatCard icon={Package} label="Available" value={stats.available} onClick={() => navigate("/carrier/loads")} />
          <StatCard icon={Truck} label="My Loads" value={stats.active} onClick={() => navigate("/carrier/loads")} />
          <StatCard icon={CheckCircle2} label="Completed" value={stats.completed} onClick={() => navigate("/carrier/loads")} />
        </div>
      )}

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-sm">Quick Actions</h2>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" asChild><Link to="/carrier/loads"><Truck className="w-4 h-4 mr-2" /> View Loads</Link></Button>
          <Button variant="outline" asChild><Link to="/carrier/financials"><BarChart3 className="w-4 h-4 mr-2" /> Financials</Link></Button>
        </div>
      </Card>

      <Card className="p-4 space-y-2">
        <h2 className="font-semibold text-sm">Carrier Profile</h2>
        <div className="text-sm space-y-1">
          <p><span className="text-muted-foreground">Contact:</span> {carrierProfile.contact_name}</p>
          <p><span className="text-muted-foreground">Phone:</span> {carrierProfile.phone}</p>
          <p><span className="text-muted-foreground">Location:</span> {carrierProfile.city}, {carrierProfile.state}</p>
          {carrierProfile.equipment_type && <p><span className="text-muted-foreground">Equipment:</span> {carrierProfile.equipment_type}</p>}
          <div className="flex items-center gap-2 pt-1">
            <span className="text-muted-foreground">Verification:</span>
            <StatusBadge status={carrierProfile.verification_status} />
          </div>
        </div>
      </Card>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, onClick }) {
  return (
    <button onClick={onClick} className="text-left">
      <Card className="p-4 card-shadow-hover">
        <Icon className="w-5 h-5 text-primary" />
        <p className="text-2xl font-bold mt-2">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </Card>
    </button>
  );
}