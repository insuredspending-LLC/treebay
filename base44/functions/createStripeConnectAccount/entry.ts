import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { createConnectAccount, createAccountLink, retrieveAccount } from "../../shared/stripe.ts";

// Seller-initiated Stripe Connect onboarding. Selling is already automatic; this
// creates/links the Express connected account and returns a Stripe-hosted onboarding
// URL so the seller can complete KYC and become eligible to receive live payouts.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const svc = base44.asServiceRole;
    const vendors = await svc.entities.VendorProfile.filter({ owner_id: user.id });
    const vendor = (vendors || [])[0];
    if (!vendor) return Response.json({ error: "No seller profile found." }, { status: 404 });
    const origin = new URL(req.url).origin;
    const account = await createConnectAccount(svc, vendor, user.email);
    const fresh = await retrieveAccount(svc, account.id);
    const link = await createAccountLink(svc, { ...vendor, stripe_account_id: account.id }, "account_onboarding", origin);
    return Response.json({
      url: link.url, account_id: account.id,
      payouts_enabled: !!fresh.payouts_enabled, details_submitted: !!fresh.details_submitted,
    });
  } catch (error) {
    console.error("createStripeConnectAccount error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}