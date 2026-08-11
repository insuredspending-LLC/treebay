import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const INTENT_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string", enum: ["search_inventory", "find_growers", "explain_order", "explain_rfq", "build_rfq_draft", "seller_attention", "low_stock", "list_draft", "guided_help", "navigate", "general"] },
    params: { type: "object" },
    reply: { type: "string" },
  },
};

const SYSTEM_PROMPT = `You are the TreEbay Assistant for a B2B marketplace for live nursery stock and landscape materials.

CRITICAL SECURITY RULES — never violate these:
1. NEVER invent or fabricate inventory, prices, quantities, availability, vendor verification, order status, shipment status, payment status, or refund status. Those values come from real TreEbay data which the system will look up after you respond.
2. You may interpret user intent and extract parameters (species, quantity, size, location, timing).
3. You may explain how TreEbay works and guide users to the right page.
4. For transaction-related questions (orders, refunds, payments), say you will look up the real status — do not guess.
5. Keep replies concise (2-4 sentences), professional, and helpful.
6. If information is missing to fulfill an intent, ask only for what is genuinely needed.
7. Use conversation history to resolve references (e.g., "25" after "I need Live Oaks" means 25 Live Oaks).

User role and current page are provided. Adapt your guidance to the role (buyer vs seller).

Intent definitions:
- search_inventory: user wants to find plants/trees/supplies to buy
- find_growers: user wants to find nurseries/growers/suppliers
- explain_order: user asks about an existing order's status
- explain_rfq: user asks about an RFQ or quotes received
- build_rfq_draft: user wants to create a bulk quote request
- seller_attention: seller asks what needs attention (orders, RFQs, inventory)
- low_stock: seller asks about low inventory
- list_draft: seller wants to create/edit a product listing
- guided_help: user asks how to do something in TreEbay
- navigate: user wants to go to a specific page
- general: anything else`;

// ── Sanitizers: return only fields needed for each card type ──────────────
function sanitizeProduct(p: any) {
  return {
    id: p.id,
    common_name: p.common_name,
    botanical_name: p.botanical_name,
    unit_price: p.unit_price,
    quantity_available: p.quantity_available,
    container_size: p.container_size,
    caliper: p.caliper,
    vendor_name: p.vendor_name,
    vendor_city: p.vendor_city,
    vendor_state: p.vendor_state,
    verified_vendor: p.verified_vendor,
    pickup_eligible: p.pickup_eligible,
    delivery_eligible: p.delivery_eligible,
    images: p.images?.length ? [p.images[0]] : [],
  };
}

function sanitizeVendor(v: any) {
  return {
    id: v.id,
    business_name: v.business_name,
    logo_url: v.logo_url || null,
    city: v.city,
    state: v.state,
    verification_status: v.verification_status,
    rating: v.rating,
    review_count: v.review_count,
    pickup_available: v.pickup_available,
    delivery_available: v.delivery_available,
    wholesale_available: v.wholesale_available,
  };
}

function sanitizeOrder(o: any) {
  return {
    id: o.id,
    order_number: o.order_number,
    order_status: o.order_status,
    payment_status: o.payment_status,
    total: o.total,
    vendor_name: o.vendor_name,
    fulfillment_method: o.fulfillment_method,
    items: (o.items || []).map((i: any) => ({ line_name: i.line_name, quantity: i.quantity, unit_price: i.unit_price })),
  };
}

function sanitizeRFQ(r: any) {
  return {
    id: r.id,
    status: r.status,
    delivery_city: r.delivery_city,
    delivery_state: r.delivery_state,
    quote_deadline: r.quote_deadline,
    items: (r.items || []).map((i: any) => ({ common_name: i.common_name, quantity: i.quantity, size_spec: i.size_spec })),
  };
}

// ── Parse current-page route to resolve the record the user is viewing ────
function parsePageContext(page: string) {
  if (!page) return {};
  const orderMatch = page.match(/^\/orders\/([^/]+)/);
  const productMatch = page.match(/^\/product\/([^/]+)/);
  const rfqMatch = page.match(/^\/rfqs\/([^/]+)/);
  const vendorMatch = page.match(/^\/vendor\/([^/]+)/);
  return {
    orderId: orderMatch?.[1],
    productId: productMatch?.[1],
    rfqId: rfqMatch?.[1],
    vendorId: vendorMatch?.[1] && !page.startsWith("/vendor/inventory") && !page.startsWith("/vendor/rfqs") ? vendorMatch[1] : undefined,
  };
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { message, context, history } = body;
    if (!message) return Response.json({ error: "Message is required" }, { status: 400 });

    const role = context?.role || "buyer";
    const page = context?.page || "unknown";
    const pageCtx = parsePageContext(page);

    // Build conversation history for LLM context (last 6 turns)
    const historyStr = (history || []).slice(-6).map((h: any) =>
      `${h.role === "user" ? "User" : "Assistant"}: ${h.text || h.reply || ""}`
    ).join("\n");

    // Step 1: Classify intent via LLM
    const classification = await base44.integrations.Core.InvokeLLM({
      prompt: `${SYSTEM_PROMPT}\n\nUser role: ${role}\nCurrent page: ${page}${historyStr ? `\n\nRecent conversation:\n${historyStr}` : ""}\n\nUser message: "${message}"\n\nClassify the intent, extract relevant params (quantity, species, size, location, category, etc.), and write a brief acknowledgment reply. If you will look up real data, mention that. Do NOT fabricate any data — the system will query real TreEbay data after this step.`,
      response_json_schema: INTENT_SCHEMA,
    });

    const intent = classification.intent || "general";
    const params = classification.params || {};
    let reply = classification.reply || "I'm here to help you find plants, compare suppliers, and manage your TreEbay activity.";

    // Step 2: Perform authorized read-only queries based on intent
    const results = { cards: [], actions: [] };
    let queryData: any = null;

    try {
      if (intent === "search_inventory") {
        // If on a product page, prefer that exact product
        if (pageCtx.productId) {
          try {
            const p = await base44.entities.Product.get(pageCtx.productId);
            if (p && p.listing_status === "active") {
              queryData = { type: "products", count: 1, items: [sanitizeProduct(p)] };
              results.cards = [{ type: "product", data: sanitizeProduct(p) }];
            }
          } catch {}
        }
        if (!queryData) {
          const products = await base44.entities.Product.filter({ listing_status: "active" }, "-created_date", 50);
          let list = products || [];
          const term = (params.species || params.name || params.keyword || "").toString().toLowerCase().trim();
          const cat = params.category || "";
          const minQty = Number(params.quantity) || 0;
          if (term) list = list.filter((p: any) => [p.common_name, p.botanical_name, p.cultivar, p.category].filter(Boolean).join(" ").toLowerCase().includes(term));
          if (cat) list = list.filter((p: any) => p.category === cat);
          if (minQty > 0) list = list.filter((p: any) => p.quantity_available >= minQty);
          list = list.slice(0, 6);
          queryData = { type: "products", count: list.length, items: list.map(sanitizeProduct) };
          results.cards = list.map((p: any) => ({ type: "product", data: sanitizeProduct(p) }));
        }
        results.actions.push({ label: "View in Marketplace", path: "/marketplace" });
      } else if (intent === "find_growers") {
        // If on a vendor page, prefer that exact vendor
        if (pageCtx.vendorId) {
          try {
            const v = await base44.entities.VendorProfile.get(pageCtx.vendorId);
            if (v) {
              queryData = { type: "vendors", count: 1, items: [sanitizeVendor(v)] };
              results.cards = [{ type: "vendor", data: sanitizeVendor(v) }];
            }
          } catch {}
        }
        if (!queryData) {
          const vendors = await base44.entities.VendorProfile.filter({ verification_status: "verified" }, "-rating", 20);
          const list = (vendors || []).slice(0, 6);
          queryData = { type: "vendors", count: list.length, items: list.map(sanitizeVendor) };
          results.cards = list.map((v: any) => ({ type: "vendor", data: sanitizeVendor(v) }));
        }
        results.actions.push({ label: "Browse Marketplace", path: "/marketplace" });
      } else if (intent === "explain_order") {
        let orders: any[] = [];
        // If on an order detail page, prefer that exact order (after auth check)
        if (pageCtx.orderId) {
          try {
            const o = await base44.entities.Order.get(pageCtx.orderId);
            if (o && (o.buyer_id === user.id || o.vendor_owner_id === user.id || user.role === "admin")) {
              orders = [o];
            }
          } catch {}
        }
        if (orders.length === 0) {
          const all = await base44.entities.Order.list("-created_date", 20);
          orders = (all || []).filter((o: any) => o.buyer_id === user.id || o.vendor_owner_id === user.id || user.role === "admin");
        }
        const list = orders.slice(0, 5);
        queryData = { type: "orders", count: list.length, items: list.map(sanitizeOrder) };
        results.cards = list.map((o: any) => ({ type: "order", data: sanitizeOrder(o) }));
        results.actions.push({ label: "View All Orders", path: "/orders" });
      } else if (intent === "explain_rfq") {
        let rfqs: any[] = [];
        // If on an RFQ detail page, prefer that exact RFQ (after auth check)
        if (pageCtx.rfqId) {
          try {
            const r = await base44.entities.RFQ.get(pageCtx.rfqId);
            if (r && (r.buyer_id === user.id || user.role === "admin")) {
              rfqs = [r];
            }
          } catch {}
        }
        if (rfqs.length === 0) {
          if (role === "vendor") {
            // Seller discovery: only open / quotes_received per TreEbay policy
            const [open, qr] = await Promise.all([
              base44.entities.RFQ.filter({ status: "open" }, "-created_date", 20),
              base44.entities.RFQ.filter({ status: "quotes_received" }, "-created_date", 20),
            ]);
            rfqs = [...(open || []), ...(qr || [])];
          } else {
            // Buyer: only own RFQs
            const all = await base44.entities.RFQ.list("-created_date", 20);
            rfqs = (all || []).filter((r: any) => r.buyer_id === user.id);
          }
        }
        const list = rfqs.slice(0, 5);
        queryData = { type: "rfqs", count: list.length, items: list.map(sanitizeRFQ) };
        results.cards = list.map((r: any) => ({ type: "rfq", data: sanitizeRFQ(r) }));
        results.actions.push({ label: "View Projects & RFQs", path: "/projects" });
      } else if (intent === "build_rfq_draft") {
        const draft = {
          items: params.items || (params.species ? [{ common_name: params.species, quantity: params.quantity || 1, size_spec: params.size || "" }] : []),
          delivery_city: params.location || params.city || "",
          delivery_state: params.state || "",
          notes: params.notes || "",
        };
        results.cards.push({ type: "rfq_draft", data: draft });
        const draftParam = encodeURIComponent(JSON.stringify(draft));
        results.actions.push({ label: "Review in Projects", path: `/projects?ai_draft=${draftParam}` });
        queryData = { type: "rfq_draft", draft };
      } else if (intent === "seller_attention") {
        // ONLY this seller's products and orders — filter by vendor_owner_id === user.id
        const [orders, products] = await Promise.all([
          base44.entities.Order.filter({ vendor_owner_id: user.id }, "-created_date", 20),
          base44.entities.Product.filter({ vendor_owner_id: user.id }, "-created_date", 50),
        ]);
        const needConfirm = (orders || []).filter((o: any) => ["payment_confirmed", "inventory_reserved"].includes(o.order_status));
        const lowStock = (products || []).filter((p: any) => p.quantity_available <= 5 && p.listing_status === "active");
        if (needConfirm.length) results.cards.push({ type: "seller_alert", data: { title: "Orders needing confirmation", count: needConfirm.length, items: needConfirm.slice(0, 3).map(sanitizeOrder) } });
        if (lowStock.length) results.cards.push({ type: "seller_alert", data: { title: "Low inventory alerts", count: lowStock.length, items: lowStock.slice(0, 3).map(sanitizeProduct) } });
        queryData = { orders_needing_confirmation: needConfirm.length, low_stock_count: lowStock.length, total_products: (products || []).length };
        results.actions.push({ label: "Go to Dashboard", path: "/vendor" });
      } else if (intent === "low_stock") {
        // ONLY this seller's products — filter by vendor_owner_id === user.id
        const products = await base44.entities.Product.filter({ vendor_owner_id: user.id }, "-created_date", 50);
        const low = (products || []).filter((p: any) => p.quantity_available <= 10 && p.listing_status === "active");
        queryData = { type: "products", count: low.length, items: low.map(sanitizeProduct) };
        results.cards = low.slice(0, 6).map((p: any) => ({ type: "product", data: sanitizeProduct(p) }));
        results.actions.push({ label: "Manage Inventory", path: "/vendor/inventory" });
      } else if (intent === "list_draft") {
        const draft = {
          common_name: params.species || params.name || "",
          category: params.category || "",
          unit_price: params.price || 0,
          physical_quantity: params.quantity || 0,
          container_size: params.container || params.size || "",
          bulk_price_tiers: params.tiers || [],
        };
        results.cards.push({ type: "listing_draft", data: draft });
        const draftParam = encodeURIComponent(JSON.stringify(draft));
        results.actions.push({ label: "Review in Inventory", path: `/vendor/inventory/new?ai_draft=${draftParam}` });
        queryData = { type: "listing_draft", draft };
      } else if (intent === "navigate") {
        const navMap: Record<string, string> = {
          marketplace: "/marketplace", home: "/", orders: "/orders", projects: "/projects",
          rfqs: "/projects", messages: "/messages", account: "/account", inventory: "/vendor/inventory",
          dashboard: "/vendor", settings: "/settings",
        };
        const target = Object.keys(navMap).find((k) => (params.destination || "").toLowerCase().includes(k));
        if (target) results.actions.push({ label: "Go to " + target, path: navMap[target] });
      }
    } catch (queryError: any) {
      results.queryError = queryError.message;
    }

    // Step 3: Post-query LLM explanation — summarize ONLY actual query results
    if (queryData && !["general", "navigate", "guided_help"].includes(intent)) {
      try {
        const explanation = await base44.integrations.Core.InvokeLLM({
          prompt: `You are explaining real TreEbay marketplace query results to a ${role} user.

STRICT RULES:
- You may ONLY describe what is explicitly in the JSON data below.
- Do NOT invent prices, quantities, vendor names, city names, or availability that are not in the data.
- Do NOT use knowledge from training data about plants or nurseries.
- If the data shows zero results, say "I couldn't find any matching results" and suggest creating an RFQ or adjusting the search.
- Keep it to 2-4 sentences.
- Reference actual product names, prices, and vendors from the data when helpful.

User asked: "${message}"
Intent: ${intent}

Actual query results (JSON — this is the ONLY source of truth):
${JSON.stringify(queryData).slice(0, 2500)}

Write your explanation:`,
        });
        if (explanation) reply = explanation;
      } catch {
        // Keep the classification reply if explanation fails
      }
    }

    return Response.json({ reply, intent, results, user: { id: user.id, role } });
  } catch (error: any) {
    return Response.json({ error: error.message, reply: "I'm having trouble connecting right now. You can still browse the marketplace, create RFQs, and manage orders normally." }, { status: 500 });
  }
}