import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAppUser } from "@/hooks/useAppUser";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Package, FileText, ShoppingCart, Plus, TrendingUp, AlertTriangle, Store } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { formatCurrency, formatNumber, shortDate } from "@/lib/treebay";
import SellerDashboard from "@/components/seller/SellerDashboard";

export default function VendorDashboard() {
  const { vendorProfiles } = useAppUser();
  const vendor = vendorProfiles[0];
  if (!vendor) return <div className="space-y-3"><h1 className="text-xl font-bold">Seller dashboard</h1><Card className="p-6 text-center"><Store className="w-10 h-10 mx-auto text-muted-foreground" /><p className="mt-3 font-medium">No seller profile yet</p><Button asChild className="mt-4"><Link to="/become-seller">Create seller profile</Link></Button></Card></div>;
  return <SellerDashboard vendor={vendor} />;
}

function Stat({ icon: Icon, label, value }) {
  return (
    <Card className="p-4">
      <Icon className="w-5 h-5 text-primary" />
      <p className="text-2xl font-bold mt-2">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </Card>
  );
}