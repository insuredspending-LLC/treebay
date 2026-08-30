import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandMark, BrandWordmark } from "@/components/Brand";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  FileText,
  Flower2,
  Leaf,
  Loader2,
  MapPin,
  PackageCheck,
  Search,
  ShieldCheck,
  Smartphone,
  Sprout,
  Store,
  TreePine,
  Truck,
} from "lucide-react";
import { apiError } from "@/lib/treebay";

const TESTER_REQUIREMENTS = [
  "18 or older and located in the United States",
  "An Android phone with Google Play",
  "The Google email connected to Google Play",
  "Available to test for 14 consecutive days",
];

const CATEGORY_TILES = [
  {
    name: "Specimen trees",
    detail: "Shade, ornamental & evergreen",
    image: "/marketplace/category-trees.webp",
    icon: TreePine,
    className: "md:col-span-2 md:row-span-2",
  },
  {
    name: "Native plants",
    detail: "Resilient regional selections",
    image: "/marketplace/category-native.webp",
    icon: Flower2,
    className: "",
  },
  {
    name: "Palms",
    detail: "Architectural & tropical",
    image: "/marketplace/category-palms.webp",
    icon: Leaf,
    className: "",
  },
];

const WORKFLOW = [
  {
    number: "01",
    icon: Search,
    title: "Search real inventory",
    body: "Browse live nursery stock by plant, size, location, availability, and fulfillment options.",
  },
  {
    number: "02",
    icon: FileText,
    title: "Request project pricing",
    body: "Send one organized plant list to qualified growers and compare complete responses in one place.",
  },
  {
    number: "03",
    icon: PackageCheck,
    title: "Coordinate fulfillment",
    body: "Keep orders, documents, pickup, seller delivery, and conversations connected to the project.",
  },
];

export default function PublicLanding() {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  if (!isLoadingAuth && isAuthenticated) return <Navigate to="/home" replace />;

  const beginSearch = (event) => {
    event.preventDefault();
    const query = search.trim();
    navigate(query ? "/register?search=" + encodeURIComponent(query) : "/register");
  };

  const submitTesterRequest = async (event) => {
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
    <div className="min-h-screen bg-[#f7f4ed] text-[#152119]">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-[#10251a]/80 text-white backdrop-blur-xl">
        <div className="page-shell flex h-[4.5rem] items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5 no-tap-highlight" aria-label="Tree Marketplace home">
            <BrandMark className="h-9 w-9 rounded-full bg-white/12 ring-1 ring-white/20" />
            <BrandWordmark className="text-lg text-white sm:text-xl" />
          </Link>

          <nav className="hidden items-center gap-8 text-sm font-medium text-white/70 lg:flex">
            <a href="#shop" className="transition-colors hover:text-white">Marketplace</a>
            <a href="#how-it-works" className="transition-colors hover:text-white">How it works</a>
            <a href="#for-growers" className="transition-colors hover:text-white">For growers</a>
          </nav>

          <div className="flex items-center gap-2">
            <Button variant="ghost" className="text-white hover:bg-white/10 hover:text-white" asChild>
              <Link to="/login">Log in</Link>
            </Button>
            <Button className="hidden rounded-full bg-[#dce9c9] px-5 text-[#173522] hover:bg-white sm:inline-flex" asChild>
              <Link to="/register">Join marketplace</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="relative min-h-[760px] overflow-hidden bg-[#10251a] text-white lg:min-h-[820px]">
          <img
            src="/marketplace/tree-marketplace-nursery-hero.webp"
            alt="Specimen trees at a professional wholesale nursery"
            className="absolute inset-0 h-full w-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(9,28,18,.96)_0%,rgba(9,28,18,.84)_35%,rgba(9,28,18,.28)_72%,rgba(9,28,18,.12)_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(9,28,18,.68)_0%,transparent_45%)]" />

          <div className="page-shell relative flex min-h-[760px] items-center pt-24 lg:min-h-[820px]">
            <div className="max-w-3xl py-16">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold tracking-wide text-[#e6efd8] backdrop-blur">
                <Sprout className="h-4 w-4" />
                The landscape supply marketplace
              </div>

              <h1 className="mt-7 max-w-[13ch] font-display text-[3.65rem] font-semibold leading-[0.94] tracking-[-0.045em] text-white sm:text-[4.8rem] md:text-[6.4rem]">
                Source plants. Compare suppliers. Move projects forward.
              </h1>

              <p className="mt-7 max-w-2xl text-base leading-7 text-white/72 sm:text-lg md:text-xl">
                Discover nursery inventory, request project pricing, and coordinate fulfillment with growers built for professional landscape work.
              </p>

              <form onSubmit={beginSearch} className="mt-9 flex max-w-2xl flex-col gap-2 rounded-[1.35rem] border border-white/15 bg-white p-2 shadow-2xl shadow-black/25 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#536057]" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search trees, plants & materials"
                    aria-label="Search plants"
                    className="h-14 border-0 bg-transparent pl-12 text-base text-[#152119] shadow-none focus-visible:ring-0"
                  />
                </div>
                <Button type="submit" size="lg" className="h-14 rounded-xl px-7">Search marketplace</Button>
              </form>

              <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/62">
                <span className="inline-flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-[#dce9c9]" /> Qualified growers</span>
                <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-[#dce9c9]" /> Location-aware sourcing</span>
                <span className="inline-flex items-center gap-2"><Truck className="h-4 w-4 text-[#dce9c9]" /> Pickup and delivery options</span>
              </div>
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 border-t border-white/10 bg-black/10 backdrop-blur-sm">
            <div className="page-shell grid grid-cols-3 divide-x divide-white/10 py-5 text-white/65">
              <div className="pr-4"><p className="text-[10px] font-bold uppercase tracking-[.2em]">Source</p><p className="mt-1 text-sm font-medium text-white">Live nursery inventory</p></div>
              <div className="px-4"><p className="text-[10px] font-bold uppercase tracking-[.2em]">Compare</p><p className="mt-1 text-sm font-medium text-white">Project-ready quotes</p></div>
              <div className="pl-4"><p className="text-[10px] font-bold uppercase tracking-[.2em]">Coordinate</p><p className="mt-1 text-sm font-medium text-white">Orders and fulfillment</p></div>
            </div>
          </div>
        </section>

        <section id="shop" className="page-shell py-20 md:py-28">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div className="max-w-3xl">
              <p className="editorial-kicker">Shop the landscape</p>
              <h2 className="mt-4 font-display text-4xl font-semibold leading-none tracking-tight md:text-6xl">
                Start with what the project needs.
              </h2>
            </div>
            <Link to="/register" className="group inline-flex items-center gap-2 text-sm font-semibold text-primary">
              Browse all categories <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          <div className="mt-10 grid min-h-[680px] gap-4 md:grid-cols-4 md:grid-rows-2">
            {CATEGORY_TILES.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  to={"/register?category=" + encodeURIComponent(item.name)}
                  className={"group relative min-h-[320px] overflow-hidden rounded-[2rem] bg-[#1c2c22] " + item.className}
                >
                  <img src={item.image} alt="" className="image-zoom absolute inset-0 h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/8 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-6 text-white md:p-8">
                    <div>
                      <Icon className="mb-3 h-5 w-5 text-[#dce9c9]" />
                      <h3 className="text-2xl font-bold">{item.name}</h3>
                      <p className="mt-1 text-sm text-white/68">{item.detail}</p>
                    </div>
                    <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/10 backdrop-blur transition group-hover:bg-white group-hover:text-[#173522]">
                      <ArrowRight className="h-5 w-5" />
                    </span>
                  </div>
                </Link>
              );
            })}

            <div className="flex min-h-[320px] flex-col justify-between rounded-[2rem] bg-[#dce9c9] p-7 md:p-8">
              <Sprout className="h-8 w-8 text-[#295438]" />
              <div>
                <p className="text-xs font-bold uppercase tracking-[.18em] text-[#295438]">More to source</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {["Shrubs", "Groundcover", "Perennials", "Materials", "Evergreens"].map((name) => (
                    <Link key={name} to={"/register?category=" + name} className="rounded-full border border-[#295438]/15 bg-white/45 px-3 py-2 text-sm font-semibold text-[#173522] transition hover:bg-white">
                      {name}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="bg-[#ede8dd] py-20 md:py-28">
          <div className="page-shell">
            <div className="grid gap-12 lg:grid-cols-[.82fr_1.18fr] lg:gap-20">
              <div>
                <p className="editorial-kicker">A clearer way to buy</p>
                <h2 className="mt-4 max-w-xl font-display text-4xl font-semibold leading-[.98] md:text-6xl">
                  One connected path from plant list to jobsite.
                </h2>
                <p className="mt-6 max-w-lg text-base leading-7 text-[#5c675f]">
                  Tree Marketplace keeps the useful detail close and the operational complexity out of your way until you need it.
                </p>
                <Button className="mt-8 rounded-full px-6" asChild>
                  <Link to="/register">Create your buyer workspace <ArrowRight className="h-4 w-4" /></Link>
                </Button>
              </div>

              <div className="divide-y divide-[#152119]/12 border-y border-[#152119]/12">
                {WORKFLOW.map((step) => {
                  const Icon = step.icon;
                  return (
                    <div key={step.number} className="grid gap-5 py-7 sm:grid-cols-[3rem_3rem_1fr] sm:items-start md:py-9">
                      <span className="font-mono text-xs text-[#7b857e]">{step.number}</span>
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#173522] text-white">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div>
                        <h3 className="text-xl font-bold md:text-2xl">{step.title}</h3>
                        <p className="mt-2 max-w-xl text-sm leading-6 text-[#5c675f] md:text-base">{step.body}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="page-shell py-20 md:py-28">
          <div className="overflow-hidden rounded-[2.25rem] bg-[#10251a] text-white">
            <div className="grid lg:grid-cols-[1.08fr_.92fr]">
              <div className="p-8 sm:p-12 lg:p-16">
                <p className="text-xs font-bold uppercase tracking-[.22em] text-[#b7cda3]">For commercial projects</p>
                <h2 className="mt-5 max-w-2xl font-display text-4xl font-semibold leading-[.98] md:text-6xl">
                  Need 20, 200, or 2,000 plants?
                </h2>
                <p className="mt-6 max-w-xl text-base leading-7 text-white/66">
                  Build one request, invite qualified growers, compare complete pricing, and keep every response attached to the project.
                </p>
                <Button size="lg" className="mt-8 rounded-full bg-[#dce9c9] text-[#173522] hover:bg-white" asChild>
                  <Link to="/register">Request project quotes <ArrowRight className="h-4 w-4" /></Link>
                </Button>
              </div>
              <div className="grid content-center gap-0 border-t border-white/10 p-8 lg:border-l lg:border-t-0 lg:p-12">
                {[
                  ["01", "One organized project list"],
                  ["02", "Multiple qualified responses"],
                  ["03", "Comparable pricing and terms"],
                  ["04", "Order context that stays connected"],
                ].map(([number, text]) => (
                  <div key={number} className="flex items-center gap-5 border-b border-white/10 py-5 last:border-0">
                    <span className="font-mono text-xs text-[#b7cda3]">{number}</span>
                    <span className="font-medium text-white/85">{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="for-growers" className="border-y border-[#152119]/10 bg-white/55 py-20 md:py-28">
          <div className="page-shell">
            <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-end">
              <div>
                <p className="editorial-kicker">For nursery growers</p>
                <h2 className="mt-4 max-w-2xl font-display text-4xl font-semibold leading-[.98] md:text-6xl">
                  Put live inventory where buyers can act on it.
                </h2>
              </div>
              <div>
                <p className="max-w-xl text-base leading-7 text-[#5c675f]">
                  Publish availability, respond to qualified project requests, manage orders, and prepare your payout account—all without turning your nursery into a software company.
                </p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <Button className="rounded-full" asChild><Link to="/register">Join as a grower <ArrowRight className="h-4 w-4" /></Link></Button>
                  <Button variant="outline" className="rounded-full bg-white/60" asChild><Link to="/login">Grower log in</Link></Button>
                </div>
              </div>
            </div>

            <div className="mt-14 grid gap-8 border-t border-[#152119]/12 pt-10 md:grid-cols-3">
              {[
                [Store, "A storefront built for inventory", "Show buyers what is available now, including sizes, quantities, bulk tiers, and fulfillment options."],
                [FileText, "RFQs worth responding to", "Review project requirements in a consistent format and keep quotes connected to buyer decisions."],
                [ShieldCheck, "Operationally ready", "Seller onboarding, order records, and Stripe Connect safeguards are already part of the platform."],
              ].map(([Icon, title, body]) => (
                <div key={title}>
                  <Icon className="h-6 w-6 text-primary" />
                  <h3 className="mt-5 text-lg font-bold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#5c675f]">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="android-test" className="page-shell py-20 md:py-24">
          <div className="grid overflow-hidden rounded-[2rem] border border-[#152119]/10 bg-[#f1eee6] lg:grid-cols-[.9fr_1.1fr]">
            <div className="p-7 sm:p-10">
              <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-semibold text-primary">
                <Smartphone className="h-4 w-4" /> Android closed test
              </div>
              <h2 className="mt-5 font-display text-4xl font-semibold leading-none">Help refine the mobile experience.</h2>
              <p className="mt-4 text-sm leading-6 text-[#5c675f]">The website is live. Android testing uses simulated purchases, and no payment card is required.</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {TESTER_REQUIREMENTS.map((item) => (
                  <div key={item} className="flex gap-2 text-sm text-[#3f4b43]">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-[#152119]/10 bg-white p-7 sm:p-10 lg:border-l lg:border-t-0">
              {submitted ? (
                <div className="flex h-full flex-col justify-center text-center">
                  <CheckCircle2 className="mx-auto h-11 w-11 text-emerald-700" />
                  <h3 className="mt-4 text-2xl font-bold">Request received</h3>
                  <p className="mt-2 text-sm text-muted-foreground">If selected, you will receive the official invitation and opt-in instructions.</p>
                  <Button className="mx-auto mt-6 rounded-full" variant="outline" asChild><Link to="/register">Create a marketplace account</Link></Button>
                </div>
              ) : (
                <>
                  <h3 className="text-2xl font-bold">Request tester access</h3>
                  <p className="mt-2 text-sm text-muted-foreground">Use the Google email connected to Play Store on your Android phone.</p>
                  <form onSubmit={submitTesterRequest} className="mt-6 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="tester-email">Google Play email</Label>
                      <Input id="tester-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required className="h-12 rounded-xl bg-[#f8f6f1]" />
                    </div>
                    <div className="absolute left-[-10000px]" aria-hidden="true">
                      <Label htmlFor="tester-website">Website</Label>
                      <Input id="tester-website" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
                    </div>
                    <label className="flex items-start gap-3 rounded-xl bg-[#f8f6f1] p-3.5 text-sm">
                      <input type="checkbox" className="mt-1 accent-primary" checked={consent} onChange={(event) => setConsent(event.target.checked)} required />
                      <span>I agree to be contacted about the Tree Marketplace closed test.</span>
                    </label>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <Button type="submit" className="h-12 w-full rounded-xl" disabled={submitting}>
                      {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Request access
                    </Button>
                  </form>
                  <p className="mt-4 text-xs text-muted-foreground">We use this email only to manage testing participation. See our <Link to="/privacy" className="underline underline-offset-2">Privacy Policy</Link>.</p>
                </>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-[#0d1c14] text-white">
        <div className="page-shell py-12">
          <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="flex items-center gap-2.5"><BrandMark className="h-9 w-9 rounded-full bg-white/10" /><BrandWordmark className="text-white" /></div>
              <p className="mt-3 max-w-md text-sm text-white/52">Trees, plants, suppliers, and fulfillment—connected for professional landscape work.</p>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-white/60">
              <Link to="/privacy" className="hover:text-white">Privacy</Link>
              <Link to="/terms" className="hover:text-white">Terms</Link>
              <Link to="/community-rules" className="hover:text-white">Marketplace rules</Link>
              <Link to="/delete-account" className="hover:text-white">Delete account</Link>
              <Link to="/login" className="hover:text-white">Log in</Link>
            </div>
          </div>
          <p className="mt-10 border-t border-white/10 pt-6 text-xs text-white/35">{"© " + new Date().getFullYear() + " Tree Marketplace. All rights reserved."}</p>
        </div>
      </footer>
    </div>
  );
}