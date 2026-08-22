import { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Leaf, ArrowLeft, ShieldCheck, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { apiError } from "@/lib/treebay";

export default function DeleteAccount() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!email) { toast({ title: "Enter your email", variant: "destructive" }); return; }
    setLoading(true);
    try {
      let authed = false;
      try { await base44.auth.me(); authed = true; } catch { authed = false; }
      if (authed) {
        await base44.functions.invoke("deleteAccount", {});
      } else {
        await base44.functions.invoke("requestDeletion", { email, reason });
      }
      setDone(true);
      toast({ title: "Request submitted", description: authed ? "Your marketplace data has been removed and your login disabled." : "Our team will process your request." });
    } catch (e) {
      toast({ title: "Could not submit", description: apiError(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="max-w-lg mx-auto">
        <button onClick={() => (window.history.length > 1 ? window.history.back() : (window.location.href = "/"))} className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-4"><ArrowLeft className="w-4 h-4" /> Back</button>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center"><Leaf className="w-5 h-5 text-primary-foreground" /></div>
          <h1 className="text-2xl font-bold">Delete your Tree Marketplace account</h1>
        </div>
        <p className="text-muted-foreground mt-1">You can request account deletion without opening the app. If you're signed in, your marketplace data is removed immediately and your inventory is archived. If you're signed out, submit the form below and our team will process your request.</p>

        <Card className="p-4 mt-6 space-y-3 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">What gets removed</p>
          <p>Your buyer/vendor profiles, projects, favorites, blocks, and notifications. Your listings are archived (no longer visible).</p>
          <p className="font-semibold text-foreground">What's retained</p>
          <p>Orders, reviews, messages, delivery details, and related transaction records may be retained where needed for accounting, tax, fraud prevention, dispute handling, and legal compliance. Your active marketplace profiles are removed, and retained records remain subject to access controls.</p>
          <p className="font-semibold text-foreground">Login account</p>
          <p>If you're signed in, your authentication account is disabled (can no longer be used to sign in) and you're signed out.</p>
        </Card>

        {done ? (
          <Card className="p-5 mt-6 text-center space-y-2">
            <ShieldCheck className="w-8 h-8 text-emerald-600 mx-auto" />
            <p className="font-semibold">Request received</p>
            <p className="text-sm text-muted-foreground">If you were signed in, your data has been removed. Otherwise, our team will process your request and confirm via email.</p>
            <Button variant="outline" onClick={() => { window.location.href = "/"; }}>Return home</Button>
          </Card>
        ) : (
          <Card className="p-4 mt-6 space-y-3">
            <div className="space-y-1.5"><Label>Email associated with your account</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></div>
            <div className="space-y-1.5"><Label>Reason (optional)</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} /></div>
            <Button onClick={submit} disabled={loading} className="w-full h-12">{loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}Submit deletion request</Button>
          </Card>
        )}

        <p className="text-xs text-muted-foreground mt-4">By submitting, you confirm this request is for your own account. See our <Link to="/privacy" className="text-primary underline">Privacy Policy</Link>.</p>
      </div>
    </div>
  );
}