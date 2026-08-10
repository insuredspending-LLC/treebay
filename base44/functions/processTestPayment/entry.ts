import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// DEPRECATED: This function has been consolidated into runTransactionMaintenance.
// All payment processing is handled by confirmTestPayment. This stub remains
// for backward compatibility but performs no action.
export default async function(req) {
  return Response.json({ deprecated: true, message: "Use confirmTestPayment instead. This function is a no-op." });
}