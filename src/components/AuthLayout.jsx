import { Link } from "react-router-dom";
import { ArrowLeft, Leaf, ShieldCheck } from "lucide-react";
import { BrandMark, BrandWordmark } from "@/components/Brand";

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen bg-[#f7f4ed]">
      <div className="grid min-h-screen lg:grid-cols-[.95fr_1.05fr]">
        <aside className="relative hidden min-h-screen overflow-hidden bg-[#10251a] text-white lg:flex">
          <img src="/marketplace/tree-marketplace-nursery-hero.webp" alt="A professional nursery at morning light" className="absolute inset-0 h-full w-full object-cover object-[67%_50%]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,28,18,.65),rgba(9,28,18,.3)_35%,rgba(9,28,18,.94))]" />
          <div className="relative flex w-full flex-col justify-between p-10 xl:p-14">
            <Link to="/" className="flex items-center gap-2.5">
              <BrandMark className="h-10 w-10 rounded-full bg-white/12 ring-1 ring-white/20" />
              <BrandWordmark className="text-xl text-white" />
            </Link>
            <div className="max-w-xl pb-6">
              <p className="text-[10px] font-bold uppercase tracking-[.24em] text-[#c6d9b4]">The landscape supply marketplace</p>
              <h2 className="mt-6 font-display text-5xl font-semibold leading-[.98] tracking-tight xl:text-6xl">Great landscapes begin with better connections.</h2>
              <p className="mt-6 max-w-lg text-base leading-7 text-white/65">Plants, growers, project pricing, and fulfillment—all in one considered workspace.</p>
              <div className="mt-10 flex items-center gap-2 border-t border-white/15 pt-6 text-xs text-white/55">
                <ShieldCheck className="h-4 w-4" /> Secure accounts · Test commerce clearly labeled
              </div>
            </div>
          </div>
        </aside>

        <main className="flex min-h-screen flex-col px-5 py-7 sm:px-10 lg:px-14">
          <div className="flex items-center justify-between">
            <Link to="/" className="inline-flex items-center gap-2 text-xs font-semibold text-[#5b675e] transition hover:text-primary"><ArrowLeft className="h-4 w-4" /> Back to marketplace</Link>
            <div className="flex items-center gap-2 lg:hidden"><Leaf className="h-5 w-5 text-primary" /><span className="text-sm font-bold text-primary">Tree Marketplace</span></div>
          </div>

          <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-12 lg:py-16">
            <div className="mb-8">
              {Icon && <span className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#e5ebdc] text-primary"><Icon className="h-5 w-5" aria-hidden="true" /></span>}
              <h1 className="font-display text-4xl font-semibold leading-none text-[#152119] sm:text-5xl">{title}</h1>
              {subtitle && <p className="mt-4 text-sm leading-6 text-[#69736b]">{subtitle}</p>}
            </div>

            <div className="rounded-[1.75rem] border border-[#152119]/10 bg-white p-6 shadow-[0_20px_70px_rgba(21,33,25,.055)] sm:p-8">
              {children}
            </div>
            {footer && <p className="mt-6 text-center text-sm text-[#69736b]">{footer}</p>}
          </div>
          <p className="text-center text-[11px] text-[#8a938d]">Tree Marketplace · Trees, plants & delivery, connected.</p>
        </main>
      </div>
    </div>
  );
}
