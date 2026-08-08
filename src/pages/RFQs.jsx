import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAppUser } from "@/hooks/useAppUser";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Plus, MapPin, Calendar, Loader2 } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import StatusBadge from "@/components/StatusBadge";
import { RFQ_STATUS_LABELS, shortDate, formatNumber } from "@/lib/treebay";

export default function RFQs() {
  const { accountType } = useAppUser();
  const [rfqs, setRfqs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { setRfqs(await base44.entities.RFQ.list("-created_date", 100) || []); } catch {}
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold">Requests for Quote</h1><p className="text-sm text-muted-foreground">Track quotes from suppliers.</p></div>
        <Button asChild><Link to="/projects"><Plus className="w-4 h-4 mr-1" /> New RFQ</Link></Button>
      </div>
      {loading ? <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
        : rfqs.length === 0 ? <EmptyState icon={FileText} title="No RFQs yet" description="Create an RFQ from a project to collect competitive quotes from vendors." action={<Button asChild><Link to="/projects">Go to projects</Link></Button>} />
        : (
          <div className="space-y-3">
            {rfqs.map((r) => (
              <Link key={r.id} to={`/rfqs/${r.id}`}>
                <Card className="p-4 hover:shadow-sm hover:border-primary/40 transition">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">RFQ · {r.delivery_city}, {r.delivery_state}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><MapPin className="w-3 h-3" /> {formatNumber((r.items || []).reduce((s, i) => s + (i.quantity || 0), 0))} units · {(r.items || []).length} line{(r.items || []).length === 1 ? "" : "s"}</p>
                      {r.quote_deadline && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><Calendar className="w-3 h-3" /> Quote by {shortDate(r.quote_deadline)}</p>}
                    </div>
                    <StatusBadge status={r.status} label={RFQ_STATUS_LABELS[r.status]} />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
    </div>
  );
}