import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Carrier financials — authoritative data from FreightQuote + TransactionLedgerEntry.
// Returns: gross freight earnings, settled/pending earnings, per-load breakdown.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const svc = base44.asServiceRole;

    const carriers = await svc.entities.CarrierProfile.filter({ created_by_id: user.id });
    const carrier = (carriers || [])[0];
    if (!carrier) return Response.json({ error: "No carrier profile found" }, { status: 404 });

    const freightQuotes = await svc.entities.FreightQuote.filter({ carrier_id: carrier.id }, "-created_date", 200);
    const ledgerEntries = await svc.entities.TransactionLedgerEntry.filter({ party_type: "carrier", party_id: carrier.id }, "-created_date", 500);
    const shipments = await svc.entities.Shipment.filter({ carrier_id: carrier.id }, "-created_date", 100);

    const grossFreightEarnings = (freightQuotes || []).reduce((s, fq) => s + (fq.carrier_pay_cents || 0), 0);
    const settlementEntries = (ledgerEntries || []).filter((e) => e.entry_type === "carrier_payable" && (e.transaction_id || "").startsWith("settle:"));
    const settledEarnings = settlementEntries.reduce((s, e) => s + (e.debit_cents || 0), 0);
    const pendingEarnings = grossFreightEarnings - settledEarnings;

    // Per-load breakdown
    const loads = (freightQuotes || []).map((fq) => {
      const shipment = (shipments || []).find((s) => s.freight_quote_id === fq.id);
      const settled = settlementEntries.some((e) => e.order_id === fq.order_id);
      return {
        quote_reference: fq.quote_reference,
        order_id: fq.order_id,
        carrier_pay_cents: fq.carrier_pay_cents,
        linehaul_cents: fq.linehaul_cents,
        fuel_surcharge_cents: fq.fuel_surcharge_cents,
        accessorial_cents: fq.accessorial_cents,
        status: fq.status,
        shipment_status: shipment?.shipment_status || null,
        pickup_location: shipment?.pickup_location || null,
        delivery_location: shipment?.delivery_location || null,
        settled,
      };
    });

    return Response.json({
      carrier,
      totals: {
        gross_freight_earnings_cents: grossFreightEarnings,
        settled_earnings_cents: settledEarnings,
        pending_earnings_cents: pendingEarnings,
        total_loads: (freightQuotes || []).length,
        settled_loads: settlementEntries.length,
      },
      loads,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}