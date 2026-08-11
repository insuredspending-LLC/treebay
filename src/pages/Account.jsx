import { useNavigate, Link } from "react-router-dom";
import { useAppUser } from "@/hooks/useAppUser";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShoppingCart, Heart, Settings, FileText, ShieldCheck, LogOut, ChevronRight, Store, Leaf, User as UserIcon, LifeBuoy, FolderKanban, Lock, ExternalLink } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";

export default function Account() {
  const { user, accountType, buyerProfile, vendorProfiles, switchAccountType } = useAppUser();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const vendor = vendorProfiles[0];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Account</h1>
        <p className="text-sm text-muted-foreground">Manage your profile, marketplace mode, and settings.</p>
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

      {/* Marketplace Mode */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Store className="w-4 h-4 text-primary" />
          <h2 className="font-semibold text-sm">Marketplace Mode</h2>
        </div>
        {vendorProfiles.length > 0 ? (
          <Select value={accountType} onValueChange={(v) => switchAccountType(v)}>
            <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="buyer">Buyer Mode</SelectItem>
              <SelectItem value="vendor">Seller Mode</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Button onClick={() => navigate("/become-seller")} className="w-full h-11"><Store className="w-4 h-4 mr-2" /> Become a Seller</Button>
        )}
        <p className="text-[11px] text-muted-foreground">
          {vendorProfiles.length > 0
            ? "Switch between buying and selling. Your data stays the same across modes."
            : "Create a seller profile to list inventory and respond to RFQs."}
        </p>
      </Card>

      {/* Buyer Information */}
      {buyerProfile && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm">Buyer Information</h2>
          </div>
          <div className="text-sm space-y-1.5">
            {buyerProfile.business_name && <p><span className="text-muted-foreground">Business:</span> {buyerProfile.business_name}</p>}
            {buyerProfile.buyer_type && <p><span className="text-muted-foreground">Type:</span> {buyerProfile.buyer_type}</p>}
            <p><span className="text-muted-foreground">Location:</span> {buyerProfile.city}, {buyerProfile.state} {buyerProfile.zip_code || ""}</p>
            {buyerProfile.phone && <p><span className="text-muted-foreground">Phone:</span> {buyerProfile.phone}</p>}
          </div>
        </Card>
      )}

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
            {vendor.verification_status === "pending" && (
              <p className="text-[11px] text-amber-700 bg-amber-50 rounded-md p-2">Verification is pending. You can create listings and prepare quotes, but buyers can't purchase until you're verified.</p>
            )}
            {vendor.verification_status === "verified" && (
              <p className="text-[11px] text-emerald-700 bg-emerald-50 rounded-md p-2">Your nursery is verified. Buyers can purchase your listings directly and accept your quotes.</p>
            )}
            {vendor.verification_status === "suspended" && (
              <p className="text-[11px] text-red-700 bg-red-50 rounded-md p-2">Your seller account is suspended. Contact support for assistance.</p>
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" asChild className="flex-1"><Link to="/settings"><Settings className="w-4 h-4 mr-1" /> Edit Profile</Link></Button>
            <Button variant="outline" size="sm" asChild className="flex-1"><Link to={`/vendor/${vendor.id}`}><ExternalLink className="w-4 h-4 mr-1" /> View Storefront</Link></Button>
          </div>
        </Card>
      )}

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
        <Link to="/settings"><MenuRow icon={Lock} label="Security" /></Link>
      </div>

      {/* Legal & Help */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">Legal & Help</p>
        <Link to="/privacy"><MenuRow icon={ShieldCheck} label="Privacy Policy" /></Link>
        <Link to="/terms"><MenuRow icon={FileText} label="Terms of Service" /></Link>
        <Link to="/community-rules"><MenuRow icon={LifeBuoy} label="Marketplace Rules" /></Link>
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