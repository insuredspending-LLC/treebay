import React from "react";
import { Leaf, ShieldCheck, Sparkles } from "lucide-react";

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-secondary via-background to-amber-50/50">
      <div className="absolute -top-28 -left-24 w-72 h-72 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute -bottom-32 -right-24 w-80 h-80 rounded-full bg-amber-300/20 blur-3xl" />

      <div className="relative min-h-screen max-w-6xl mx-auto grid lg:grid-cols-[1fr_460px] gap-10 items-center px-4 sm:px-8 py-8">
        <aside className="hidden lg:flex flex-col justify-between min-h-[620px] rounded-[36px] bg-primary text-primary-foreground p-10 shadow-2xl shadow-primary/20 overflow-hidden relative">
          <div className="absolute -right-20 top-16 w-64 h-64 rounded-full border border-white/10" />
          <div className="absolute -right-6 top-28 w-44 h-44 rounded-full border border-white/10" />
          <div className="relative flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/12 border border-white/15 flex items-center justify-center">
              <Leaf className="w-6 h-6" />
            </div>
            <div>
              <p className="font-heading font-extrabold text-2xl">Tree Marketplace</p>
              <p className="text-xs text-white/65">The living marketplace</p>
            </div>
          </div>

          <div className="relative max-w-lg">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/10 px-3 py-1.5 text-xs font-semibold mb-5">
              <Sparkles className="w-3.5 h-3.5" /> Smarter plant sourcing
            </div>
            <h2 className="font-heading text-4xl font-extrabold leading-tight text-balance">Find the right plants, people, and prices in one place.</h2>
            <p className="mt-5 text-white/75 text-lg">Tree Marketplace connects buyers, growers, and carriers with guided sourcing, bulk quotes, and clear order tracking.</p>
          </div>

          <div className="relative flex items-center gap-2 text-sm text-white/70">
            <ShieldCheck className="w-4 h-4" /> Secure accounts · TEST commerce clearly labeled
          </div>
        </aside>

        <main className="w-full max-w-md mx-auto">
          <div className="lg:hidden flex items-center justify-center gap-2 mb-8">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/15">
              <Leaf className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <p className="font-heading font-extrabold text-xl text-primary leading-none">Tree Marketplace</p>
              <p className="text-[10px] text-muted-foreground mt-1">The living marketplace</p>
            </div>
          </div>

          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-secondary text-primary mb-4 ring-1 ring-primary/10">
              <Icon className="w-6 h-6" aria-hidden="true" />
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground">{title}</h1>
            {subtitle && <p className="text-muted-foreground mt-2">{subtitle}</p>}
          </div>

          <div className="bg-card/95 backdrop-blur rounded-[28px] shadow-xl shadow-primary/5 border border-primary/10 p-6 sm:p-8">
            {children}
          </div>
          {footer && <p className="text-center text-sm text-muted-foreground mt-6">{footer}</p>}
        </main>
      </div>
    </div>
  );
}
