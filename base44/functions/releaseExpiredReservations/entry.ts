import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// DEPRECATED: This function has been consolidated into runTransactionMaintenance.
// All reservation release logic runs via the single Transaction Maintenance workflow.
export default async function(req) {
  return Response.json({ deprecated: true, message: "Use runTransactionMaintenance instead. This function is a no-op." });
}