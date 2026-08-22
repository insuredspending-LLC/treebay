import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function LegalPage({ title, children }) {
  const navigate = useNavigate();
  const back = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/");
  };
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
      <button onClick={back} className="text-sm text-muted-foreground flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Back</button>
      <h1 className="text-2xl font-bold">{title}</h1>
      <div className="prose prose-sm max-w-none space-y-3 [&>h3]:font-semibold [&>h3]:text-foreground [&>h3]:text-base [&>h3]:mt-4 [&>p]:text-sm [&>p]:text-muted-foreground leading-relaxed">
        {children}
      </div>
      <p className="text-xs text-muted-foreground pt-4">Last updated: {new Date().getFullYear()}. Tree Marketplace.</p>
    </div>
  );
}