import { Navigate, useLocation, Outlet } from "react-router-dom";
import { useAppUser } from "@/hooks/useAppUser";
import { Loader2 } from "lucide-react";

export default function OnboardingGate() {
  const { loading, hasOnboarded } = useAppUser();
  const location = useLocation();

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  if (!hasOnboarded && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }
  if (hasOnboarded && location.pathname === "/onboarding") {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}