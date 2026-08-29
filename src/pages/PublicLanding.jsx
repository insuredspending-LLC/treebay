import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandMark, BrandWordmark } from "@/components/Brand";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  FileText,
  Leaf,
  Loader2,
  MapPinned,
  PackageCheck,
  Search,
  ShieldCheck,
  Smartphone,
  Sprout,
  Store,
} from "lucide-react";
import { apiError } from "@/lib/treebay";

const TESTER_REQUIREMENTS = [
  "Be 18 or older and located in the United States",
  "Use an Android phone with Google Play",
  "Apply with the Google email connected to Google Play",
  "Remain opted in and actively test for 14 consecutive days",
];

const BUYER_STEPS = [
  {
    icon: Search,
    title: "Search and organize",
    body: "Explore nursery inventory or create a project list when you need several plant varieties.",
  },
  {
    icon: FileText,
    title: "Request and compare",
    body: "Send one clear bulk RFQ and compare grower responses without chasing separate spreadsheets.",
  },
  {
    icon: PackageCheck,
    title: "Coordinate fulfillment",
    body: "Keep messaging, pickup or seller delivery, documents, and order progress together.",
  },
];

const ROLE_CARDS = [
  {
    icon: Search,
    eyebrow: "For buyers",
    title: "Source with less back-and-forth",
    body: "Find plants, organize project needs, request bulk pricing, and keep each order connected to the work.",
    action: "Create a buyer account",
    to: "/register",
  },
  {
    icon: Store,
    eyebrow: "For growers",
    title: "Turn live inventory into opportunity",
    body: "Publish available stock, respond to qualified RFQs, manage orders, and prepare for connected payouts.",
    action: "Join as a seller",
    to: "/register",
  },
  {
    icon: MapPinned,
    eyebrow: "For project teams",
    title: "Keep sourcing and delivery visible",
    body: "Give estimators, purchasers, growers, and field teams a clearer shared view of what is needed next.",
    action: "See how it works",
    to: "#how-it-works",
  },
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
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/88 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto h-16 px-4 md:px-6 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5 no-tap-highlight" aria-label="Tree Marketplace home">
            <BrandMark className="w-9 h-9 rounded-xl shadow-sm" />
            <BrandWordmark className="text-lg sm:text-xl" />
          </Link>
          <nav className="hidden lg:flex items-center gap-1 text-sm font-medium text-muted-foreground">
            <a href="#why-tree-marketplace" className="px-3 py-2 rounded-lg hover:bg-secondary/70 hover:text-foreground transition-colors">Why Tree Marketplace</a>
            <a href="#how-it-works" className="px-3 py-2 rounded-lg hover:bg-secondary/70 hover:text-foreground transition-colors">How it works</a>
            <a href="#android-test" className="px-3 py-2 rounded-lg hover:bg-secondary/70 hover:text-foreground transition-colors">Android test</a>
          </nav>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Button variant="ghost" className="px-3" asChild><Link to="/login">Log in</Link></Button>
            <Button className="hidden sm:inline-flex" asChild><Link to="/register">Create account</Link></Button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-border/70">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,hsl(var(--secondary))_0,transparent_36%),radial-gradient(circle_at_85%_5%,hsl(42_70%_92%)_0,transparent_32%)] opacity-80" aria-hidden="true" />
          <div className="relative max-w-7xl mx-auto px-4 md:px-6 py-16 md:py-24 lg:py-28 grid lg:grid-cols-[1.02fr_.98fr] gap-12 lg:gap-16 items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-card/85 px-3.5 py-2 text-xs font-semibold text-primary shadow-sm">
                <Sprout className="w-3.5 h-3.5" />
                The landscape supply marketplace
              </div>
              <h1 className="mt-6 max-w-3xl text-4xl sm:text-5xl md:text-6xl lg:text-[4.4rem] lg:leading-[1.02] font-heading font-extrabold tracking-[-0.045em] text-balance">
                Find the right plants. Get the right price. Move projects forward.
              </h1>
              <p className="mt-6 text-lg md:text-xl leading-relaxed text-muted-foreground max-w-2xl">
                Tree Marketplace brings buyers, nursery growers, and project teams into one clearer sourcing workflow—from inventory and bulk quotes to fulfillment progress.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Button size="lg" className="h-12 px-6 text-base shadow-lg shadow-primary/15" asChild>
                  <Link to="/register">Start sourcing <ArrowRight className="w-4 h-4 ml-1" /></Link>
                </Button>
                <Button size="lg" variant="outline" className="h-12 px-6 text-base bg-card/70" asChild>
                  <Link to="/register">List your nursery inventory</Link>
                </Button>
              </div>
              <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2"><BadgeCheck className="w-4 h-4 text-primary" /> Free to create an account</span>
                <span className="inline-flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary" /> Controlled launch protections</span>
                <span className="inline-flex items-center gap-2"><Leaf className="w-4 h-4 text-primary" /> Built for plant sourcing</span>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-5 rounded-[2.5rem] bg-primary/10 blur-2xl" aria-hidden="true" />
              <Card className="relative overflow-hidden rounded-[2rem] border-primary/15 bg-card/85 p-2.5 shadow-2xl shadow-primary/10">
                <img
                  src="/tree-marketplace-feature.jpg"
                  alt="Tree Marketplace — trees, plants, and delivery connected"
                  className="w-full rounded-[1.45rem] object-cover"
                />
                <div className="grid sm:grid-cols-3 gap-2 p-2.5 pt-4">
                  <div className="rounded-2xl bg-secondary/70 p-3">
                    <p className="text-xs font-semibold text-primary">Source</p>
                    <p className="mt-1 text-sm font-medium">Inventory and projects</p>
                  </div>
                  <div className="rounded-2xl bg-secondary/70 p-3">
                    <p className="text-xs font-semibold text-primary">Compare</p>
                    <p className="mt-1 text-sm font-medium">Bulk grower quotes</p>
                  </div>
                  <div className="rounded-2xl bg-secondary/70 p-3">
                    <p className="text-xs font-semibold text-primary">Coordinate</p>
                    <p className="mt-1 text-sm font-medium">Orders and delivery</p>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </section>

        <section id="why-tree-marketplace" className="max-w-7xl mx-auto px-4 md:px-6 py-16 md:py-20">
          <div className="max-w-3xl">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">One marketplace, three useful views</p>
            <h2 className="mt-3 text-3xl md:text-5xl font-heading font-bold tracking-tight text-balance">A better working surface for plant sourcing.</h2>
            <p className="mt-4 text-lg text-muted-foreground">Less time translating phone calls and spreadsheets. More time comparing the information that actually moves a landscape project.</p>
          </div>
          <div className="mt-10 grid md:grid-cols-3 gap-4">
            {ROLE_CARDS.map((item) => {
              const Icon = item.icon;
              const isAnchor = item.to.startsWith("#");
              const body = (
                <Card className="h-full p-6 md:p-7 rounded-3xl border-border/80 card-shadow card-shadow-hover group">
                  <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-primary">{item.eyebrow}</p>
                  <h3 className="mt-2 text-2xl font-heading font-bold">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.body}</p>
                  <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                    {item.action} <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </Card>
              );
              return isAnchor ? <a key={item.eyebrow} href={item.to}>{body}</a> : <Link key={item.eyebrow} to={item.to}>{body}</Link>;
            })}
          </div>
        </section>

        <section id="how-it-works" className="border-y border-border/70 bg-secondary/35">
          <div className="max-w-7xl mx-auto px-4 md:px-6 py-16 md:py-20">
            <div className="grid lg:grid-cols-[.8fr_1.2fr] gap-10 lg:gap-16 items-start">
              <div className="lg:sticky lg:top-24">
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-primary">How it works</p>
                <h2 className="mt-3 text-3xl md:text-5xl font-heading font-bold tracking-tight text-balance">From plant list to a workable plan.</h2>
                <p className="mt-4 text-muted-foreground leading-7">Start with what you need. Tree Marketplace keeps the search, quote, conversation, and order context connected as the job develops.</p>
                <Button className="mt-7" asChild><Link to="/register">Create your workspace <ArrowRight className="w-4 h-4" /></Link></Button>
              </div>
              <div className="grid gap-4">
                {BUYER_STEPS.map((step, index) => {
                  const Icon = step.icon;
                  return (
                    <Card key={step.title} className="p-5 md:p-6 rounded-3xl bg-card/90">
                      <div className="flex gap-4 md:gap-5">
                        <span className="w-11 h-11 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center font-heading font-bold shrink-0">{index + 1}</span>
                        <div>
                          <div className="flex items-center gap-2">
                            <Icon className="w-5 h-5 text-primary" />
                            <h3 className="text-xl font-heading font-bold">{step.title}</h3>
                          </div>
                          <p className="mt-2 text-sm md:text-base leading-6 text-muted-foreground">{step.body}</p>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 md:px-6 py-16 md:py-20">
          <Card className="overflow-hidden rounded-[2rem] border-primary/15 bg-primary text-primary-foreground">
            <div className="grid lg:grid-cols-[1.15fr_.85fr]">
              <div className="p-7 md:p-10 lg:p-12">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-foreground/70">Founding growers</p>
                <h2 className="mt-3 text-3xl md:text-5xl font-heading font-bold text-balance">Put your inventory where buyers can work with it.</h2>
                <p className="mt-4 max-w-2xl text-primary-foreground/75 leading-7">Create an operational seller profile without waiting for routine admin approval. Add inventory, respond to RFQs, and prepare your payout account for live commerce.</p>
                <Button size="lg" variant="secondary" className="mt-7 h-12" asChild><Link to="/register">Create a seller account <ArrowRight className="w-4 h-4" /></Link></Button>
              </div>
              <div className="bg-black/10 p-7 md:p-10 lg:p-12 flex items-center">
                <div className="grid gap-4 text-sm">
                  {[
                    "Automatic seller activation after onboarding",
                    "Inventory, pricing, availability, and bulk tiers",
                    "RFQ opportunities and order management",
                    "Stripe Connect-ready payout architecture",
                  ].map((item) => (
                    <div key={item} className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 mt-0.5 text-emerald-200 shrink-0" />
                      <span className="font-medium">{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </section>

        <section id="android-test" className="border-y border-border/70 bg-muted/45">
          <div className="max-w-7xl mx-auto px-4 md:px-6 py-16 md:py-20 grid lg:grid-cols-[.9fr_1.1fr] gap-10 lg:gap-16 items-start">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-card px-3 py-1.5 text-xs font-semibold text-primary">
                <Smartphone className="w-3.5 h-3.5" /> Google Play closed test · Android
              </div>
              <h2 className="mt-5 text-3xl md:text-4xl font-heading font-bold">Help shape the Android experience.</h2>
              <p className="mt-4 text-muted-foreground leading-7">The website is live, and the Android app is in a controlled closed test. Test purchases are simulated, and no payment card is required.</p>
              <div className="mt-6 grid gap-3">
                {TESTER_REQUIREMENTS.map((item) => (
                  <div key={item} className="flex gap-3 rounded-2xl border border-border/70 bg-card/75 p-3.5">
                    <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
                    <span className="text-sm">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <Card className="p-6 md:p-8 rounded-3xl card-shadow">
              {submitted ? (
                <div className="text-center py-5">
                  <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
                  <h3 className="mt-4 text-2xl font-heading font-bold">Request received</h3>
                  <p className="mt-2 text-sm text-muted-foreground">We saved your Google Play email. If selected, you will receive the official invitation and opt-in instructions.</p>
                  <Button className="mt-6" variant="outline" asChild><Link to="/register">Create your marketplace account</Link></Button>
                </div>
              ) : (
                <>
                  <h3 className="text-2xl font-heading font-bold">Request tester access</h3>
                  <p className="mt-2 text-sm text-muted-foreground">Use the same Google email connected to Google Play on your Android phone.</p>
                  <form onSubmit={submit} className="mt-6 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="tester-email">Google Play email</Label>
                      <Input id="tester-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required className="h-11" />
                    </div>
                    <div className="absolute left-[-10000px]" aria-hidden="true">
                      <Label htmlFor="tester-website">Website</Label>
                      <Input id="tester-website" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
                    </div>
                    <label className="flex items-start gap-3 rounded-2xl bg-muted/60 p-3.5 text-sm">
                      <input type="checkbox" className="mt-1 accent-primary" checked={consent} onChange={(event) => setConsent(event.target.checked)} required />
                      <span>I agree to be contacted about the Tree Marketplace closed test and understand that I can stop participating at any time.</span>
                    </label>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <Button type="submit" className="w-full h-12" disabled={submitting}>
                      {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      Request access
                    </Button>
                  </form>
                  <p className="mt-4 text-xs text-muted-foreground">We use this email only to manage testing invitations and participation. See our <Link to="/privacy" className="underline underline-offset-2">Privacy Policy</Link>.</p>
                </>
              )}
              <div className="mt-6 pt-5 border-t text-center">
                <a href="https://play.google.com/apps/testing/com.insuredspending.treebay" target="_blank" rel="noreferrer" className="text-sm font-semibold text-primary underline underline-offset-4">
                  Already invited? Join the closed test
                </a>
              </div>
            </Card>
          </div>
        </section>
      </main>

      <footer className="max-w-7xl mx-auto px-4 md:px-6 py-10">
        <div className="flex flex-col md:flex-row gap-6 md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2.5"><BrandMark className="w-8 h-8" /><BrandWordmark /></div>
            <p className="mt-2 text-sm text-muted-foreground">Trees, plants, and delivery—connected.</p>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
            <Link to="/terms" className="hover:text-foreground">Terms</Link>
            <Link to="/community-rules" className="hover:text-foreground">Marketplace Rules</Link>
            <Link to="/delete-account" className="hover:text-foreground">Delete Account</Link>
            <Link to="/login" className="hover:text-foreground">Log in</Link>
          </div>
        </div>
        <p className="mt-8 pt-6 border-t text-xs text-muted-foreground">{"© " + new Date().getFullYear() + " Tree Marketplace. All rights reserved."}</p>
      </footer>
    </div>
  );
}
