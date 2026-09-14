import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAppUser } from "@/hooks/useAppUser";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ArrowRight, BarChart3, CheckCircle2, Loader2, MapPin, Package, Route, Truck } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";

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
          available: list.filter((shipment) => shipment.shipment_status === "assigned").length,
          active: list.filter((shipment) => ["pickup_scheduled", "picked_up", "in_transit"].includes(shipment.shipment_status)).length,
          completed: list.filter((shipment) => ["delivered", "confirmed"].includes(shipment.shipment_status)).length,
        });
      } catch {}
      finally { setLoading(false); }
    })();
  }, [carrierProfile]);

  if (!carrierProfile) return null;

  return (
    <div className="space-y-8 md:space-y-10">
      <header className="flex flex-col justify-between gap-5 border-b border-border/70 pb-7 sm:flex-row sm:items-end">
        <div>
          <p className="editorial-kicker">Carrier workspace</p>
          <h1 className="mt-3 font-display text-4xl font-semibold leading-none md:text-5xl">{carrierProfile.business_name}</h1>
          <p className="mt-4 text-sm text-muted-foreground">A focused view of assigned loads, movement, and delivery progress.</p>
        </div>
        <Button asChild className="h-12 rounded-full px-6"><Link to="/carrier/loads"><Truck className="h-4 w-4" /> Open load board</Link></Button>
      </header>

      <div className="flex flex-col gap-2 rounded-2xl border border-amber-200/80 bg-amber-50/75 px-5 py-4 text-amber-950 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2"><span className="rounded-full bg-amber-200/60 px-2 py-1 text-[10px] font-bold uppercase tracking-wide">Test freight</span><p className="text-sm">No real carrier is booked or paid through these assignments.</p></div>
        <span className="text-xs font-medium text-amber-800">Controlled launch</span>
      </div>

      {carrierProfile.verification_status !== "verified" && (
        <div className="rounded-2xl border border-border/70 bg-card p-5">
          <div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">Carrier verification</p><StatusBadge status={carrierProfile.verification_status} /></div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">TEST freight assignments may only use verified carriers. An admin must verify your carrier profile before you can accept loads.</p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center rounded-[1.75rem] border border-border/70 bg-card py-16"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
      ) : (
        <section className="grid grid-cols-3 overflow-hidden rounded-[1.75rem] border border-border/70 bg-card">
          <StatCard icon={Package} label="Assigned" value={stats.available} onClick={() => navigate("/carrier/loads")} />
          <StatCard icon={Truck} label="In progress" value={stats.active} onClick={() => navigate("/carrier/loads")} />
          <StatCard icon={CheckCircle2} label="Completed" value={stats.completed} onClick={() => navigate("/carrier/loads")} />
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-[1.3fr_.7fr]">
        <div className="overflow-hidden rounded-[1.75rem] bg-[#17292b] text-white">
          <div className="border-b border-white/10 p-7 md:p-9">
            <Route className="h-8 w-8 text-[#b9cfbd]" />
            <p className="mt-6 text-[10px] font-bold uppercase tracking-[.2em] text-[#b9cfbd]">Dispatch, simplified</p>
            <h2 className="mt-3 max-w-xl font-display text-4xl font-semibold leading-none">Know the load.<br />Know the next move.</h2>
            <p className="mt-5 max-w-xl text-sm leading-6 text-white/60">Keep assigned work, pickup and drop-off details, dimensions, and delivery updates in one operational view.</p>
          </div>
          <div className="grid sm:grid-cols-2">
            <Link to="/carrier/loads" className="group flex items-center justify-between gap-4 border-b border-white/10 p-7 transition hover:bg-white/5 sm:border-b-0 sm:border-r">
              <div><Truck className="h-5 w-5 text-[#b9cfbd]" /><p className="mt-3 text-sm font-semibold">Load board</p><p className="mt-1 text-xs text-white/50">Assigned and active shipments</p></div>
              <ArrowRight className="h-4 w-4 text-white/65 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link to="/carrier/financials" className="group flex items-center justify-between gap-4 p-7 transition hover:bg-white/5">
              <div><BarChart3 className="h-5 w-5 text-[#b9cfbd]" /><p className="mt-3 text-sm font-semibold">Financial records</p><p className="mt-1 text-xs text-white/50">Shipment-related earnings view</p></div>
              <ArrowRight className="h-4 w-4 text-white/65 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>

        <div className="overflow-hidden rounded-[1.75rem] border border-border/70 bg-card">
          <div className="flex items-center justify-between border-b border-border/60 px-6 py-5"><h2 className="font-bold">Carrier profile</h2><Link to="/carrier/edit-profile" className="text-xs font-semibold text-primary">Edit profile</Link></div>
          <div className="space-y-6 p-6">
            <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-muted-foreground">Operating from</p><p className="mt-2 flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4 text-primary" />{carrierProfile.city}, {carrierProfile.state}</p></div>
            <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-muted-foreground">Contact</p><p className="mt-2 text-sm font-semibold">{carrierProfile.contact_name}</p><p className="mt-1 text-sm text-muted-foreground">{carrierProfile.phone}</p></div>
            {carrierProfile.equipment_type && <div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-muted-foreground">Equipment</p><p className="mt-2 text-sm font-semibold">{carrierProfile.equipment_type}</p></div>}
            <div className="border-t border-border/60 pt-5"><p className="mb-2 text-[10px] font-bold uppercase tracking-[.18em] text-muted-foreground">Verification</p><StatusBadge status={carrierProfile.verification_status} /></div>
          </div>
        </div>
      </section>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, onClick }) {
  return (
    <button onClick={onClick} className="group border-r border-border/65 p-5 text-left transition last:border-r-0 hover:bg-secondary/30 md:p-7">
      <Icon className="h-5 w-5 text-primary/65" />
      <p className="mt-5 font-heading text-4xl font-bold tracking-tight">{value}</p>
      <div className="mt-2 flex items-center justify-between"><p className="text-xs text-muted-foreground">{label}</p><ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition group-hover:opacity-100" /></div>
    </button>
  );
}
