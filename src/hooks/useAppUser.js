import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { loadAccountProfiles } from "@/lib/accountProfiles";

export function useAppUser() {
  const { user, isAuthenticated, checkUserAuth } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["account-profiles", user?.id];
  const query = useQuery({
    queryKey,
    queryFn: () => loadAccountProfiles(base44, user.id),
    enabled: Boolean(isAuthenticated && user?.id),
    staleTime: 30000,
    retry: 1,
  });
  const refresh = useCallback(async () => {
    if (!isAuthenticated || !user?.id) return;
    // All hook consumers (including the route guard) observe this same cache.
    await queryClient.invalidateQueries({ queryKey: ["account-profiles", user.id], refetchType: "none" });
    return queryClient.fetchQuery({
      queryKey: ["account-profiles", user.id],
      queryFn: () => loadAccountProfiles(base44, user.id),
      staleTime: 0,
    });
  }, [isAuthenticated, user?.id, queryClient]);
  const switchAccountType = useCallback(async (type) => {
    try {
      await base44.auth.updateMe({ account_type: type });
      await checkUserAuth();
      await refresh();
      return true;
    } catch (error) {
      console.error("Failed to switch marketplace mode", error);
      return false;
    }
  }, [checkUserAuth, refresh]);
  const data = query.data;
  const buyerProfile = data?.buyerProfile || null;
  const vendorProfiles = data?.vendorProfiles || [];
  const carrierProfile = data?.carrierProfile || null;
  return {
    user, accountType: data?.accountType || "buyer",
    loading: Boolean(isAuthenticated && user?.id && query.isPending),
    profileError: query.error,
    buyerProfile, vendorProfiles, carrierProfile,
    hasOnboarded: Boolean(buyerProfile || vendorProfiles.length || carrierProfile),
    refresh, switchAccountType,
  };
}
