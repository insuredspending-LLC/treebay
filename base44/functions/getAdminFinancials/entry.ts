import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Admin-only Tree Marketplace financials dashboard.
// Authoritative totals from TransactionLedgerEntry + Order + TaxCalculation + SystemException.
// Does NOT call gross fee revenue "profit" — uses "Tree Marketplace Fee Revenue".
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Admin only" }, { status: 403 });
    const svc = base44.asServiceRole;

    const allOrders = await svc.entities.Order.list("-created_date", 500);
    const allLedgerEntries = await svc.entities.TransactionLedgerEntry.list("-created_date", 1000);
    const exceptions = await svc.entities.SystemException.filter({ requires_admin: true }, "-created_date", 100);
    const feeRules = await svc.entities.MarketplaceFeeRule.filter({ active: true }, "-effective_date", 10);

    // Financial headline metrics are LIVE ONLY. Legacy orders without commerce_mode are
    // intentionally classified as test so simulated history can never masquerade as revenue.
    const orders = (allOrders || []).filter((o) => o.commerce_mode === "live");
    const testOrders = (allOrders || []).filter((o) => o.commerce_mode !== "live");
    const liveOrderIds = new Set(orders.map((o) => o.id));
    const ledgerEntries = (allLedgerEntries || []).filter((e) => liveOrderIds.has(e.order_id));

    // GMV = sum of LIVE paid order totals
    const paidOrders = orders.filter((o) => ["paid", "refunded", "partially_refunded", "disputed"].includes(o.payment_status));
    const gmv = paidOrders.reduce((s, o) => s + (o.total_cents || 0), 0);
    // Taxable marketplace sales from the immutable CheckoutQuote tax snapshot.
    let taxableMarketplaceSales = 0;
    for (const o of paidOrders) {
      if (!o.checkout_quote_id) continue;
      const cq = await svc.entities.CheckoutQuote.get(o.checkout_quote_id);
      if (cq) taxableMarketplaceSales += (cq.taxable_amount_cents ?? cq.merchandise_subtotal_cents ?? 0);
    }

    // Ledger breakdown
    const sumBy = (type, groupPrefix) => (ledgerEntries || [])
      .filter((e) => e.entry_type === type && (!groupPrefix || (e.transaction_id || "").startsWith(groupPrefix)))
      .reduce((s, e) => s + (e.debit_cents || 0) - (e.credit_cents || 0), 0);

    // Allocation credits (money payable TO parties)
    const vendorPayables = (ledgerEntries || []).filter((e) => e.entry_type === "merchandise" && (e.transaction_id || "").startsWith("alloc:")).reduce((s, e) => s + (e.credit_cents || 0), 0);
    const carrierPayables = (ledgerEntries || []).filter((e) => e.entry_type === "delivery" && e.party_type === "carrier" && (e.transaction_id || "").startsWith("alloc:")).reduce((s, e) => s + (e.credit_cents || 0), 0);
    const taxCollected = (ledgerEntries || []).filter((e) => e.entry_type === "tax" && (e.transaction_id || "").startsWith("alloc:")).reduce((s, e) => s + (e.credit_cents || 0), 0);
    const feeRevenue = (ledgerEntries || []).filter((e) => e.entry_type === "marketplace_fee" && (e.transaction_id || "").startsWith("alloc:")).reduce((s, e) => s + (e.credit_cents || 0), 0);

    // Settlement payouts (debit = money paid out)
    const settledVendorPayouts = (ledgerEntries || []).filter((e) => e.entry_type === "payout" && e.party_type === "vendor" && (e.transaction_id || "").startsWith("settle:")).reduce((s, e) => s + (e.debit_cents || 0), 0);
    const settledCarrierPayouts = (ledgerEntries || []).filter((e) => e.entry_type === "carrier_payable" && (e.transaction_id || "").startsWith("settle:")).reduce((s, e) => s + (e.debit_cents || 0), 0);

    // Refunds
    const refunds = (ledgerEntries || []).filter((e) => e.entry_type === "refund" && (e.transaction_id || "").startsWith("refund:")).reduce((s, e) => s + (e.credit_cents || 0), 0);

    // Unresolved financial exceptions
    const openExceptions = (exceptions || []).filter((e) => e.status !== "RESOLVED" && e.status !== "CLOSED");
    const financialExceptionTypes = ["financial_reconciliation", "settlement_failed", "freight_assignment_failed", "notification_delivery_failed", "refund_reconciliation", "inventory_reconciliation_failed", "checkout_lock_recovery_failed"];
    const financialExceptions = openExceptions.filter((e) => financialExceptionTypes.includes(e.exception_type));

    // Active fee policy
    const activeFeeRule = (feeRules || [])[0] || { rule_name: "dev_default", percentage_fee: 4, flat_fee_cents: 0, minimum_fee_cents: 0, maximum_fee_cents: 0, fee_payer: "buyer" };

    return Response.json({
      totals: {
        gmv_cents: gmv,
        paid_orders: paidOrders.length,
        total_orders: (orders || []).length,
        taxable_marketplace_sales_cents: taxableMarketplaceSales,
        vendor_payables_cents: vendorPayables,
        carrier_payables_cents: carrierPayables,
        sales_tax_collected_cents: taxCollected,
        treebay_fee_revenue_cents: feeRevenue,
        refunds_cents: refunds,
        settled_vendor_payouts_cents: settledVendorPayouts,
        settled_carrier_payouts_cents: settledCarrierPayouts,
        unresolved_financial_exceptions: financialExceptions.length,
        open_exceptions: openExceptions.length,
      },
      active_fee_policy: activeFeeRule,
      financial_exceptions: financialExceptions.map((e) => ({
        id: e.id, type: e.exception_type, severity: e.severity, status: e.status,
        order_id: e.order_id, reason: e.reason, created_date: e.created_date,
      })),
      test_summary: {
        orders: testOrders.length,
        paid_orders: testOrders.filter((o) => ["paid", "refunded", "partially_refunded", "disputed"].includes(o.payment_status)).length,
        simulated_gmv_cents: testOrders.filter((o) => ["paid", "refunded", "partially_refunded", "disputed"].includes(o.payment_status)).reduce((sum, o) => sum + (o.total_cents || 0), 0),
      },
      partial: (allOrders || []).length >= 500 || (allLedgerEntries || []).length >= 1000,
      records_scanned: { orders: (allOrders || []).length, ledger_entries: (allLedgerEntries || []).length },
      scope: "live_only", 
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
