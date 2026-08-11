import { useEffect, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

export function useAppUser() {
  const { user, isAuthenticated, checkUserAuth } = useAuth();
  const [accountType, setAccountType] = useState(null);
  const [buyerProfile, setBuyerProfile] = useState(null);
  const [vendorProfiles, setVendorProfiles] = useState([]);
  const [carrierProfile, setCarrierProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) { setLoading(false); return; }
    try {
      const me = await base44.auth.me();
      const acc = me.account_type || me.data?.account_type || "buyer";
      setAccountType(acc);
      const [buyers, vendors, carriers] = await Promise.all([
        base44.entities.BuyerProfile.list().catch(() => []),
        base44.entities.VendorProfile.filter({ created_by_id: me.id }).catch(() => []),
        base44.entities.CarrierProfile.filter({ created_by_id: me.id }).catch(() => []),
      ]);
      setBuyerProfile(buyers?.[0] || null);
      setVendorProfiles(vendors || []);
      setCarrierProfile(carriers?.[0] || null);
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => { refresh(); }, [refresh]);

  const switchAccountType = useCallback(async (type) => {
    try {
      await base44.auth.updateMe({ account_type: type });
      setAccountType(type);
      await checkUserAuth();
    } catch (e) { /* ignore */ }
  }, [checkUserAuth]);

  const hasOnboarded = !!(buyerProfile || vendorProfiles.length || carrierProfile);

  return {
    user, accountType: accountType || "buyer", loading,
    buyerProfile, vendorProfiles, carrierProfile, hasOnboarded,
    refresh, switchAccountType,
  };
}