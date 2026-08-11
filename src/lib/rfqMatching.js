// Deterministic RFQ-to-inventory matching — mirrors the rules in trebayAssistant.
// Never claim a match without actual Product records.
// Only matches against active, available inventory — never paused/archived/sold_out/zero-available.

const normalize = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const productText = (p) => normalize([p.common_name, p.botanical_name, p.cultivar, p.category, p.container_size, p.caliper].join(" "));

export function matchRfqItemToProduct(item, product) {
  const request = normalize([item.common_name, item.botanical_name, item.size_spec].join(" "));
  if (!request) return null;
  const inventory = productText(product);
  const nameMatch = [item.common_name, item.botanical_name].filter(Boolean).some((name) => {
    const n = normalize(name);
    return n && (inventory.includes(n) || n.includes(normalize(product.common_name)));
  });
  const specMatch = !item.size_spec || inventory.includes(normalize(item.size_spec));
  if (nameMatch && specMatch) {
    const requestedQty = Number(item.quantity) || 0;
    const availableQty = Number(product.quantity_available) || 0;
    return {
      matched: true,
      matchType: availableQty >= requestedQty ? "full" : "partial",
      requestedQty,
      availableQty,
      productId: product.id,
      productName: product.common_name,
    };
  }
  return null;
}

// Returns { results: [{ item, match }], hasAnyMatch }
export function matchRfqToInventory(rfq, products) {
  // Only match against active, available inventory
  const sellable = (products || []).filter((p) =>
    p.listing_status === "active" && (Number(p.quantity_available) || 0) > 0
  );
  const results = (rfq.items || []).map((item) => {
    let bestMatch = null;
    for (const product of sellable) {
      const m = matchRfqItemToProduct(item, product);
      if (m && (!bestMatch || m.matchType === "full")) {
        bestMatch = m;
        if (m.matchType === "full") break;
      }
    }
    return { item, match: bestMatch };
  });
  return { results, hasAnyMatch: results.some((r) => r.match) };
}