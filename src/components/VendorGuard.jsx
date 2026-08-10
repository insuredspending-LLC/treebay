import { Navigate, Outlet } from "react-router-dom";
import { useAppUser } from "@/hooks/useAppUser";
import { Loader2 } from "lucide-react";

export default function VendorGuard() {
  const { loading, vendorProfiles } = useAppUser();
  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }
  if (!vendorProfiles || vendorProfiles.length === 0) {
    return <Navigate to="/become-seller" replace />;
  }
  return <Outlet />;
}