import test from "node:test";
import assert from "node:assert/strict";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { loadAccountProfiles, saveBuyerProfile } from "../src/lib/accountProfiles.js";

function clientFor() {
  const records = [];
  let sequence = 0;
  const buyers = {
    filter: async (query) => records.filter((r) => r.created_by_id === query.created_by_id),
    create: async (payload) => { const r = { ...payload, id: "buyer-" + ++sequence, created_by_id: "me" }; records.push(r); return r; },
    update: async (id, payload) => Object.assign(records.find((r) => r.id === id), payload),
  };
  return { records, auth: {me: async () => ({id:"me",account_type:"buyer"})}, entities:{
    BuyerProfile: buyers, VendorProfile:{filter:async()=>[]}, CarrierProfile:{filter:async()=>[]},
  }};
}
const fields = {full_name:" Derik ",buyer_type:"Homeowner",city:"Midland",state:"TX",zip_code:"79703"};
test("a retry updates the saved buyer instead of creating a duplicate", async () => {
  const c = clientFor();
  const first = await saveBuyerProfile(c, fields);
  const next = await saveBuyerProfile(c, {...fields, city:"Updated",created_by_id:"someone-else"});
  assert.equal(first.id,next.id); assert.equal(c.records.length,1);
  assert.equal(next.created_by_id,"me"); assert.equal(next.full_name,"Derik");
});
test("missing profile responses never become false onboarding success", async () => {
  const c=clientFor(); c.entities.BuyerProfile.create=async()=>({});
  await assert.rejects(saveBuyerProfile(c,fields),/not confirmed/);
});
test("a failed lookup does not create another profile", async () => {
  const c=clientFor();c.entities.BuyerProfile.filter=async()=>{throw new Error("offline");};
  await assert.rejects(saveBuyerProfile(c,fields),/offline/);assert.equal(c.records.length,0);
  await assert.rejects(loadAccountProfiles(c,"me"),/offline/);
});
test("profile reads refuse a changed signed-in account",async()=>{
  await assert.rejects(loadAccountProfiles(clientFor(),"other"),/account changed/);
});
test("route guard and setup screen observe the same refreshed profile",async()=>{
  const c=clientFor();
  const qc=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
  const options={queryKey:["account-profiles","me"],queryFn:()=>loadAccountProfiles(c,"me")};
  const guard=new QueryObserver(qc,options),screen=new QueryObserver(qc,options);
  const stop1=guard.subscribe(()=>{}),stop2=screen.subscribe(()=>{});
  await qc.fetchQuery(options);
  assert.equal(guard.getCurrentResult().data.buyerProfile,null);
  await saveBuyerProfile(c,fields);
  await qc.invalidateQueries({queryKey:options.queryKey,refetchType:"none"});
  await qc.fetchQuery({...options,staleTime:0});
  assert.equal(guard.getCurrentResult().data.buyerProfile.id,screen.getCurrentResult().data.buyerProfile.id);
  assert.ok(guard.getCurrentResult().data.buyerProfile.id);
  stop1();stop2();qc.clear();
});
