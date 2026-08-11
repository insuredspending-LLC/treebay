import { useAppUser } from "@/hooks/useAppUser";
import SellerInventory from "@/components/seller/SellerInventory";

export default function VendorInventory() {
  const { vendorProfiles } = useAppUser();
  return <SellerInventory vendorIds={vendorProfiles.map((vendor) => vendor.id)} />;
}