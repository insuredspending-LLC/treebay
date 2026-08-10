// TreEbay transaction document generation — print-friendly HTML stored in TransactionDocument.
// All documents in TEST MODE prominently state: TEST TRANSACTION — NO REAL PAYMENT.
import { fromCents } from "./transactions.ts";

function money(cents) {
  return "$" + (Math.round(cents || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dateStr(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt)) return "—";
  return dt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function baseHtml(title, subtitle, isTest, body) {
  const testBanner = isTest
    ? `<div style="background:#fef3c7;border:2px solid #f59e0b;color:#92400e;padding:8px 16px;border-radius:6px;text-align:center;font-weight:700;margin-bottom:16px;">TEST TRANSACTION — NO REAL PAYMENT</div>`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
  <style>
    body{font-family:Inter,Arial,sans-serif;color:#1e293b;max-width:680px;margin:0 auto;padding:32px;}
    h1{font-size:22px;margin:0;color:#1f4d2f;}
    .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1f4d2f;padding-bottom:12px;margin-bottom:16px;}
    .brand{font-size:18px;font-weight:800;color:#1f4d2f;}
    .tagline{font-size:10px;color:#64748b;letter-spacing:1px;}
    table{width:100%;border-collapse:collapse;margin:12px 0;}
    th{text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e2e8f0;padding:6px 8px;}
    td{padding:8px;border-bottom:1px solid #f1f5f9;font-size:13px;}
    .total-row{font-weight:700;font-size:15px;border-top:2px solid #1f4d2f;}
    .muted{color:#64748b;font-size:12px;}
    .section{margin:12px 0;padding:12px;background:#f8fafc;border-radius:6px;}
    .label{font-size:11px;text-transform:uppercase;color:#64748b;font-weight:600;}
    .value{font-size:13px;margin-top:2px;}
    @media print{body{padding:0;max-width:none;}}
  </style></head><body>
  <div class="header">
    <div><div class="brand">TreEbay</div><div class="tagline">THE LANDSCAPE SUPPLY MARKETPLACE</div></div>
    <div style="text-align:right;"><h1>${title}</h1><div class="muted">${subtitle}</div></div>
  </div>
  ${testBanner}
  ${body}
  <p class="muted" style="margin-top:32px;border-top:1px solid #e2e8f0;padding-top:8px;">Generated ${dateStr(new Date())} · TreEbay Marketplace</p>
  </body></html>`;
}

function itemsTable(items) {
  const rows = (items || []).map((i) => `<tr><td>${i.line_name || ""}</td><td style="text-align:center;">${i.quantity || ""}</td><td style="text-align:right;">${money(i.unit_price_cents || (i.unit_price ? i.unit_price * 100 : 0))}</td><td style="text-align:right;">${money(i.subtotal_cents || (i.subtotal ? i.subtotal * 100 : 0))}</td></tr>`).join("");
  return `<table><thead><tr><th>Item</th><th style="text-align:center;">Qty</th><th style="text-align:right;">Unit Price</th><th style="text-align:right;">Subtotal</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function totalsBlock(cq) {
  return `<table>
    <tr><td class="muted">Merchandise</td><td style="text-align:right;">${money(cq.merchandise_subtotal_cents)}</td></tr>
    ${cq.delivery_amount_cents ? `<tr><td class="muted">Delivery (${(cq.delivery_method || "").replace(/_/g, " ")})</td><td style="text-align:right;">${money(cq.delivery_amount_cents)}</td></tr>` : ""}
    <tr><td class="muted">TreEbay Marketplace Fee</td><td style="text-align:right;">${money(cq.marketplace_fee_cents)}</td></tr>
    <tr><td class="muted">Sales Tax (TEST/ESTIMATED)</td><td style="text-align:right;">${money(cq.tax_amount_cents)}</td></tr>
    <tr class="total-row"><td>Total</td><td style="text-align:right;">${money(cq.total_amount_cents)}</td></tr>
  </table>`;
}

function addressBlock(label, name, street, city, state, zip, instructions) {
  const lines = [name, street, [city, state, zip].filter(Boolean).join(", ")].filter(Boolean).join("<br>");
  return `<div class="section"><div class="label">${label}</div><div class="value">${lines || "—"}</div>${instructions ? `<div class="muted" style="margin-top:4px;">Instructions: ${instructions}</div>` : ""}</div>`;
}

export function generateOrderConfirmation(order, cq, vendor) {
  return baseHtml("Order Confirmation", order.order_number, true,
    `<div class="section"><div class="label">Order Date</div><div class="value">${dateStr(order.created_date)}</div></div>
    <div class="section"><div class="label">Seller</div><div class="value">${vendor?.business_name || order.vendor_name || "—"}<br><span class="muted">${[vendor?.city, vendor?.state].filter(Boolean).join(", ") || ""}</span></div></div>
    ${itemsTable(cq?.items || order.items)}
    ${cq ? totalsBlock(cq) : ""}
    ${cq ? addressBlock("Delivery Destination", cq.destination_name, cq.destination_street, cq.destination_city, cq.destination_state, cq.destination_zip, cq.delivery_instructions) : ""}`);
}

export function generateInvoice(order, cq, vendor) {
  return baseHtml("Invoice", order.order_number, true,
    `<div class="section"><div class="label">Invoice Date</div><div class="value">${dateStr(new Date())}</div></div>
    <div class="section"><div class="label">Billed From</div><div class="value">${vendor?.business_name || order.vendor_name || "—"}</div></div>
    ${itemsTable(cq?.items || order.items)}
    ${cq ? totalsBlock(cq) : ""}`);
}

export function generateReceipt(order, cq, vendor, payment) {
  return baseHtml("Payment Receipt", order.order_number, true,
    `<div class="section"><div class="label">Payment Date</div><div class="value">${dateStr(payment?.paid_at || new Date())}</div>
    <div class="label" style="margin-top:6px;">Transaction Reference</div><div class="value">${payment?.transaction_ref || payment?.provider_payment_id || "TEST"}</div></div>
    <div class="section"><div class="label">Seller</div><div class="value">${vendor?.business_name || order.vendor_name || "—"}</div></div>
    ${itemsTable(cq?.items || order.items)}
    ${cq ? totalsBlock(cq) : ""}`);
}

export function generatePurchaseOrder(order, cq, buyer) {
  return baseHtml("Purchase Order", order.order_number, true,
    `<div class="section"><div class="label">PO Date</div><div class="value">${dateStr(order.created_date)}</div></div>
    <div class="section"><div class="label">Bill To</div><div class="value">${buyer?.full_name || buyer?.email || "—"}</div></div>
    ${itemsTable(cq?.items || order.items)}
    ${cq ? totalsBlock(cq) : ""}`);
}

export function generateSettlementStatement(order, cq, vendor) {
  // TEST MODE fee model: the BUYER pays the TreEbay marketplace fee, so it is NOT
  // deducted from vendor proceeds. Only a vendor-borne fee portion is withheld.
  const feePayer = cq?.fee_payer || "buyer";
  const fee = cq?.marketplace_fee_cents || 0;
  const vendorFee = feePayer === "vendor" ? fee : feePayer === "split" ? fee - Math.round(fee / 2) : 0;
  const vendorDelivery = cq?.delivery_method === "vendor_delivery" ? (cq?.delivery_amount_cents || 0) : 0;
  const vendorPayable = (cq?.merchandise_subtotal_cents || 0) - vendorFee + vendorDelivery;
  return baseHtml("Settlement Statement", order.order_number, true,
    `<div class="section"><div class="label">Settlement Date</div><div class="value">${dateStr(new Date())}</div></div>
    <div class="section"><div class="label">Vendor</div><div class="value">${vendor?.business_name || order.vendor_name || "—"}</div></div>
    <table>
      <tr><td class="muted">Merchandise Subtotal</td><td style="text-align:right;">${money(cq?.merchandise_subtotal_cents || 0)}</td></tr>
      ${vendorFee ? `<tr><td class="muted">Less TreEbay Marketplace Fee (vendor portion)</td><td style="text-align:right;">-${money(vendorFee)}</td></tr>` : `<tr><td class="muted">TreEbay Marketplace Fee</td><td style="text-align:right;">Paid by buyer — not deducted</td></tr>`}
      ${vendorDelivery ? `<tr><td class="muted">Vendor Delivery</td><td style="text-align:right;">${money(vendorDelivery)}</td></tr>` : ""}
      <tr class="total-row"><td>Net Vendor Payable</td><td style="text-align:right;">${money(vendorPayable)}</td></tr>
    </table>
    <p class="muted">This is a TEST settlement statement. No real payout has been processed.</p>`);
}

export function generateRefundStatement(order, cq, extra) {
  const amount = extra?.refundAmountCents || order.total_cents || 0;
  return baseHtml("Refund Statement", order.order_number, true,
    `<div class="section"><div class="label">Refund Date</div><div class="value">${dateStr(new Date())}</div>
    <div class="label" style="margin-top:6px;">Reason</div><div class="value">${extra?.refundReason || "Buyer refund request"}</div>
    <div class="label" style="margin-top:6px;">Original Transaction Reference</div><div class="value">${extra?.payment?.transaction_ref || "TEST"}</div></div>
    <table>
      <tr><td class="muted">Original Order Total</td><td style="text-align:right;">${money(order.total_cents || 0)}</td></tr>
      <tr class="total-row"><td>Refunded to Buyer</td><td style="text-align:right;">${money(amount)}</td></tr>
    </table>
    ${cq ? totalsBlock(cq) : ""}
    <p class="muted">TEST REFUND — no real money has been returned. Original ledger entries are preserved; this refund is recorded as explicit reversal entries.</p>`);
}

export function generateDeliveryManifest(order, cq, shipment, vendor) {
  return baseHtml("Delivery Manifest", order.order_number, true,
    `<div class="section"><div class="label">Delivery Method</div><div class="value">${(cq?.delivery_method || order.fulfillment_method || "").replace(/_/g, " ")}</div></div>
    ${addressBlock("Pickup Location", vendor?.business_name, vendor?.address, vendor?.city, vendor?.state, vendor?.zip_code, null)}
    ${addressBlock("Delivery Destination", cq?.destination_name, cq?.destination_street, cq?.destination_city, cq?.destination_state, cq?.destination_zip, cq?.delivery_instructions)}
    ${itemsTable(cq?.items || order.items)}
    ${shipment ? `<div class="section"><div class="label">Shipment Status</div><div class="value">${shipment.shipment_status}</div></div>` : ""}
    <p class="muted">TEST DELIVERY — CARRIER NOT ACTUALLY BOOKED. This manifest is for planning purposes only.</p>`);
}

// Generate and store a document. Returns the TransactionDocument record.
export async function generateAndStoreDocument(svc, order, documentType, cq, extra) {
  const vendor = await svc.entities.VendorProfile.get(order.vendor_id);
  const buyer = await svc.entities.User.get(order.buyer_id).catch(() => null);
  let html = "";
  let recipientType = "buyer";
  let shipment = extra?.shipment;
  let payment = extra?.payment;
  switch (documentType) {
    case "buyer_order_confirmation":
      html = generateOrderConfirmation(order, cq, vendor); recipientType = "buyer"; break;
    case "buyer_invoice":
      html = generateInvoice(order, cq, vendor); recipientType = "buyer"; break;
    case "buyer_receipt":
      html = generateReceipt(order, cq, vendor, payment); recipientType = "buyer"; break;
    case "vendor_purchase_order":
      html = generatePurchaseOrder(order, cq, buyer); recipientType = "vendor"; break;
    case "vendor_settlement_statement":
      html = generateSettlementStatement(order, cq, vendor); recipientType = "vendor"; break;
    case "delivery_manifest":
      html = generateDeliveryManifest(order, cq, shipment, vendor); recipientType = "vendor"; break;
    case "refund_statement":
      html = generateRefundStatement(order, cq, extra); recipientType = "buyer"; break;
    default: return null;
  }
  // Idempotency: don't duplicate the same document type for the same order.
  const existing = await svc.entities.TransactionDocument.filter({ order_id: order.id, document_type: documentType });
  if (existing && existing.length) {
    const doc = existing[0];
    await svc.entities.TransactionDocument.update(doc.id, { html_content: html, version: (doc.version || 1) + 1 });
    return await svc.entities.TransactionDocument.get(doc.id);
  }
  return svc.entities.TransactionDocument.create({
    order_id: order.id, shipment_id: shipment?.id || null,
    document_type: documentType, html_content: html, version: 1, recipient_type: recipientType,
  });
}