import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Leaf, Smartphone, ShieldCheck, TestTube2, CheckCircle2, ArrowRight, Loader2 } from "lucide-react";
import { apiError } from "@/lib/treebay";

const REQUIREMENTS = [
  "Be 18 or older and located in the United States",
  "Use an Android phone with Google Play",
  "Apply with the Google email connected to Google Play",
  "Remain opted in and actively test for 14 consecutive days",
];

const STEPS = [
  ["Request access", "Send the Google email you use with Google Play."],
  ["Receive the invitation", "We will approve eligible testers and send the official opt-in link."],
  ["Install and explore", "Test listings, sourcing, quotes, messaging, and order tracking."],
  ["Share feedback", "Report problems through the app so we can fix them before public release."],
];

export default function PublicLanding() {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  if (!isLoadingAuth && isAuthenticated) return <Navigate to="/home" replace />;

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await base44.functions.invoke("requestTesterAccess", { email, consent, website });
      setSubmitted(true);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-background/95 backdrop-blur">
        <div className="max-w-6xl mx-auto h-16 px-4 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
              <Leaf className="w-5 h-5 text-primary-foreground" />
            </span>
            <span className="font-heading font-extrabold text-lg text-primary">Tree Marketplace</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild><Link to="/login">Log in</Link></Button>
            <Button asChild><Link to="/register">Create account</Link></Button>
          </div>
        </div>
      </header>

      <main>
        <section className="overflow-hidden border-b bg-gradient-to-br from-emerald-50 via-background to-amber-50">
          <div className="max-w-6xl mx-auto px-4 py-16 md:py-24 grid md:grid-cols-[1.15fr_.85fr] gap-10 items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white/80 px-3 py-1.5 text-xs font-semibold text-primary">
                <Smartphone className="w-3.5 h-3.5" /> Google Play closed test · Android
              </div>
              <h1 className="mt-5 text-4xl md:text-6xl font-heading font-extrabold tracking-tight text-balance">
                Help us test the marketplace built for plants, trees, and landscape supply.
              </h1>
              <p className="mt-5 text-lg text-muted-foreground max-w-2xl">
                Tree Marketplace connects buyers, growers, and delivery providers through inventory, bulk quotes, messaging, and clear order tracking.
              </p>
              <div className="mt-7 flex flex-col sm:flex-row gap-3">
                <Button size="lg" asChild>
                  <a href="#tester-request">Become an Android tester <ArrowRight className="w-4 h-4 ml-2" /></a>
                </Button>
                <Button size="lg" variant="outline" asChild><Link to="/register">Create a free account</Link></Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                The app is free to join. Closed-test purchases are simulated, and no payment card is required.
              </p>
            </div>

            <Card className="p-6 md:p-8 shadow-xl border-primary/15 bg-white/90">
              <div className="flex items-center gap-3">
                <span className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center"><TestTube2 className="w-6 h-6 text-primary" /></span>
                <div>
                  <p className="font-heading font-bold text-xl">What testers will explore</p>
                  <p className="text-sm text-muted-foreground">Real workflows with simulated commerce</p>
                </div>
              </div>
              <div className="mt-6 grid gap-3 text-sm">
                {["Search nursery inventory", "Build and compare bulk RFQs", "Create seller listings and quotes", "Test messaging and order tracking", "Report freezes, errors, or confusing steps"].map((item) => (
                  <div key={item} className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-4 py-14 grid md:grid-cols-2 gap-8">
          <div>
            <p className="text-sm font-semibold text-primary uppercase tracking-wide">Who can participate</p>
            <h2 className="mt-2 text-3xl font-heading font-bold">Closed-test requirements</h2>
            <div className="mt-6 grid gap-3">
              {REQUIREMENTS.map((item) => (
                <div key={item} className="flex gap-3 p-3 rounded-xl bg-muted/60">
                  <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
                  <span className="text-sm">{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-primary uppercase tracking-wide">How it works</p>
            <h2 className="mt-2 text-3xl font-heading font-bold">Four simple steps</h2>
            <div className="mt-6 space-y-4">
              {STEPS.map(([title, body], index) => (
                <div key={title} className="flex gap-3">
                  <span className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">{index + 1}</span>
                  <div><p className="font-semibold">{title}</p><p className="text-sm text-muted-foreground">{body}</p></div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="tester-request" className="border-y bg-muted/35">
          <div className="max-w-xl mx-auto px-4 py-14">
            <Card className="p-6 md:p-8">
              {submitted ? (
                <div className="text-center py-4">
                  <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
                  <h2 className="mt-4 text-2xl font-heading font-bold">Request received</h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    We saved your Google Play email. If selected, you will receive the official closed-test invitation and opt-in instructions.
                  </p>
                  <Button className="mt-6" variant="outline" asChild><Link to="/register">Create your app account</Link></Button>
                </div>
              ) : (
                <>
                  <h2 className="text-2xl font-heading font-bold">Request tester access</h2>
                  <p className="mt-2 text-sm text-muted-foreground">Use the same Google email that is connected to Google Play on your Android phone.</p>
                  <form onSubmit={submit} className="mt-6 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="tester-email">Google Play email</Label>
                      <Input id="tester-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
                    </div>
                    <div className="absolute left-[-10000px]" aria-hidden="true">
                      <Label htmlFor="tester-website">Website</Label>
                      <Input id="tester-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
                    </div>
                    <label className="flex items-start gap-3 text-sm">
                      <input type="checkbox" className="mt-1 accent-primary" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
                      <span>I agree to be contacted about the Tree Marketplace closed test and understand that I can stop participating at any time.</span>
                    </label>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <Button type="submit" className="w-full h-12" disabled={submitting}>
                      {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      Request access
                    </Button>
                  </form>
                  <p className="mt-4 text-xs text-muted-foreground">
                    We use this email only to manage testing invitations and participation. See our <Link to="/privacy" className="underline">Privacy Policy</Link>.
                  </p>
                </>
              )}
            </Card>
          </div>
        </section>
      </main>

      <footer className="max-w-6xl mx-auto px-4 py-8 text-sm text-muted-foreground flex flex-col md:flex-row gap-3 justify-between">
        <p>© {new Date().getFullYear()} Tree Marketplace</p>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
          <Link to="/terms" className="hover:text-foreground">Terms</Link>
          <Link to="/community-rules" className="hover:text-foreground">Marketplace Rules</Link>
          <Link to="/delete-account" className="hover:text-foreground">Delete Account</Link>
          <Link to="/login" className="hover:text-foreground">Log in</Link>
        </div>
      </footer>
    </div>
  );
}
