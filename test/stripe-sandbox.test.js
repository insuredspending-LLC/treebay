import test, { after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createHmac } from "node:crypto";
const originalFetch=globalThis.fetch;
const envNames=["STRIPE_SECRET_KEY","STRIPE_TEST_SECRET_KEY","STRIPE_WEBHOOK_SECRET","STRIPE_TEST_WEBHOOK_SECRET","TREE_MARKETPLACE_STRIPE_SANDBOX","TREE_MARKETPLACE_LIVE_PAYMENTS","BASE44_APP_ID"];
const originalEnv=Object.fromEntries(envNames.map(k=>[k,process.env[k]]));
after(()=>{globalThis.fetch=originalFetch;delete globalThis.__stripeTestClient;for(const k of envNames){if(originalEnv[k]===undefined)delete process.env[k];else process.env[k]=originalEnv[k];}});
const bundle=await build({
  stdin:{contents:'export * from "./base44/shared/stripe.ts"; export * from "./base44/shared/stripeMode.ts"; export * from "./base44/shared/transactions.ts"; export * from "./base44/shared/payments.ts"; export {default as webhook} from "./base44/functions/stripeWebhook/entry.ts";',resolveDir:process.cwd(),loader:"ts"},
  bundle:true,write:false,platform:"node",format:"esm",
  plugins:[{name:"test-sdk",setup(b){b.onResolve({filter:/^npm:@base44\/sdk/},()=>({path:"sdk",namespace:"test-sdk"}));b.onLoad({filter:/.*/,namespace:"test-sdk"},()=>({contents:"export const createClientFromRequest = () => globalThis.__stripeTestClient;"}));}}],
});
const mod=await import("data:text/javascript;base64,"+Buffer.from(bundle.outputFiles[0].text).toString("base64"));

function configure(){
 process.env.STRIPE_SECRET_KEY="sk_live_fake_for_unit_tests";
 process.env.STRIPE_TEST_SECRET_KEY="sk_test_fake_for_unit_tests";
 process.env.STRIPE_WEBHOOK_SECRET="whsec_live_unit";
 process.env.STRIPE_TEST_WEBHOOK_SECRET="whsec_test_unit";
 process.env.TREE_MARKETPLACE_STRIPE_SANDBOX="enabled";
 process.env.TREE_MARKETPLACE_LIVE_PAYMENTS="disabled";
 process.env.BASE44_APP_ID="test-app";
}
const copy=v=>v===undefined?undefined:structuredClone(v);
function match(row,query){
 return Object.entries(query||{}).every(([k,v])=>{
  if(k==="$or")return v.some(q=>match(row,q));
  if(k==="$and")return v.every(q=>match(row,q));
  const value=row[k];
  if(v&&typeof v==="object"&&!Array.isArray(v))return Object.entries(v).every(([op,n])=>{
    if(op==="$in")return n.includes(value);
    if(op==="$nin")return !n.includes(value);
    if(op==="$gte")return value>=n;
    if(op==="$gt")return value>n;
    if(op==="$lte")return value<=n;
    if(op==="$lt")return value<n;
    if(op==="$ne")return value!==n;
    if(op==="$exists")return (value!==undefined)===n;
    throw new Error("Unsupported query operator "+op);
  });
  return value===v;
 });
}
function fakeDatabase(){
 const tables={};let sequence=0;
 const entities=new Proxy({}, {get(_target,name){
   tables[name]??=[];
   return {
    get:async id=>copy(tables[name].find(r=>r.id===id)),
    filter:async(q={},sort,limit)=>{let rows=tables[name].filter(r=>match(r,q));if(sort){const field=sort.replace(/^-/,"");rows=[...rows].sort((a,b)=>(a[field]>b[field]?1:a[field]<b[field]?-1:0)*(sort.startsWith("-")?-1:1));}return copy(limit?rows.slice(0,limit):rows);},
    list:async()=>copy(tables[name]),
    create:async data=>{const r={...copy(data),id:data.id||name+"-"+(++sequence),created_date:new Date().toISOString()};tables[name].push(r);return copy(r);},
    update:async(id,data)=>{const r=tables[name].find(r=>r.id===id);if(!r)throw Error(name+" missing "+id);Object.assign(r,copy(data));return copy(r);},
    updateMany:async(query,patch)=>{let n=0;for(const row of tables[name]){if(!match(row,query))continue;n++;for(const [op,fields] of Object.entries(patch)){for(const [key,value] of Object.entries(fields)){if(op==="$set")row[key]=copy(value);else if(op==="$inc")row[key]=(row[key]||0)+value;else throw new Error("Unsupported update "+op);}}}return {updated_count:n};},
   };
 }});
 return {entities,tables};
}
async function fixture(){
 configure();
 const svc=fakeDatabase();
 const vendor=await svc.entities.VendorProfile.create({id:"vendor",owner_id:"seller",business_name:"Sandbox",is_test_fixture:true,selling_status:"active",stripe_test_account_id:"acct_sandbox",stripe_test_payouts_enabled:true,stripe_test_details_submitted:true,stripe_account_id:"acct_live_untouched",stripe_payouts_enabled:false});
 const product=await svc.entities.Product.create({id:"product",vendor_id:vendor.id,vendor_owner_id:"seller",is_test_fixture:true,listing_status:"active",unit_price:10,physical_quantity:20,quantity_available:20,quantity_reserved:0,quantity_sold:0,pickup_eligible:true,delivery_eligible:false});
 const user={id:"buyer",role:"user",email:"buyer@example.invalid"};
 await svc.entities.TesterSignup.create({play_email:user.email,status:"active",consent_to_testing:true});
 const {checkoutQuote:cq}=await mod.assembleCheckout(svc,{buyer_id:user.id,vendor_id:vendor.id,vendor_owner_id:"seller",source_type:"direct_listing",product,product_id:product.id,items:[{line_name:"Test oak",quantity:1,unit_price_cents:1000,subtotal_cents:1000}],merchandise_cents:1000,deliveryMethod:"buyer_pickup",commerce_mode:"stripe_test"});
 const {order}=await mod.createOrderFromQuote(svc,cq.id,user);
 let session=null,intent=null,charge=null,refund=null;
 const calls=[];
 globalThis.fetch=async(url,opts={})=>{
  const path=new URL(url).pathname.replace("/v1","");
  calls.push({path,method:opts.method||"GET",authorization:opts.headers.Authorization});
  assert.equal(opts.headers.Authorization,"Bearer sk_test_fake_for_unit_tests","sandbox request attempted live credentials");
  let result;
  if(path==="/accounts/acct_sandbox")result={id:"acct_sandbox",payouts_enabled:true,details_submitted:true,capabilities:{transfers:"active"}};
  else if(path==="/checkout/sessions"&&opts.method==="POST"){
    const params=new URLSearchParams(opts.body);
    const metadata=Object.fromEntries(["order_id","payment_attempt_id","payment_attempt_sequence","base44_app_id"].map(k=>[k,params.get("metadata["+k+"]")]));
    session={id:"cs_test_unit",livemode:false,status:"open",payment_status:"unpaid",currency:"usd",amount_total:cq.total_amount_cents,metadata,url:"https://checkout.stripe.com/test-unit",expires_at:Math.floor(Date.now()/1000)+1860};
    intent={id:"pi_test_unit",livemode:false,status:"succeeded",amount_received:cq.total_amount_cents,currency:"usd",metadata,latest_charge:"ch_test_unit"};
    charge={id:"ch_test_unit",livemode:false,amount:cq.total_amount_cents,amount_refunded:0,currency:"usd",payment_intent:intent.id,metadata};
    result=session;
  } else if(path==="/checkout/sessions/cs_test_unit")result=session;
  else if(path==="/payment_intents/pi_test_unit")result=intent;
  else if(path==="/refunds"&&opts.method==="POST"){
    const params=new URLSearchParams(opts.body);
    refund={id:"re_test_unit",livemode:false,status:"succeeded",charge:charge.id,amount:Number(params.get("amount")),metadata:{order_id:order.id}};
    charge.amount_refunded=refund.amount;result=refund;
  } else if(path==="/refunds/re_test_unit")result=refund;
  else if(path==="/charges/ch_test_unit")result=charge;
  else throw new Error("Unexpected Stripe request "+path);
  return new Response(JSON.stringify(result),{status:200,headers:{"Content-Type":"application/json"}});
 };
 globalThis.__stripeTestClient={asServiceRole:svc,auth:{me:async()=>user}};
 return {svc,vendor,product,user,cq,order,calls,paid(){session.status="complete";session.payment_status="paid";session.payment_intent=intent.id;},session(){return session;}};
}
function webhookRequest(event,secret="whsec_test_unit"){
 const body=JSON.stringify(event),timestamp=Math.floor(Date.now()/1000);
 const sig=createHmac("sha256",secret).update(timestamp+"."+body).digest("hex");
 return new Request("https://example.invalid/webhook",{method:"POST",headers:{"stripe-signature":"t="+timestamp+",v1="+sig},body});
}

test("sandbox cannot borrow live credentials or run the internal simulator through Stripe",async()=>{
 configure();delete process.env.STRIPE_TEST_SECRET_KEY;
 assert.throws(()=>mod.stripeKeyForMode("stripe_test"),/sandbox requires/);
 assert.throws(()=>mod.stripeKeyForMode("test"),/Unsupported/);
 assert.equal(mod.stripeSandboxEnabled(),false);
});
test("explicit Stripe environment validation rejects missing and crossed modes",()=>{
 configure();
 assert.throws(()=>mod.assertStripeObjectMode({livemode:true},"stripe_test"),/environment/);
 assert.throws(()=>mod.stripeModeFromObject({}),/explicit environment/);
 assert.throws(()=>mod.assertStripeOrderMode({commerce_mode:"live"},"stripe_test"),/another environment/);
});
test("sandbox checkout requires tester access and fixture seller readiness",()=>{
 configure();
 const v={is_test_fixture:true,stripe_test_account_id:"acct_test",stripe_test_payouts_enabled:true,stripe_test_details_submitted:true};
 assert.equal(mod.commerceModeForVendor(v,true,true),"stripe_test");
 assert.throws(()=>mod.commerceModeForVendor(v,false,true),/approved testers/);
 assert.throws(()=>mod.commerceModeForVendor({...v,is_test_fixture:false},true,true),/dedicated test seller/);
 assert.equal(mod.commerceModeForVendor(v,true,false),"payments_disabled");
});
test("seller sandbox synchronization never overwrites live account fields",async()=>{
 configure();const svc=fakeDatabase();
 await svc.entities.VendorProfile.create({id:"v",stripe_account_id:"acct_live",stripe_payouts_enabled:false,stripe_test_account_id:"acct_test"});
 await mod.syncVendorFromAccount(svc,"acct_test",{payouts_enabled:true,details_submitted:true,capabilities:{transfers:"active"}},"stripe_test");
 const row=await svc.entities.VendorProfile.get("v");
 assert.equal(row.stripe_account_id,"acct_live");assert.equal(row.stripe_payouts_enabled,false);assert.equal(row.stripe_test_payouts_enabled,true);
});
test("webhook secrets are isolated and tampered payloads are rejected",async()=>{
 configure();
 const event={id:"evt_unit",livemode:false,type:"unknown",data:{object:{}}};
 const req=webhookRequest(event),body=await req.text(),sig=req.headers.get("stripe-signature");
 assert.equal(await mod.verifyWebhookSignature(body,sig,"stripe_test"),true);
 assert.equal(await mod.verifyWebhookSignature(body,sig,"live"),false);
 assert.equal(await mod.verifyWebhookSignature(body+" ",sig,"stripe_test"),false);
});
test("quote, held inventory, Stripe webhook, duplicate delivery and refund reconcile",async()=>{
 const f=await fixture();
 assert.equal((await f.svc.entities.Product.get("product")).quantity_available,19);
 const session=await mod.createCheckoutSession(f.svc,f.order,f.cq,f.vendor);
 assert.ok(session.id.startsWith("cs_test"));
 const reused=await mod.createCheckoutSession(f.svc,await f.svc.entities.Order.get(f.order.id),f.cq,f.vendor);
 assert.equal(reused.id,session.id);assert.equal(f.calls.filter(c=>c.path==="/checkout/sessions").length,1);
 f.paid();
 const event={id:"evt_paid_unit",livemode:false,type:"checkout.session.completed",data:{object:session}};
 const result=await mod.webhook(webhookRequest(event));
 assert.equal(result.status,200,await result.clone().text());
 assert.equal((await f.svc.entities.Order.get(f.order.id)).payment_status,"paid");
 const duplicate=await mod.webhook(webhookRequest(event));
 assert.equal((await duplicate.json()).duplicate,true);
 assert.equal(f.svc.tables.StripeEvent.length,1);
 assert.equal(f.svc.tables.PaymentRecord.length,1);
 assert.equal(f.svc.tables.PaymentRecord[0].commerce_mode,"stripe_test");
 assert.equal(f.svc.tables.PaymentRecord[0].confirmation_status,"complete");
 assert.ok(f.svc.tables.TransactionDocument.some(d=>JSON.stringify(d).includes("NO REAL PAYMENT")));
 await mod.initiateRefundWorkflow(f.svc,f.order.id,{type:"buyer",id:"buyer"},"Sandbox refund");
 assert.equal((await f.svc.entities.Order.get(f.order.id)).order_status,"refunded");
 assert.equal((await f.svc.entities.Product.get("product")).quantity_available,20);
 assert.equal((await f.svc.entities.Product.get("product")).quantity_reserved,0);
 await mod.initiateRefundWorkflow(f.svc,f.order.id,{type:"buyer",id:"buyer"},"Retry");
 assert.equal(f.calls.filter(c=>c.path==="/refunds").length,1);
});
test("expired Stripe checkout releases held inventory once",async()=>{
 const f=await fixture();const session=await mod.createCheckoutSession(f.svc,f.order,f.cq,f.vendor);
 const event={id:"evt_expire_unit",livemode:false,type:"checkout.session.expired",data:{object:{...session,status:"expired"}}};
 assert.equal((await mod.webhook(webhookRequest(event))).status,200);
 assert.equal((await f.svc.entities.Product.get("product")).quantity_available,20);
 assert.equal((await f.svc.entities.Order.get(f.order.id)).order_status,"payment_failed");
 assert.equal((await (await mod.webhook(webhookRequest(event))).json()).duplicate,true);
 assert.equal((await f.svc.entities.Product.get("product")).quantity_available,20);
});
test("test payment confirmation cannot mutate a live order",async()=>{
 const f=await fixture();await mod.createCheckoutSession(f.svc,f.order,f.cq,f.vendor);f.paid();
 await f.svc.entities.Order.update(f.order.id,{commerce_mode:"live"});
 const before=await f.svc.entities.Order.get(f.order.id);
 await assert.rejects(mod.processLivePaymentSuccess(f.svc,"cs_test_unit","evt_cross","stripe_test"),/another environment/);
 assert.deepEqual(await f.svc.entities.Order.get(f.order.id),before);
});
test("a mismatched Stripe amount quarantines the payment without fulfillment",async()=>{
 const f=await fixture();await mod.createCheckoutSession(f.svc,f.order,f.cq,f.vendor);f.paid();f.session().amount_total+=1;
 await assert.rejects(mod.processLivePaymentSuccess(f.svc,"cs_test_unit","evt_wrong","stripe_test"),/integrity/);
 const order=await f.svc.entities.Order.get(f.order.id);
 assert.equal(order.financial_hold,true);assert.equal(order.order_status,"awaiting_payment");
 assert.notEqual(order.payment_status,"paid");
});

test("sandbox settlement uses the test seller and reverses its transfer on refund",async()=>{
 const f=await fixture();await mod.createCheckoutSession(f.svc,f.order,f.cq,f.vendor);f.paid();
 await mod.processLivePaymentSuccess(f.svc,"cs_test_unit","evt_settle","stripe_test");
 const previousFetch=globalThis.fetch;let transferCount=0,reversalCount=0;
 globalThis.fetch=async(url,opts={})=>{
   const path=new URL(url).pathname.replace("/v1","");
   if(path==="/transfers"){
     assert.equal(opts.headers.Authorization,"Bearer sk_test_fake_for_unit_tests");
     const body=new URLSearchParams(opts.body);
     assert.equal(body.get("destination"),"acct_sandbox");
     assert.equal(Number(body.get("amount")),mod.vendorPayableCents(f.cq));
     transferCount++;return new Response(JSON.stringify({id:"tr_test_unit",livemode:false}),{status:200});
   }
   if(path==="/transfers/tr_test_unit/reversals"){
     assert.equal(opts.headers.Authorization,"Bearer sk_test_fake_for_unit_tests");
     assert.equal(Number(new URLSearchParams(opts.body).get("amount")),mod.vendorPayableCents(f.cq));
     reversalCount++;return new Response(JSON.stringify({id:"trr_test_unit"}),{status:200});
   }
   return previousFetch(url,opts);
 };
 // Isolate financial settlement preconditions; fulfillment/UI is a separate test.
 await f.svc.entities.Order.update(f.order.id,{buyer_confirmed_at:new Date().toISOString(),payout_eligible_at:new Date(Date.now()-1000).toISOString()});
 await mod.createVendorTransfer(f.svc,await f.svc.entities.Order.get(f.order.id),f.cq);
 await mod.createVendorTransfer(f.svc,await f.svc.entities.Order.get(f.order.id),f.cq);
 assert.equal(transferCount,1);
 await mod.initiateRefundWorkflow(f.svc,f.order.id,{type:"buyer",id:"buyer"},"Transfer reversal test");
 assert.equal(reversalCount,1);
 assert.equal((await f.svc.entities.Order.get(f.order.id)).stripe_transfer_reversed_cents,mod.vendorPayableCents(f.cq));
 assert.equal((await f.svc.entities.Order.get(f.order.id)).order_status,"refunded");
});
