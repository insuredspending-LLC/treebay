import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAppUser } from "@/hooks/useAppUser";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Plus, MapPin, Calendar, Loader2, Package } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import StatusBadge from "@/components/StatusBadge";
import { RFQ_STATUS_LABELS, shortDate, formatNumber } from "@/lib/treebay";

export default function RFQs() {
  const { accountType, user } = useAppUser();
  const [rfqs, setRfqs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!user?.id) { setLoading(false); return; }
      try {
        const all = await base44.entities.RFQ.list("-created_date", 100) || [];
        setRfqs(all.filter((r) => r.buyer_id === user.id));
      } catch {}
      finally { setLoading(false); }
    })();
  }, [user?.id]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-heading font-bold">Requests for Quote</h1>
          <p className="text-sm text-muted-foreground">Track quotes from growers.</p>
        </div>
        <Button asChild><Link to="/projects"><Plus className="w-4 h-4 mr-1" /> New RFQ</Link></Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-2xl bg-muted skeleton-shimmer" />)}
        </div>
      ) : rfqs.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No RFQs yet"
          description="Create an RFQ from a project to collect competitive quotes from growers."
          action={<Button asChild><Link to="/projects">Go to projects</Link></Button>}
        />
      ) : (
        <div className="space-y-3">
          {rfqs.map((r) => {
            const units = (r.items || []).reduce((s, i) => s + (i.quantity || 0), 0);
            return (
              <Link key={r.id} to={`/rfqs/${r.id}`}>
                <Card className="p-4 card-shadow card-shadow-hover hover:border-primary/40 transition no-tap-highlight">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold flex items-center gap-2">
                        <FileText className="w-4 h-4 text-primary shrink-0" />
                        RFQ · {r.delivery_city}, {r.delivery_state}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1.5">
                        <Package className="w-3 h-3" /> {formatNumber(units)} units · {(r.items || []).length} line{(r.items || []).length === 1 ? "" : "s"}
                      </p>
                      {r.quote_deadline && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Calendar className="w-3 h-3" /> Quote by {shortDate(r.quote_deadline)}</p>}
                    </div>
                    <StatusBadge status={r.status} label={RFQ_STATUS_LABELS[r.status]} />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}