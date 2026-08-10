import { useNavigate, Link } from "react-router-dom";
import { useAppUser } from "@/hooks/useAppUser";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShoppingCart, Heart, Settings, FileText, ShieldCheck, LogOut, ChevronRight, Store, Leaf, User as UserIcon, LifeBuoy } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";

export default function Account() {
  const { user, accountType, buyerProfile, vendorProfiles, switchAccountType } = useAppUser();
  const { logout } = useAuth();
  const navigate = useNavigate();

  const profile = accountType === "vendor" ? vendorProfiles[0] : buyerProfile;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Account</h1>
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center"><UserIcon className="w-7 h-7 text-primary" /></div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{user?.full_name || user?.email}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            {accountType === "vendor" && vendorProfiles[0] && (
              <div className="mt-1"><StatusBadge status={vendorProfiles[0].verification_status} /></div>
            )}
          </div>
        </div>
        {profile && (
          <div className="mt-4 pt-4 border-t border-border text-sm space-y-1">
            {profile.business_name && <p><span className="text-muted-foreground">Business:</span> {profile.business_name}</p>}
            {profile.buyer_type && <p><span className="text-muted-foreground">Type:</span> {profile.buyer_type}</p>}
            <p><span className="text-muted-foreground">Location:</span> {profile.city}, {profile.state} {profile.zip_code || ""}</p>
            {profile.phone && <p><span className="text-muted-foreground">Phone:</span> {profile.phone}</p>}
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <div>
          <label className="text-xs text-muted-foreground">Active role</label>
          {vendorProfiles.length > 0 ? (
            <Select value={accountType} onValueChange={(v) => switchAccountType(v)}>
              <SelectTrigger className="h-11 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="buyer">Buyer</SelectItem>
                <SelectItem value="vendor">Vendor</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">You're browsing as a buyer.</p>
          )}
        </div>
        {vendorProfiles.length === 0 && (
          <Button onClick={() => navigate("/become-seller")} className="w-full h-11"><Store className="w-4 h-4 mr-2" /> Become a Seller</Button>
        )}
        {vendorProfiles.length > 0 && vendorProfiles[0].verification_status !== "verified" && (
          <p className="text-[11px] text-amber-700">Vendor verification pending — listings become purchasable once verified.</p>
        )}
        <p className="text-[11px] text-muted-foreground">Carrier marketplace coming soon.</p>
      </Card>

      <div className="space-y-2">
        <Link to="/orders"><MenuRow icon={ShoppingCart} label="Orders" /></Link>
        <Link to="/favorites"><MenuRow icon={Heart} label="Favorites" /></Link>
        {accountType === "vendor" && <Link to="/vendor"><MenuRow icon={Store} label="Vendor dashboard" /></Link>}
        <Link to="/settings"><MenuRow icon={Settings} label="Settings" /></Link>
        <Link to="/privacy"><MenuRow icon={ShieldCheck} label="Privacy policy" /></Link>
        <Link to="/terms"><MenuRow icon={FileText} label="Terms of service" /></Link>
        <Link to="/community-rules"><MenuRow icon={LifeBuoy} label="Marketplace rules" /></Link>
      </div>

      <Button variant="outline" className="w-full h-12 text-rose-600" onClick={() => logout()}>
        <LogOut className="w-4 h-4 mr-2" /> Log out
      </Button>
      <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1"><Leaf className="w-3 h-3" /> TreEbay — the marketplace for plants, trees & delivery.</p>
    </div>
  );
}

function MenuRow({ icon: Icon, label }) {
  return (
    <Card className="p-3.5 flex items-center gap-3 hover:shadow-sm transition cursor-pointer">
      <Icon className="w-5 h-5 text-primary" />
      <span className="flex-1 font-medium text-sm">{label}</span>
      <ChevronRight className="w-4 h-4 text-muted-foreground" />
    </Card>
  );
}