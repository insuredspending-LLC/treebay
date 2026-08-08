import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { REPORT_REASONS } from "@/lib/treebay";
import { Flag, Loader2 } from "lucide-react";

export default function ReportDialog({ open, onOpenChange, targetType, targetId, targetLabel }) {
  const [reason, setReason] = useState(REPORT_REASONS[0].value);
  const [details, setDetails] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const submit = async () => {
    if (!reason) return;
    setLoading(true);
    try {
      const me = await base44.auth.me();
      await base44.entities.ContentReport.create({
        reporter_id: me.id, target_type: targetType, target_id: targetId,
        reason, details, status: "open",
      });
      toast({ title: "Report submitted", description: "Our team will review this shortly." });
      onOpenChange(false);
      setDetails("");
      setReason(REPORT_REASONS[0].value);
    } catch (e) {
      toast({ title: "Could not submit report", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Flag className="w-4 h-4" /> Report {targetLabel || "content"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Reason</Label>
            <RadioGroup value={reason} onValueChange={setReason} className="grid gap-2">
              {REPORT_REASONS.map((r) => (
                <label key={r.value} className="flex items-center gap-2 text-sm cursor-pointer">
                  <RadioGroupItem value={r.value} /> {r.label}
                </label>
              ))}
            </RadioGroup>
          </div>
          <div className="space-y-2">
            <Label>Details (optional)</Label>
            <Textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} placeholder="Tell us what's wrong..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Submit report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}