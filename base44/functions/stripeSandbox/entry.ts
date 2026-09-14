import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { requireInternalSimulatorAccess } from "../../shared/commerceAccess.ts";
import { assembleCheckout, vendorCanSell } from "../../shared/transactions.ts";
import { createConnectAccount, createAccountLink, retrieveAccount, commerceModeForVendor, vendorStripeReady, processLivePaymentSuccess } from "../../shared/stripe.ts";
import { sandboxReadiness } from "../../shared/stripeMode.ts";

const MARKER = "Stripe sandbox pilot — no real goods or payments";
export default async function(req) {
  try {
    const client = createClientFromRequest(req);
    const user = await client.auth.me();
    if (!user) return Response.json({error:"Sign in to use the test marketplace."},{status:401});
    const svc = client.asServiceRole;
    await requireInternalSimulatorAccess(svc, user);
    const body = await req.json().catch(() => ({}));
    const action = body.action || "status";
    if (!["status","prepare","connect","refreshSeller","quote","reconcile"].includes(action)) {
      return Response.json({error:"Unknown sandbox action."},{status:400});
    }
    let vendors = await svc.entities.VendorProfile.filter({is_test_fixture:true,description:MARKER}, "-created_date", 20);
    if (action === "prepare") {
      if (user.role !== "admin") return Response.json({error:"An administrator must prepare the test seller."},{status:403});
      let vendor = vendors.find((v) => v.owner_id === user.id);
      if (!vendor) vendor = await svc.entities.VendorProfile.create({
        owner_id:user.id,business_name:"TreEbay Sandbox Nursery",contact_name:"Test seller",
        phone:"000-000-0000",city:"Test location",state:"TX",zip_code:"00000",
        description:MARKER,is_test_fixture:true,selling_status:"active",verification_status:"pending",
        pickup_available:true,delivery_available:false,
      });
      const existing = await svc.entities.Product.filter({vendor_id:vendor.id,sku:"STRIPE-SANDBOX-OAK"});
      if (!existing?.length) await svc.entities.Product.create({
        vendor_id:vendor.id,vendor_owner_id:vendor.owner_id,vendor_name:vendor.business_name,
        common_name:"Sandbox Live Oak — test only",category:"Trees",container_size:"5 gallon",
        description:MARKER,sku:"STRIPE-SANDBOX-OAK",is_test_fixture:true,listing_status:"active",
        unit_price:10,physical_quantity:20,quantity_available:20,quantity_reserved:0,quantity_sold:0,
        minimum_order_quantity:1,pickup_eligible:true,delivery_eligible:false,
      });
      vendors = await svc.entities.VendorProfile.filter({is_test_fixture:true,description:MARKER}, "-created_date", 20);
    }
    if (["connect","refreshSeller"].includes(action)) {
      const vendor = vendors.find((v) => v.id === body.vendorId);
      if (!vendor || (vendor.owner_id !== user.id && user.role !== "admin")) return Response.json({error:"This test seller belongs to another account."},{status:403});
      if (action === "connect") {
        const account = await createConnectAccount(svc,vendor,user.email,"stripe_test");
        const link = await createAccountLink(svc,{...vendor,stripe_test_account_id:account.id},"account_onboarding","stripe_test");
        return Response.json({url:link.url});
      }
      if (!vendor.stripe_test_account_id) throw new Error("Connect the test seller first.");
      await retrieveAccount(svc,vendor.stripe_test_account_id,"stripe_test");
      vendors = await svc.entities.VendorProfile.filter({is_test_fixture:true,description:MARKER}, "-created_date", 20);
    }
    if (action === "quote") {
      const product = await svc.entities.Product.get(body.productId);
      const vendor = vendors.find((v) => v.id === product?.vendor_id);
      if (!vendor || !vendorCanSell(vendor) || product?.is_test_fixture !== true || product.sku !== "STRIPE-SANDBOX-OAK" || product.listing_status !== "active") throw new Error("That test listing is unavailable.");
      if (product.quantity_available < 1) throw new Error("Test inventory is reserved by another order. Complete or cancel that checkout first.");
      const ready = sandboxReadiness();
      if (!ready.ready) throw new Error("Finish sandbox key, webhook secret and enablement setup before checkout.");
      const mode = commerceModeForVendor(vendor,true,true);
      const cents = Math.round(product.unit_price * 100);
      if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error("Invalid test listing price.");
      return Response.json(await assembleCheckout(svc,{
        buyer_id:user.id,vendor_id:vendor.id,vendor_owner_id:vendor.owner_id,
        source_type:"direct_listing",product,product_id:product.id,
        items:[{line_name:product.common_name,quantity:1,unit_price_cents:cents,subtotal_cents:cents}],
        merchandise_cents:cents,deliveryMethod:"buyer_pickup",commerce_mode:mode,destination:{},
      }));
    }
    if (action === "reconcile") {
      const order = await svc.entities.Order.get(body.orderId);
      if (!order || order.buyer_id !== user.id || order.commerce_mode !== "stripe_test") return Response.json({error:"This is not your sandbox order."},{status:403});
      if (!order.stripe_checkout_session_id) throw new Error("Open Stripe checkout for this order first.");
      await processLivePaymentSuccess(svc,order.stripe_checkout_session_id,"owner-sandbox-check","stripe_test");
    }
    const products = [];
    for (const vendor of vendors) {
      const rows = await svc.entities.Product.filter({vendor_id:vendor.id,is_test_fixture:true,sku:"STRIPE-SANDBOX-OAK"});
      for (const p of rows || []) products.push({id:p.id,name:p.common_name,price:p.unit_price,available:p.quantity_available,vendor_id:vendor.id});
    }
    const orders = await svc.entities.Order.filter({buyer_id:user.id,commerce_mode:"stripe_test"},"-created_date",5);
    const summaries = [];
    for (const o of orders || []) {
      const events = await svc.entities.StripeEvent.filter({order_id:o.id},"-created_date",10);
      summaries.push({id:o.id,number:o.order_number,status:o.order_status,payment_status:o.payment_status,
        webhook_seen:(events||[]).some((e)=>e.event_type==="checkout.session.completed")});
    }
    return Response.json({
      configuration:sandboxReadiness(),is_admin:user.role==="admin",user_id:user.id,
      sellers:vendors.map((v)=>({id:v.id,name:v.business_name,owner_id:v.owner_id,connected:Boolean(v.stripe_test_account_id),ready:vendorStripeReady(v,"stripe_test")})),
      products,orders:summaries,
    });
  } catch (error) {
    const message = String(error.message || "Sandbox setup failed.").replace(/(?:sk|rk)_(?:test|live)_[A-Za-z0-9_]+/g,"[redacted key]");
    return Response.json({error:message},{status:error.status||400});
  }
}
