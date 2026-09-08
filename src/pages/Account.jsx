import { useNavigate, Link } from "react-router-dom";
import { useAppUser } from "@/hooks/useAppUser";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShoppingCart, Heart, Settings, FileText, ShieldCheck, LogOut, ChevronRight, Store, Leaf, User as UserIcon, LifeBuoy, FolderKanban, Lock, ExternalLink, Truck, AlertTriangle, Shield } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";

export default function Account() {
  const { user, accountType, buyerProfile, vendorProfiles, carrierProfile, switchAccountType } = useAppUser();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const vendor = vendorProfiles[0];
  const changeMode = async (mode) => {
    const ok = await switchAccountType(mode);
    if (!ok) return;
    navigate(mode === "vendor" ? "/vendor" : mode === "carrier" ? "/carrier" : "/", { replace: true });
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Profile & Account</h1>
        <p className="text-sm text-muted-foreground">Manage your buyer, seller, and carrier profiles, marketplace mode, and settings.</p>
      </div>

      {/* Profile */}
      <Card className="p-5">
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center"><UserIcon className="w-7 h-7 text-primary" /></div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{user?.full_name || user?.email}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
        </div>
      </Card>

      {user?.role === "admin" && (
        <Card className="p-4 border-primary/20 bg-primary/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center"><Shield className="w-5 h-5 text-primary-foreground" /></div>
            <div className="flex-1">
              <p className="font-semibold">Administrator</p>
              <p className="text-xs text-muted-foreground">Manage users, vendors, carriers, reports, orders, exceptions, financials, and TEST tools.</p>
            </div>
            <Button asChild size="sm"><Link to="/admin">Admin Console</Link></Button>
          </div>
        </Card>
      )}

      {/* Marketplace Mode */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Store className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-sm">Marketplace Mode</h2>
        </div>
        {vendorProfiles.length > 0 || carrierProfile ? (
          <Select value={accountType} onValueChange={changeMode}>
            <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="buyer">Buyer Mode</SelectItem>
              {vendorProfiles.length > 0 && <SelectItem value="vendor">Seller Mode</SelectItem>}
              {carrierProfile && <SelectItem value="carrier">Carrier Mode</SelectItem>}
            </SelectContent>
          </Select>
        ) : (
          <div className="space-y-2">
            <Button onClick={() => navigate("/become-seller")} className="w-full h-11"><Store className="w-4 h-4 mr-2" /> Become a Seller</Button>
            <Button onClick={() => navigate("/become-carrier")} variant="outline" className="w-full h-11"><Truck className="w-4 h-4 mr-2" /> Become a Carrier</Button>
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          {vendorProfiles.length > 0 || carrierProfile
            ? "Switch between your marketplace roles. Your data stays the same across modes."
            : "Create a seller or carrier profile to get started."}
        </p>
      </Card>

      {/* Buyer Information */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-sm">Buyer Profile</h2>
        </div>
        {buyerProfile ? (
          <>
            <div className="text-sm space-y-1.5">
              <p><span className="text-muted-foreground">Name:</span> {buyerProfile.full_name}</p>
              {buyerProfile.business_name && <p><span className="text-muted-foreground">Business:</span> {buyerProfile.business_name}</p>}
              {buyerProfile.buyer_type && <p><span className="text-muted-foreground">Type:</span> {buyerProfile.buyer_type}</p>}
              <p><span className="text-muted-foreground">Location:</span> {buyerProfile.city}, {buyerProfile.state} {buyerProfile.zip_code || ""}</p>
              {buyerProfile.phone && <p><span className="text-muted-foreground">Phone:</span> {buyerProfile.phone}</p>}
            </div>
            <Button asChild variant="outline" size="sm" className="w-full"><Link to="/edit-buyer-profile"><Settings className="w-4 h-4 mr-1" /> Edit Buyer Profile</Link></Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">No buyer profile is set up yet. You can browse without one, but a buyer profile is used for RFQs, checkout defaults, and delivery estimates.</p>
            <Button asChild className="w-full"><Link to="/edit-buyer-profile">Create Buyer Profile</Link></Button>
          </>
        )}
      </Card>

      {/* Seller Profile */}
      {vendor && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Leaf className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm">Seller Profile</h2>
          </div>
          <div className="text-sm space-y-1.5">
            <p><span className="text-muted-foreground">Business:</span> {vendor.business_name}</p>
            <p><span className="text-muted-foreground">Location:</span> {vendor.city}, {vendor.state} {vendor.zip_code || ""}</p>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Verification:</span>
              <StatusBadge status={vendor.verification_status} />
            </div>
            {vendor.verification_status === "pending" && (vendor.selling_status || "active") === "active" && (
              <p className="text-[11px] text-emerald-700 bg-emerald-50 rounded-md p-2">Your seller account is active. You can list, quote, and receive orders now; TreEbay verification is still pending for the trust badge.</p>
            )}
            {vendor.verification_status === "verified" && (
              <p className="text-[11px] text-emerald-700 bg-emerald-50 rounded-md p-2">Your nursery is verified. Buyers can purchase your listings directly and accept your quotes.</p>
            )}
            {(vendor.verification_status === "suspended" || ["restricted", "suspended"].includes(vendor.selling_status)) && (
              <p className="text-[11px] text-red-700 bg-red-50 rounded-md p-2">Your seller account is not currently active for new orders. Contact support for assistance.</p>
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" asChild className="flex-1"><Link to="/vendor/edit-profile"><Settings className="w-4 h-4 mr-1" /> Edit Profile</Link></Button>
            <Button variant="outline" size="sm" asChild className="flex-1"><Link to={`/vendor/${vendor.id}`}><ExternalLink className="w-4 h-4 mr-1" /> View Storefront</Link></Button>
          </div>
        </Card>
      )}

      {/* Carrier Profile */}
      {carrierProfile && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm">Carrier Profile</h2>
          </div>
          <div className="text-sm space-y-1.5">
            <p><span className="text-muted-foreground">Business:</span> {carrierProfile.business_name}</p>
            <p><span className="text-muted-foreground">Location:</span> {carrierProfile.city}, {carrierProfile.state} {carrierProfile.zip_code || ""}</p>
            {carrierProfile.equipment_type && <p><span className="text-muted-foreground">Equipment:</span> {carrierProfile.equipment_type}</p>}
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Verification:</span>
              <StatusBadge status={carrierProfile.verification_status} />
            </div>
            {carrierProfile.verification_status === "pending" && (
              <p className="text-[11px] text-amber-700 bg-amber-50 rounded-md p-2">Verification is pending. An admin must verify your carrier profile before you can accept freight loads.</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild className="flex-1"><Link to="/carrier/edit-profile"><Settings className="w-4 h-4 mr-1" /> Edit Profile</Link></Button>
            <Button variant="outline" size="sm" asChild className="flex-1"><Link to="/carrier"><Truck className="w-4 h-4 mr-1" /> Dashboard</Link></Button>
          </div>
        </Card>
      )}

      <Card className="p-4 space-y-2">
        <h2 className="font-semibold">Test marketplace</h2>
        <p className="text-sm text-muted-foreground">Approved testers can practice an order using sample inventory and Stripe sandbox.</p>
        <Button asChild variant="outline"><Link to="/stripe-sandbox">Open test marketplace</Link></Button>
      </Card>
      {/* Shortcuts */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">Activity</p>
        <Link to="/favorites"><MenuRow icon={Heart} label="Favorites" /></Link>
        <Link to="/projects"><MenuRow icon={FolderKanban} label="Saved Projects" /></Link>
        <Link to="/orders"><MenuRow icon={ShoppingCart} label="Orders" /></Link>
      </div>

      {/* Settings & Security */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">Settings</p>
        <Link to="/settings"><MenuRow icon={Settings} label="Settings" /></Link>
        <Link to="/settings"><MenuRow icon={Lock} label="Data & Privacy" /></Link>
      </div>

      {/* Legal & Help */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">Legal & Help</p>
        <Link to="/privacy"><MenuRow icon={ShieldCheck} label="Privacy Policy" /></Link>
        <Link to="/terms"><MenuRow icon={FileText} label="Terms of Service" /></Link>
        <Link to="/community-rules"><MenuRow icon={LifeBuoy} label="Marketplace Rules" /></Link>
        <Link to="/report-problem"><MenuRow icon={AlertTriangle} label="Report a Problem" /></Link>
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