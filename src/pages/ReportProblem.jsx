import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import { apiError } from "@/lib/treebay";

export default function ReportProblem() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [details, setDetails] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!details.trim()) {
      toast({ title: "Describe what happened", description: "Tell us what you tapped and what the app did.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await base44.entities.CrashReport.create({
        route: location.state?.from || window.location.pathname + window.location.search,
        message: "User-submitted app problem",
        stack: "",
        component_stack: "",
        user_agent: navigator.userAgent || "",
        details: details.trim(),
        expected_behavior: "",
        report_type: "manual_bug",
        impact: "slows_me_down",
        status: "open",
      });
      toast({ title: "Problem submitted", description: "The report was saved for review." });
      setDetails("");
    } catch (e) {
      toast({ title: "Could not submit report", description: apiError(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-1 text-sm text-muted-foreground">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-600" /> Report a Problem</h1>
        <p className="text-sm text-muted-foreground mt-1">Use this during testing for freezes, white screens, errors, or anything that does not behave correctly.</p>
      </div>
      <Card className="p-4 space-y-3">
        <div className="space-y-2">
          <Label>What happened?</Label>
          <Textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={7}
            placeholder="Example: I tapped Buy Plants, the screen turned white, and I had to close the app."
          />
        </div>
        <Button onClick={submit} disabled={saving} className="w-full h-12">
          {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Submit Problem
        </Button>
      </Card>
    </div>
  );
}
