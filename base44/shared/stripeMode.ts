// Explicit Stripe environment routing. Never fall back from sandbox to live credentials.
export function readStripeEnv(name) {
  try { if (typeof Deno !== "undefined" && Deno.env) return Deno.env.get(name); } catch {}
  try { return process.env[name]; } catch {}
  return undefined;
}
export function isStripeCommerceMode(mode) { return mode === "live" || mode === "stripe_test"; }
export function stripeKeyForMode(mode) {
  if (!isStripeCommerceMode(mode)) throw new Error("Unsupported Stripe commerce mode.");
  const legacy = String(readStripeEnv("STRIPE_SECRET_KEY") || "");
  const key = mode === "stripe_test"
    ? String(readStripeEnv("STRIPE_TEST_SECRET_KEY") || (/^(sk|rk)_test_/.test(legacy) ? legacy : ""))
    : legacy;
  const prefix = mode === "stripe_test" ? /^(sk|rk)_test_/ : /^(sk|rk)_live_/;
  if (!prefix.test(key)) throw new Error(mode === "stripe_test"
    ? "Stripe sandbox requires STRIPE_TEST_SECRET_KEY containing a test secret key."
    : "Live Stripe requires the production secret key.");
  return key;
}
export function stripeSandboxEnabled() {
  if (String(readStripeEnv("TREE_MARKETPLACE_STRIPE_SANDBOX") || "").toLowerCase() !== "enabled") return false;
  try { stripeKeyForMode("stripe_test"); return true; } catch { return false; }
}
export function stripeModeFromObject(object) {
  if (typeof object?.livemode !== "boolean") throw new Error("Stripe object has no explicit environment.");
  return object.livemode ? "live" : "stripe_test";
}
export function assertStripeObjectMode(object, mode) {
  if (!isStripeCommerceMode(mode) || stripeModeFromObject(object) !== mode) throw new Error("Stripe environment does not match this transaction.");
}
export function assertStripeOrderMode(order, mode) {
  if (!isStripeCommerceMode(mode) || order?.commerce_mode !== mode) throw new Error("Stripe event cannot modify an order from another environment.");
}
export function vendorStripeField(field, mode = "live") {
  if (!isStripeCommerceMode(mode)) throw new Error("Unsupported seller Stripe environment.");
  return mode === "stripe_test" ? field.replace(/^stripe_/, "stripe_test_") : field;
}
export function vendorStripeAccountId(vendor, mode = "live") {
  return vendor?.[vendorStripeField("stripe_account_id", mode)];
}
export function sandboxReadiness() {
  let keyReady = false;
  try { stripeKeyForMode("stripe_test"); keyReady = true; } catch {}
  const enabled = String(readStripeEnv("TREE_MARKETPLACE_STRIPE_SANDBOX") || "").toLowerCase() === "enabled";
  const webhookReady = Boolean(stripeWebhookSecret("stripe_test"));
  return { key_ready: keyReady, sandbox_enabled: enabled, webhook_ready: webhookReady,
    ready: keyReady && enabled && webhookReady };
}
export function stripeWebhookSecret(mode) {
  if (mode === "stripe_test") {
    const dedicated = readStripeEnv("STRIPE_TEST_WEBHOOK_SECRET");
    if (dedicated) return dedicated;
    if (/^(sk|rk)_test_/.test(String(readStripeEnv("STRIPE_SECRET_KEY") || ""))) return readStripeEnv("STRIPE_WEBHOOK_SECRET");
    return undefined;
  }
  return mode === "live" ? readStripeEnv("STRIPE_WEBHOOK_SECRET") : undefined;
}
