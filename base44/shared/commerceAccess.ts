// Server-side access control for simulated commerce.
// Public users never receive a simulated-paid fallback. Only administrators and
// explicitly approved Google Play testers with current consent may use it.

const APPROVED_TESTER_STATUSES = new Set(["invited", "opted_in", "active"]);

function normalizedEmail(user) {
  return String(user?.email || "").trim().toLowerCase();
}

export async function canUseInternalSimulator(svc, user) {
  if (!user) return false;
  if (user.role === "admin") return true;
  const email = normalizedEmail(user);
  if (!email) return false;
  const rows = await svc.entities.TesterSignup.filter({ play_email: email }, "-updated_date", 20);
  return (rows || []).some((row) =>
    row.consent_to_testing === true && APPROVED_TESTER_STATUSES.has(row.status)
  );
}

export async function requireInternalSimulatorAccess(svc, user) {
  if (!(await canUseInternalSimulator(svc, user))) {
    const error = new Error("Simulated purchases are restricted to approved closed-test participants.");
    error.status = 403;
    throw error;
  }
  return true;
}
