import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export default function SectionHeader({ title, subtitle, to, actionLabel = "View all", icon: Icon }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-5 h-5 text-primary shrink-0" />}
        <div>
          <h2 className="text-2xl md:text-3xl font-display font-semibold text-foreground tracking-tight">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground mt-2">{subtitle}</p>}
        </div>
      </div>
      {to && (
        <Link to={to} className="text-xs sm:text-sm text-primary font-semibold flex items-center gap-2 no-tap-highlight shrink-0 ml-3">
          {actionLabel} <ArrowRight className="w-4 h-4" />
        </Link>
      )}
    </div>
  );
}