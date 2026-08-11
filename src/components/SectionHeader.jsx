import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export default function SectionHeader({ title, subtitle, to, actionLabel = "View all", icon: Icon }) {
  return (
    <div className="flex items-end justify-between mb-3">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-5 h-5 text-primary shrink-0" />}
        <div>
          <h2 className="text-lg font-heading font-bold text-foreground tracking-tight">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {to && (
        <Link to={to} className="text-sm text-primary font-medium flex items-center gap-1 no-tap-highlight shrink-0 ml-3">
          {actionLabel} <ArrowRight className="w-4 h-4" />
        </Link>
      )}
    </div>
  );
}