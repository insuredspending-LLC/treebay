import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiError } from "@/lib/treebay";

export default function StripeSandbox() {
  const [data,setData]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const navigate=useNavigate();
  const run=async(action,extra={})=>{
    setBusy(true);setError("");
    try {
      const response=await base44.functions.invoke("stripeSandbox",{action,...extra});
      const result=response.data;
      if(result?.error) throw new Error(result.error);
      if(result?.url) { window.location.assign(result.url); return; }
      if(result?.checkoutQuote?.id) {navigate("/checkout?quote="+result.checkoutQuote.id);return;}
      setData(result);
    } catch(e){setError(apiError(e));}
    finally{setBusy(false);}
  };
  useEffect(()=>{run("status");},[]);
  const configured=data?.configuration?.ready;
  return <main className="max-w-2xl mx-auto p-5 sm:p-8 space-y-5">
    <Link to="/home" className="text-primary underline">Back to TreEbay</Link>
    <div><h1 className="text-3xl font-bold">Test marketplace</h1>
      <p className="mt-2 text-base text-muted-foreground">Practice a plant order through Stripe sandbox. No real payment, payout or delivery.</p></div>
    {error&&<Card className="p-4 border-red-300" role="alert"><p>{error}</p><Button className="mt-3" disabled={busy} onClick={()=>run("status")}>Retry</Button></Card>}
    {!data&&!error&&<p>Loading test setup…</p>}
    {data&&<>
      {!configured&&<Card className="p-5 space-y-2">
        <h2 className="text-lg font-semibold">Payment setup needs attention</h2>
        <p>Test inventory is available below. Checkout opens once the administrator completes these connections.</p>
        <ul className="list-disc pl-5">
          {!data.configuration.key_ready&&<li>Stripe sandbox secret key</li>}
          {!data.configuration.webhook_ready&&<li>Sandbox webhook signing secret</li>}
          {!data.configuration.sandbox_enabled&&<li>Enable sandbox purchases</li>}
        </ul>
        {data.is_admin&&<details><summary className="cursor-pointer">Administrator setup</summary><p className="mt-2 text-sm">In Base44 Secrets, set STRIPE_TEST_SECRET_KEY, STRIPE_TEST_WEBHOOK_SECRET and TREE_MARKETPLACE_STRIPE_SANDBOX=enabled. Use keys from the same Stripe sandbox. Keep live payments disabled. The webhook endpoint is this app’s stripeWebhook function.</p></details>}
      </Card>}
      {data.is_admin&&data.sellers.length===0&&<Button disabled={busy} onClick={()=>run("prepare")}>Prepare test seller and inventory</Button>}
      {data.sellers.map(s=><Card key={s.id} className="p-5 space-y-3">
        <h2 className="text-lg font-semibold">{s.name}</h2>
        <p>{s.ready?"Test seller connected":"Test seller onboarding is incomplete"}</p>
        {(data.is_admin||s.owner_id===data.user_id)&&<div className="flex flex-wrap gap-2">
          <Button disabled={busy||!data.configuration.key_ready||!data.configuration.sandbox_enabled} onClick={()=>run("connect",{vendorId:s.id})}>{s.connected?"Continue test seller setup":"Connect test seller"}</Button>
          <Button variant="outline" disabled={busy||!s.connected} onClick={()=>run("refreshSeller",{vendorId:s.id})}>Check seller status</Button>
        </div>}
      </Card>)}
      <section className="space-y-3"><h2 className="text-xl font-semibold">Test inventory</h2>
        {!data.products.length&&<p>The administrator needs to prepare the sample listing.</p>}
        {data.products.map(p=><Card key={p.id} className="p-5 space-y-2">
          <h3 className="font-semibold">{p.name}</h3><p>${p.price.toFixed(2)} · {p.available} test units available · Pickup</p>
          <Button disabled={busy||!configured||!data.sellers.find(s=>s.id===p.vendor_id)?.ready||p.available<1} onClick={()=>run("quote",{productId:p.id})}>Start test order</Button>
        </Card>)}
      </section>
      {data.orders.length>0&&<section className="space-y-3"><h2 className="text-xl font-semibold">Your test orders</h2>
        {data.orders.map(o=><Card key={o.id} className="p-4 space-y-2">
          <Link className="text-primary underline font-semibold" to={"/orders/"+o.id}>{o.number}</Link>
          <p>{o.status.replaceAll("_"," ")} · Payment: {o.payment_status}</p>
          <p className="text-sm">{o.webhook_seen?"Stripe checkout webhook recorded":"Checkout webhook not yet recorded"}</p>
          {o.status==="awaiting_payment"&&<Button disabled={busy} variant="outline" onClick={()=>run("reconcile",{orderId:o.id})}>Check Stripe payment</Button>}
        </Card>)}
      </section>}
      <Button variant="outline" disabled={busy} onClick={()=>run("status")}>{busy?"Working…":"Refresh test setup"}</Button>
    </>}
  </main>;
}
