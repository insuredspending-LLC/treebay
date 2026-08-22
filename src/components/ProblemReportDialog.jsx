import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { apiError } from "@/lib/treebay";

const REPORT_TYPES = {
  manual_bug: "Something is broken",
  usability: "Something is confusing",
  onboarding: "I need setup help",
  suggestion: "I have a suggestion",
};

const IMPACTS = {
  minor: "I can keep going",
  slows_me_down: "It slows me down",
  blocked: "I cannot continue",
};

export default function ProblemReportDialog({ open, onOpenChange, defaultType = "manual_bug" }) {
  const [reportType, setReportType] = useState(defaultType);
  const [impact, setImpact] = useState("slows_me_down");
  const [details, setDetails] = useState("");
  const [expected, setExpected] = useState("");
  const [saving, setSaving] = useState(false);
  const [submittedId, setSubmittedId] = useState("");
  const [error, setError] = useState("");

  const close = (nextOpen) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setTimeout(() => {
        setDetails("");
        setExpected("");
        setReportType(defaultType);
        setImpact("slows_me_down");
        setSubmittedId("");
        setError("");
      }, 200);
    }
  };

  const submit = async () => {
    if (!details.trim()) {
      setError("Tell us what you tapped and what happened.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const report = await base44.entities.CrashReport.create({
        route: window.location.pathname + window.location.search,
        message: REPORT_TYPES[reportType],
        stack: "",
        component_stack: "",
        user_agent: navigator.userAgent || "",
        details: details.trim(),
        expected_behavior: expected.trim(),
        report_type: reportType,
        impact,
        status: "open",
      });
      setSubmittedId(report?.id || "submitted");
    } catch (submitError) {
      setError(apiError(submitError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        {submittedId ? (
          <div className="py-5 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <DialogHeader>
              <DialogTitle className="text-center">Report received</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">It is now visible in the Tree Marketplace admin issue inbox for review.</p>
            {submittedId !== "submitted" && <p className="text-xs text-muted-foreground">Reference: {submittedId.slice(-8)}</p>}
            <Button className="w-full" onClick={() => close(false)}>Done</Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                Report a problem
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-1">
              <div className="space-y-2">
                <Label>What do you need help with?</Label>
                <Select value={reportType} onValueChange={setReportType}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(REPORT_TYPES).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>How much does it affect you?</Label>
                <Select value={impact} onValueChange={setImpact}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(IMPACTS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>What happened?</Label>
                <Textarea
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                  rows={5}
                  placeholder="Example: I tapped Continue after entering my address, but nothing happened."
                />
              </div>

              <div className="space-y-2">
                <Label>What did you expect? <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Textarea
                  value={expected}
                  onChange={(event) => setExpected(event.target.value)}
                  rows={3}
                  placeholder="Example: I expected to move to the next setup step."
                />
              </div>

              <p className="text-xs text-muted-foreground">Tree Marketplace automatically includes the current screen and device type. It does not include passwords or form entries.</p>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => close(false)}>Cancel</Button>
              <Button onClick={submit} disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Send report
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
