// A failed profile read is not evidence that the account has no profile.
export async function loadAccountProfiles(client, expectedUserId) {
  const me = await client.auth.me();
  if (!me?.id || me.id !== expectedUserId) throw new Error("Your account changed. Please reload to continue.");
  const [buyers, vendors, carriers] = await Promise.all([
    client.entities.BuyerProfile.filter({ created_by_id: me.id }, "-updated_date", 20),
    client.entities.VendorProfile.filter({ owner_id: me.id }, "-created_date", 20),
    client.entities.CarrierProfile.filter({ owner_id: me.id }, "-created_date", 20),
  ]);
  if (![buyers, vendors, carriers].every(Array.isArray)) throw new Error("Profile information could not be loaded.");
  return {
    accountType: me.account_type || me.data?.account_type || "buyer",
    buyerProfile: buyers[0] || null,
    vendorProfiles: vendors.filter((vendor) => vendor.is_test_fixture !== true),
    carrierProfile: carriers[0] || null,
  };
}
export async function saveBuyerProfile(client, fields) {
  const me = await client.auth.me();
  if (!me?.id) throw new Error("Please sign in before saving your profile.");
  const allowed = ["full_name", "business_name", "buyer_type", "phone", "city", "state", "zip_code"];
  const payload = Object.fromEntries(allowed.map((key) => [key, String(fields[key] || "").trim()]));
  for (const key of ["full_name", "buyer_type", "city", "state", "zip_code"]) {
    if (!payload[key]) throw new Error("Complete your name, buyer type, city, state and ZIP code.");
  }
  const existing = await client.entities.BuyerProfile.filter({ created_by_id: me.id }, "-updated_date", 20);
  if (!Array.isArray(existing)) throw new Error("Unable to check your existing profile. Please retry.");
  const saved = existing[0]?.id
    ? await client.entities.BuyerProfile.update(existing[0].id, payload)
    : await client.entities.BuyerProfile.create(payload);
  if (!saved?.id) throw new Error("The profile save was not confirmed. Your entries are still here.");
  return saved;
}
