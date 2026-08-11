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

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { message, context } = body;
    if (!message) return Response.json({ error: "Message is required" }, { status: 400 });

    const role = context?.role || "buyer";
    const page = context?.page || "unknown";

    // Step 1: Classify intent via LLM
    const classification = await base44.integrations.Core.InvokeLLM({
      prompt: `${SYSTEM_PROMPT}\n\nUser role: ${role}\nCurrent page: ${page}\n\nUser message: "${message}"\n\nClassify the intent, extract relevant params (quantity, species, size, location, category, etc.), and write a helpful reply. If you will look up real data, mention that in the reply.`,
      response_json_schema: INTENT_SCHEMA,
    });

    const intent = classification.intent || "general";
    const params = classification.params || {};
    const reply = classification.reply || "I'm here to help you find plants, compare suppliers, and manage your TreEbay activity.";

    // Step 2: Perform read-only queries based on intent
    const results = { cards: [], actions: [] };

    try {
      if (intent === "search_inventory") {
        const products = await base44.entities.Product.filter({ listing_status: "active" }, "-created_date", 50);
        let list = products || [];
        const term = (params.species || params.name || params.keyword || "").toString().toLowerCase().trim();
        const cat = params.category || "";
        const minQty = Number(params.quantity) || 0;
        if (term) list = list.filter((p) => [p.common_name, p.botanical_name, p.cultivar, p.category].filter(Boolean).join(" ").toLowerCase().includes(term));
        if (cat) list = list.filter((p) => p.category === cat);
        if (minQty > 0) list = list.filter((p) => p.quantity_available >= minQty);
        list = list.slice(0, 6);
        results.cards = list.map((p) => ({ type: "product", data: p }));
        if (list.length === 0) {
          results.actions.push({ label: "Create an RFQ", path: "/projects" });
          results.actions.push({ label: "Browse Marketplace", path: "/marketplace" });
        } else {
          results.actions.push({ label: "View in Marketplace", path: "/marketplace" });
        }
      } else if (intent === "find_growers") {
        const vendors = await base44.entities.VendorProfile.filter({ verification_status: "verified" }, "-rating", 20);
        const list = (vendors || []).slice(0, 6);
        results.cards = list.map((v) => ({ type: "vendor", data: v }));
        results.actions.push({ label: "Browse Marketplace", path: "/marketplace" });
      } else if (intent === "explain_order") {
        const orders = await base44.entities.Order.list("-created_date", 10);
        const list = (orders || []).slice(0, 5);
        results.cards = list.map((o) => ({ type: "order", data: o }));
        results.actions.push({ label: "View All Orders", path: "/orders" });
      } else if (intent === "explain_rfq") {
        const rfqs = await base44.entities.RFQ.list("-created_date", 10);
        const list = (rfqs || []).slice(0, 5);
        results.cards = list.map((r) => ({ type: "rfq", data: r }));
        results.actions.push({ label: "View Projects & RFQs", path: "/projects" });
      } else if (intent === "build_rfq_draft") {
        const draft = {
          items: params.items || (params.species ? [{ common_name: params.species, quantity: params.quantity || 1, size_spec: params.size || "" }] : []),
          delivery_city: params.location || params.city || "",
          delivery_state: params.state || "",
          notes: params.notes || "",
        };
        results.cards.push({ type: "rfq_draft", data: draft });
        results.actions.push({ label: "Go to Projects to Create RFQ", path: "/projects" });
      } else if (intent === "seller_attention") {
        const [orders, rfqs, products] = await Promise.all([
          base44.entities.Order.list("-created_date", 20),
          base44.entities.RFQ.list("-created_date", 20),
          base44.entities.Product.list("-created_date", 50),
        ]);
        const needConfirm = (orders || []).filter((o) => ["payment_confirmed", "inventory_reserved"].includes(o.order_status));
        const lowStock = (products || []).filter((p) => p.quantity_available <= 5 && p.listing_status === "active");
        if (needConfirm.length) results.cards.push({ type: "seller_alert", data: { title: "Orders needing confirmation", count: needConfirm.length, items: needConfirm.slice(0, 3) } });
        if (lowStock.length) results.cards.push({ type: "seller_alert", data: { title: "Low inventory alerts", count: lowStock.length, items: lowStock.slice(0, 3) } });
        results.actions.push({ label: "Go to Dashboard", path: "/vendor" });
      } else if (intent === "low_stock") {
        const products = await base44.entities.Product.list("-created_date", 50);
        const low = (products || []).filter((p) => p.quantity_available <= 10 && p.listing_status === "active");
        results.cards = low.slice(0, 6).map((p) => ({ type: "product", data: p }));
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
        results.actions.push({ label: "Go to Inventory to Add Listing", path: "/vendor/inventory" });
      } else if (intent === "navigate") {
        const navMap = {
          marketplace: "/marketplace", home: "/", orders: "/orders", projects: "/projects",
          rfqs: "/projects", messages: "/messages", account: "/account", inventory: "/vendor/inventory",
          dashboard: "/vendor", settings: "/settings",
        };
        const target = Object.keys(navMap).find((k) => (params.destination || "").toLowerCase().includes(k));
        if (target) results.actions.push({ label: "Go to " + target, path: navMap[target] });
      }
    } catch (queryError) {
      // Queries may fail due to RLS or empty data — the reply still stands.
      results.queryError = queryError.message;
    }

    return Response.json({ reply, intent, results, user: { id: user.id, role } });
  } catch (error) {
    return Response.json({ error: error.message, reply: "I'm having trouble connecting right now. You can still browse the marketplace, create RFQs, and manage orders normally." }, { status: 500 });
  }
}