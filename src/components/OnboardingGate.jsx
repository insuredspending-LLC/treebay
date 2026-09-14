import { Navigate, useLocation, Outlet } from "react-router-dom";
import { useAppUser } from "@/hooks/useAppUser";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export default function OnboardingGate() {
  const { loading, hasOnboarded, profileError, refresh } = useAppUser();
  const location = useLocation();

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  if (profileError) {
    return <div className="max-w-md mx-auto p-6 space-y-4">
      <h1 className="text-xl font-bold">We could not load your profile</h1>
      <p>Your saved information has not been erased. Retry before creating another profile.</p>
      <Button onClick={() => refresh().catch(() => {})}>Retry profile loading</Button>
    </div>;
  }

  if (!hasOnboarded && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }
  if (hasOnboarded && location.pathname === "/onboarding") {
    return <Navigate to="/home" replace />;
  }
  return <Outlet />;
}