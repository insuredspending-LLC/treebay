import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { createAccountLink, createLoginLink, retrieveAccount } from "../../shared/stripe.ts";

// Resume onboarding or open the Express dashboard for the seller's connected account.
// type: "account_onboarding" (resume KYC) | "dashboard" (Stripe Express login link).
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const type = body?.type || "account_onboarding";
    const svc = base44.asServiceRole;
    const vendors = await svc.entities.VendorProfile.filter({ owner_id: user.id });
    const vendor = (vendors || [])[0];
    if (!vendor) return Response.json({ error: "No seller profile found." }, { status: 404 });
    if (!vendor.stripe_account_id) return Response.json({ error: "No Stripe account connected. Start onboarding first." }, { status: 400 });
    const fresh = await retrieveAccount(svc, vendor.stripe_account_id);
    const origin = new URL(req.url).origin;
    let url;
    if (type === "dashboard") {
      const link = await createLoginLink(svc, vendor);
      url = link.url;
    } else {
      const link = await createAccountLink(svc, vendor, "account_onboarding", origin);
      url = link.url;
    }
    return Response.json({
      url, payouts_enabled: !!fresh.payouts_enabled, details_submitted: !!fresh.details_submitted,
      onboarding_status: vendor.stripe_onboarding_status,
    });
  } catch (error) {
    console.error("getStripeAccountLink error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}