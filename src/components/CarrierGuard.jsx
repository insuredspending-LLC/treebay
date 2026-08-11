import { Navigate } from "react-router-dom";
import { useAppUser } from "@/hooks/useAppUser";

// Route guard: redirects to become-carrier if the user has no carrier profile.
export default function CarrierGuard({ children }) {
  const { carrierProfile, loading } = useAppUser();
  if (loading) return <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" /></div>;
  if (!carrierProfile) return <Navigate to="/become-carrier" replace />;
  return children;
}