import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const INTENT_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: ["search_inventory", "find_growers", "explain_order", "explain_rfq", "build_rfq_draft", "seller_attention", "low_stock", "match_rfqs", "list_draft", "guided_help", "navigate", "general"] },
    params: { type: "object" },
    reply: { type: "string" },
  },
};

const SYSTEM_PROMPT = `You are the TreEbay Assistant for a B2B nursery-stock marketplace. Never invent inventory, pricing, availability, vendors, RFQs, order states, or transaction data. Extract intent and search parameters only; a secure system query follows. Client mode is presentation only, not authorization. Seller-only intents are seller_attention, low_stock, match_rfqs, and list_draft. Use prior conversation only to resolve references. Keep replies concise.`;

const sellerIntents = new Set(["seller_attention", "low_stock", "match_rfqs", "list_draft"]);
const normalize = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const productText = (p) => normalize([p.common_name, p.botanical_name, p.cultivar, p.category, p.container_size, p.caliper].join(" "));

function sanitizeProduct(p) {
  return { id: p.id, common_name: p.common_name, botanical_name: p.botanical_name, unit_price: p.unit_price, quantity_available: p.quantity_available, container_size: p.container_size, caliper: p.caliper, vendor_name: p.vendor_name, vendor_city: p.vendor_city, vendor_state: p.vendor_state, verified_vendor: p.verified_vendor, pickup_eligible: p.pickup_eligible, delivery_eligible: p.delivery_eligible, images: p.images?.length ? [p.images[0]] : [] };
}
function sanitizeVendor(v) {
  return { id: v.id, business_name: v.business_name, logo_url: v.logo_url || null, city: v.city, state: v.state, verification_status: v.verification_status, rating: v.rating, review_count: v.review_count, pickup_available: v.pickup_available, delivery_available: v.delivery_available, wholesale_available: v.wholesale_available };
}
function sanitizeOrder(o) {
  return { id: o.id, order_number: o.order_number, order_status: o.order_status, payment_status: o.payment_status, total: o.total, vendor_name: o.vendor_name, fulfillment_method: o.fulfillment_method, items: (o.items || []).map((i) => ({ line_name: i.line_name, quantity: i.quantity, unit_price: i.unit_price })) };
}
function sanitizeRFQ(r) {
  return { id: r.id, status: r.status, delivery_city: r.delivery_city, delivery_state: r.delivery_state, quote_deadline: r.quote_deadline, items: (r.items || []).map((i) => ({ common_name: i.common_name, botanical_name: i.botanical_name, quantity: i.quantity, size_spec: i.size_spec })) };
}
function parsePageContext(page) {
  const orderId = page?.match(/^\/orders\/([^/]+)/)?.[1];
  const productId = page?.match(/^\/product\/([^/]+)/)?.[1];
  const rfqId = page?.match(/^\/rfqs\/([^/]+)/)?.[1] || page?.match(/^\/vendor\/rfqs\/([^/]+)\/quote/)?.[1];
  const vendorId = page?.match(/^\/vendor\/([^/]+)/)?.[1];
  return { orderId, productId, rfqId, vendorId: vendorId && !page.startsWith("/vendor/inventory") && !page.startsWith("/vendor/rfqs") ? vendorId : undefined };
}
async function searchProducts(svc, params) {
  const filters: Record<string, any> = { listing_status: "active" };
  if (params.category) filters.category = params.category;
  if (params.verified) filters.verified_vendor = true;
  if (Number(params.quantity) > 0) filters.quantity_available = { $gte: Number(params.quantity) };
  const term = normalize(params.species || params.name || params.keyword);
  let cursor;
  let matches = [];
  let exhausted = false;
  for (let page = 0; page < 8 && matches.length < 6; page += 1) {
    const query = cursor ? { ...filters, created_date: { $lt: cursor } } : filters;
    const batch = await svc.entities.Product.filter(query, "-created_date", 50);
    if (!batch?.length) { exhausted = true; break; }
    cursor = batch[batch.length - 1].created_date;
    const found = term ? batch.filter((p) => productText(p).includes(term)) : batch;
    matches = matches.concat(found);
    if (batch.length < 50) exhausted = true;
    if (exhausted) break;
  }
  return { items: matches.slice(0, 6), exhausted };
}
async function loadBounded(svc, entity, filters, maxPages = 6) {
  let cursor;
  let exhausted = false;
  const items = [];
  for (let page = 0; page < maxPages; page += 1) {
    const query = cursor ? { ...filters, created_date: { $lt: cursor } } : filters;
    const entities: any = svc.entities;
    const batch = await entities[entity].filter(query, "-created_date", 50);
    if (!batch?.length) { exhausted = true; break; }
    items.push(...batch);
    cursor = batch[batch.length - 1].created_date;
    if (batch.length < 50) { exhausted = true; break; }
  }
  return { items, exhausted };
}
function findRfqProductMatch(rfq, products) {
  for (const item of rfq.items || []) {
    const request = normalize([item.common_name, item.botanical_name, item.size_spec].join(" "));
    for (const product of products) {
      const inventory = productText(product);
      const nameMatch = [item.common_name, item.botanical_name].filter(Boolean).some((name) => {
        const normalized = normalize(name);
        return normalized && (inventory.includes(normalized) || normalized.includes(normalize(product.common_name)));
      });
      const specMatch = !item.size_spec || inventory.includes(normalize(item.size_spec));
      if (nameMatch && specMatch && request) return { item, product };
    }
  }
  return null;
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const { message, context = {}, history = [] } = body;
    if (!message) return Response.json({ error: "Message is required" }, { status: 400 });
    const svc = base44.asServiceRole;
    const vendorProfiles = await svc.entities.VendorProfile.filter({ owner_id: user.id }, "-created_date", 20);
    const isSeller = vendorProfiles.length > 0;
    const isVerifiedSeller = vendorProfiles.some((profile) => profile.verification_status === "verified");
    const presentationRole = context.role === "vendor" && isSeller ? "seller" : "buyer";
    const pageCtx = parsePageContext(context.page || "");
    const historyStr = history.slice(-8).map((turn) => `${turn.role === "user" ? "User" : "Assistant"}: ${turn.text || ""}`).join("\n");
    const classification = await base44.integrations.Core.InvokeLLM({
      prompt: `${SYSTEM_PROMPT}\n\nPresentation mode: ${presentationRole}\nCurrent page: ${context.page || "unknown"}${historyStr ? `\nPrior completed turns:\n${historyStr}` : ""}\n\nCurrent user message: "${message}"\n\nClassify intent, extract parameters, and write a short acknowledgement.`,
      response_json_schema: INTENT_SCHEMA,
    });
    const intent = classification.intent || "general";
    const params = classification.params || {};
    let reply = classification.reply || "I can help you search inventory, review RFQs, and navigate TreEbay.";
    const results = { cards: [], actions: [] };
    let queryData = null;

    if (sellerIntents.has(intent) && !isSeller) {
      queryData = { type: "seller_access", seller_profile: false };
      reply = "Seller tools are available once you create a grower profile. You can still browse inventory, request quotes, and manage projects in buyer mode.";
    } else if (intent === "match_rfqs" && !isVerifiedSeller) {
      queryData = { type: "seller_access", verified_seller: false };
      reply = "RFQ matching is available after your grower profile is verified. You can continue preparing your inventory in the meantime.";
    } else if (intent === "search_inventory") {
      if (pageCtx.productId) {
        const product = await svc.entities.Product.get(pageCtx.productId);
        if (product?.listing_status === "active") queryData = { type: "products", count: 1, items: [sanitizeProduct(product)], searchedExhaustively: true };
      }
      if (!queryData) {
        const search = await searchProducts(svc, params);
        queryData = { type: "products", count: search.items.length, items: search.items.map(sanitizeProduct), searchedExhaustively: search.exhausted };
      }
      results.cards = queryData.items.map((product) => ({ type: "product", data: product }));
      results.actions.push({ label: "View in Marketplace", path: "/marketplace" });
    } else if (intent === "find_growers") {
      const vendors = pageCtx.vendorId ? [await svc.entities.VendorProfile.get(pageCtx.vendorId)].filter(Boolean) : await svc.entities.VendorProfile.filter({ verification_status: "verified" }, "-rating", 6);
      queryData = { type: "vendors", count: vendors.length, items: vendors.map(sanitizeVendor) };
      results.cards = vendors.map((vendor) => ({ type: "vendor", data: sanitizeVendor(vendor) }));
      results.actions.push({ label: "Browse Marketplace", path: "/marketplace" });
    } else if (intent === "explain_order") {
      let orders = [];
      if (pageCtx.orderId) {
        const order = await svc.entities.Order.get(pageCtx.orderId);
        if (order && (order.buyer_id === user.id || order.vendor_owner_id === user.id || user.role === "admin")) orders = [order];
      }
      if (!orders.length && presentationRole === "buyer") orders = await svc.entities.Order.filter({ buyer_id: user.id }, "-created_date", 5);
      if (!orders.length && presentationRole === "seller" && isSeller) orders = await svc.entities.Order.filter({ vendor_owner_id: user.id }, "-created_date", 5);
      queryData = { type: "orders", count: orders.length, items: orders.slice(0, 5).map(sanitizeOrder) };
      results.cards = queryData.items.map((order) => ({ type: "order", data: order }));
      results.actions.push({ label: "View All Orders", path: "/orders" });
    } else if (intent === "explain_rfq") {
      let rfqs = [];
      if (pageCtx.rfqId) {
        try {
          const rfq = await svc.entities.RFQ.get(pageCtx.rfqId);
          if (rfq?.buyer_id === user.id || user.role === "admin") rfqs = [rfq];
          if (!rfqs.length && isSeller && rfq) {
            const quotes = await svc.entities.VendorQuote.filter({ rfq_id: rfq.id, vendor_owner_id: user.id }, "-created_date", 1);
            if (["open", "quotes_received"].includes(rfq.status) || quotes.length) rfqs = [rfq];
          }
        } catch { /* Fall back to the user's visible RFQ list. */ }
      }
      if (!rfqs.length) {
        if (isSeller && presentationRole === "seller") {
          const [open, received] = await Promise.all([svc.entities.RFQ.filter({ status: "open" }, "-created_date", 5), svc.entities.RFQ.filter({ status: "quotes_received" }, "-created_date", 5)]);
          rfqs = [...open, ...received];
        } else rfqs = await svc.entities.RFQ.filter({ buyer_id: user.id }, "-created_date", 5);
      }
      queryData = { type: "rfqs", count: rfqs.length, items: rfqs.slice(0, 5).map(sanitizeRFQ) };
      results.cards = queryData.items.map((rfq) => ({ type: "rfq", data: rfq }));
      results.actions.push({ label: "View Projects & RFQs", path: presentationRole === "seller" ? "/vendor/rfqs" : "/projects" });
    } else if (intent === "match_rfqs") {
      const [inventory, open, received] = await Promise.all([
        loadBounded(svc, "Product", { vendor_owner_id: user.id, listing_status: "active" }),
        loadBounded(svc, "RFQ", { status: "open" }),
        loadBounded(svc, "RFQ", { status: "quotes_received" }),
      ]);
      const matches = [];
      for (const rfq of [...open.items, ...received.items]) {
        const match = findRfqProductMatch(rfq, inventory.items);
        if (match) {
          const requestedQuantity = Number(match.item.quantity) || 0;
          const availableQuantity = Number(match.product.quantity_available) || 0;
          matches.push({ rfq_id: rfq.id, requested_item: match.item.common_name || match.item.botanical_name, requested_quantity: requestedQuantity, product_id: match.product.id, product_name: match.product.common_name, quantity_available: availableQuantity, match_type: availableQuantity >= requestedQuantity ? "full" : "partial", delivery_city: rfq.delivery_city, delivery_state: rfq.delivery_state, quote_deadline: rfq.quote_deadline });
        }
        if (matches.length === 6) break;
      }
      const searchedExhaustively = inventory.exhausted && open.exhausted && received.exhausted;
      queryData = { type: "rfq_matches", count: matches.length, searchedExhaustively, items: matches };
      results.cards = matches.map((match) => ({ type: "rfq_match", data: match }));
    } else if (intent === "seller_attention" || intent === "low_stock") {
      const products = await svc.entities.Product.filter({ vendor_owner_id: user.id, listing_status: "active" }, "-created_date", 100);
      const low = products.filter((product) => product.quantity_available <= (intent === "low_stock" ? 10 : 5));
      if (intent === "seller_attention") {
        const orders = await svc.entities.Order.filter({ vendor_owner_id: user.id }, "-created_date", 20);
        const needsConfirmation = orders.filter((order) => ["payment_confirmed", "inventory_reserved"].includes(order.order_status));
        if (needsConfirmation.length) results.cards.push({ type: "seller_alert", data: { title: "Orders needing confirmation", count: needsConfirmation.length } });
        if (low.length) results.cards.push({ type: "seller_alert", data: { title: "Low inventory alerts", count: low.length } });
        queryData = { orders_needing_confirmation: needsConfirmation.length, low_stock_count: low.length };
      } else {
        queryData = { type: "products", count: low.length, items: low.slice(0, 6).map(sanitizeProduct) };
        results.cards = queryData.items.map((product) => ({ type: "product", data: product }));
      }
      results.actions.push({ label: "Manage Inventory", path: "/vendor/inventory" });
    } else if (intent === "list_draft") {
      const draft = { common_name: params.species || params.name || "", category: params.category || "", unit_price: params.price || 0, physical_quantity: params.quantity || 0, container_size: params.container || params.size || "", bulk_price_tiers: params.tiers || [] };
      queryData = { type: "listing_draft", draft };
      results.cards.push({ type: "listing_draft", data: draft });
      results.actions.push({ label: "Review in Inventory", path: `/vendor/inventory/new?ai_draft=${encodeURIComponent(JSON.stringify(draft))}` });
    } else if (intent === "build_rfq_draft") {
      const draft = { items: params.items || (params.species ? [{ common_name: params.species, quantity: params.quantity || 1, size_spec: params.size || "" }] : []), delivery_city: params.location || params.city || "", delivery_state: params.state || "", notes: params.notes || "" };
      queryData = { type: "rfq_draft", draft };
      results.cards.push({ type: "rfq_draft", data: draft });
      results.actions.push({ label: "Review in Projects", path: `/projects?ai_draft=${encodeURIComponent(JSON.stringify(draft))}` });
    }

    if (queryData && !["seller_access", "listing_draft", "rfq_draft"].includes(queryData.type)) {
      const explanation = await base44.integrations.Core.InvokeLLM({
        prompt: `Repeat only explicit fields in the verified TreEbay JSON data below. Do not infer plant compatibility, summarize statuses with new labels, calculate totals, or invent data. Describe an RFQ as open only if its explicit status is open. If count is zero and searchedExhaustively is true, say no matching results were found. If count is zero and searchedExhaustively is false, say the search is still limited and suggest Marketplace or an RFQ. Keep to 2-4 sentences.\n\nUser message: ${message}\nIntent: ${intent}\nData: ${JSON.stringify(queryData).slice(0, 3000)}`,
      });
      if (explanation) reply = explanation;
    }
    return Response.json({ reply, intent, results, user: { id: user.id, isSeller, isVerifiedSeller, presentationRole } });
  } catch (error) {
    return Response.json({ error: error.message, reply: "I’m having trouble connecting right now. You can still browse the marketplace and manage TreEbay normally." }, { status: 500 });
  }
}