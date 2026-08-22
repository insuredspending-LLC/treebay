import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Vendor financials — authoritative data from CheckoutQuote + TransactionLedgerEntry.
// Returns: gross sales, tax collected, delivery revenue, net settled proceeds, refunds.
// Period summaries: this month, previous month, year to date.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const svc = base44.asServiceRole;
    const activeFeeRules = await svc.entities.MarketplaceFeeRule.filter({ active: true }, "-effective_date", 1);
    const activeFeeRule = (activeFeeRules || [])[0] || {
      percentage_fee: 4,
      fee_payer: "vendor",
    };

    const vendors = await svc.entities.VendorProfile.filter({ owner_id: user.id });
    if (!vendors || !vendors.length) return Response.json({ vendors: [] });

    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    const lastMonthIdx = thisMonth === 0 ? 11 : thisMonth - 1;
    const lastMonthYear = thisMonth === 0 ? thisYear - 1 : thisYear;

    const vendorResults = [];
    for (const vendor of vendors) {
      const allOrders = await svc.entities.Order.filter({ vendor_id: vendor.id }, "-created_date", 200);
      const allLedgerEntries = await svc.entities.TransactionLedgerEntry.filter({ party_type: "vendor", party_id: vendor.id }, "-created_date", 500);
      const orders = (allOrders || []).filter((o) => o.commerce_mode === "live");
      const testOrders = (allOrders || []).filter((o) => o.commerce_mode === "test");
      const disabledOrders = (allOrders || []).filter((o) => o.commerce_mode !== "live" && o.commerce_mode !== "test");
      const liveOrderIds = new Set(orders.map((o) => o.id));
      const ledgerEntries = (allLedgerEntries || []).filter((e) => liveOrderIds.has(e.order_id));

      // Get CheckoutQuotes for LIVE paid/refunded orders
      const paidOrders = orders.filter((o) => ["paid", "refunded", "partially_refunded"].includes(o.payment_status));
      const quotes = [];
      for (const o of paidOrders) {
        if (o.checkout_quote_id) {
          const cq = await svc.entities.CheckoutQuote.get(o.checkout_quote_id);
          if (cq) quotes.push({ ...cq, _order_date: o.created_date, _order_status: o.order_status });
        }
      }

      // Totals from CheckoutQuotes (authoritative pricing snapshot)
      const grossMerchSales = quotes.reduce((s, cq) => s + (cq.merchandise_subtotal_cents || 0), 0);
      const taxCollected = quotes.reduce((s, cq) => s + (cq.tax_amount_cents || 0), 0);
      const vendorDeliveryRevenue = quotes.filter((cq) => cq.delivery_method === "vendor_delivery").reduce((s, cq) => s + (cq.delivery_amount_cents || 0), 0);
      const marketplaceFee = quotes.reduce((s, cq) => s + (cq.marketplace_fee_cents || 0), 0);
      const feePayers = new Set(quotes.map((cq) => cq.fee_payer || "buyer"));
      const feePayer = feePayers.size <= 1
        ? ([...feePayers][0] || activeFeeRule.fee_payer || "vendor")
        : "mixed";
      const vendorFeeDeduction = quotes.reduce((sum, cq) => {
        const payer = cq.fee_payer || "buyer";
        const fee = cq.marketplace_fee_cents || 0;
        return sum + (payer === "vendor" ? fee : payer === "split" ? Math.round(fee / 2) : 0);
      }, 0);

      // Settlement entries (vendor payout)
      const settlementEntries = (ledgerEntries || []).filter((e) => e.entry_type === "payout" && (e.transaction_id || "").startsWith("settle:"));
      const netSettledProceeds = settlementEntries.reduce((s, e) => s + (e.debit_cents || 0), 0);

      // Refund reversal entries
      const refundReversals = (ledgerEntries || []).filter((e) => e.entry_type === "adjustment" && (e.transaction_id || "").startsWith("refund:"));
      const refunds = refundReversals.reduce((s, e) => s + (e.debit_cents || 0), 0);

      // Period summaries
      const inMonth = (dateStr, month, year) => { const d = new Date(dateStr); return d.getMonth() === month && d.getFullYear() === year; };
      const thisMonthQuotes = quotes.filter((cq) => inMonth(cq._order_date, thisMonth, thisYear));
      const lastMonthQuotes = quotes.filter((cq) => inMonth(cq._order_date, lastMonthIdx, lastMonthYear));
      const ytdQuotes = quotes.filter((cq) => { const d = new Date(cq._order_date); return d.getFullYear() === thisYear; });

      vendorResults.push({
        vendor,
        totals: {
          gross_merchandise_sales_cents: grossMerchSales,
          taxable_marketplace_sales_cents: quotes.reduce((sum, cq) => sum + (cq.taxable_amount_cents ?? cq.merchandise_subtotal_cents ?? 0), 0),
          tax_collected_cents: taxCollected,
          tax_not_in_payout: taxCollected,
          vendor_delivery_revenue_cents: vendorDeliveryRevenue,
          marketplace_fee_cents: marketplaceFee,
          fee_payer: feePayer,
          vendor_fee_deduction_cents: vendorFeeDeduction,
          current_commission_rate_percent: activeFeeRule.percentage_fee ?? 4,
          current_fee_payer: activeFeeRule.fee_payer || "vendor",
          refunds_cents: refunds,
          net_settled_proceeds_cents: netSettledProceeds,
          total_orders: orders.length,
          paid_orders: paidOrders.length,
          test_orders_excluded: testOrders.length,
          test_simulated_gmv_cents: testOrders.reduce((sum, o) => sum + (o.total_cents || 0), 0),
          disabled_orders_excluded: disabledOrders.length,
        },
        periods: {
          this_month: {
            gross_sales_cents: thisMonthQuotes.reduce((s, cq) => s + (cq.merchandise_subtotal_cents || 0), 0),
            taxable_sales_cents: thisMonthQuotes.reduce((s, cq) => s + (cq.taxable_amount_cents ?? cq.merchandise_subtotal_cents ?? 0), 0),
            tax_collected_cents: thisMonthQuotes.reduce((s, cq) => s + (cq.tax_amount_cents || 0), 0),
            order_count: thisMonthQuotes.length,
          },
          previous_month: {
            gross_sales_cents: lastMonthQuotes.reduce((s, cq) => s + (cq.merchandise_subtotal_cents || 0), 0),
            taxable_sales_cents: lastMonthQuotes.reduce((s, cq) => s + (cq.taxable_amount_cents ?? cq.merchandise_subtotal_cents ?? 0), 0),
            tax_collected_cents: lastMonthQuotes.reduce((s, cq) => s + (cq.tax_amount_cents || 0), 0),
            order_count: lastMonthQuotes.length,
          },
          year_to_date: {
            gross_sales_cents: ytdQuotes.reduce((s, cq) => s + (cq.merchandise_subtotal_cents || 0), 0),
            taxable_sales_cents: ytdQuotes.reduce((s, cq) => s + (cq.taxable_amount_cents ?? cq.merchandise_subtotal_cents ?? 0), 0),
            tax_collected_cents: ytdQuotes.reduce((s, cq) => s + (cq.tax_amount_cents || 0), 0),
            order_count: ytdQuotes.length,
          },
        },
        _all_orders_scanned: (allOrders || []).length,
        _all_ledger_records_scanned: (allLedgerEntries || []).length,
        recent_orders: orders.slice(0, 20).map((o) => ({
          order_number: o.order_number, order_status: o.order_status, payment_status: o.payment_status,
          total_cents: o.total_cents, created_date: o.created_date,
        })),
      });
    }

    const totalRecords = vendorResults.reduce((s, v) => s + (v._all_orders_scanned || 0), 0);
    const partial = vendorResults.some((v) => (v._all_orders_scanned || 0) >= 200 || (v._all_ledger_records_scanned || 0) >= 500);
    return Response.json({ vendors: vendorResults.map(({ _all_orders_scanned, _all_ledger_records_scanned, ...v }) => v), partial, records_scanned: totalRecords, scope: "live_only" });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}