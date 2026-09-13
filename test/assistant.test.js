import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["base44/functions/trebayAssistant/entry.ts"],
  bundle: true, write: false, platform: "node", format: "esm",
  plugins: [{ name: "test-sdk", setup(b) {
    b.onResolve({ filter: /^npm:@base44\/sdk/ }, () => ({ path: "sdk", namespace: "test-sdk" }));
    b.onLoad({ filter: /.*/, namespace: "test-sdk" }, () => ({ contents:
      "export const createClientFromRequest = (req) => globalThis.__assistantClient(req);" }));
  } }],
});
const { default: handler } = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64"));

function fixture(t, { profiles = [], llm, auth, profileQuery, serviceError, clientError } = {}) {
  const logs = [], calls = [];
  t.mock.method(console, "info", (line) => logs.push(JSON.parse(line)));
  t.mock.method(console, "error", (line) => logs.push(JSON.parse(line)));
  const client = {
    auth: { me: auth || (async () => ({ id: "test-user" })) },
    get asServiceRole() {
      if (serviceError) throw serviceError;
      return { entities: { VendorProfile: { filter: profileQuery || (async () => profiles) }, Product: { filter: async () => [] } } };
    },
    integrations: { Core: { InvokeLLM: async (args) => {
      calls.push(args);
      return llm ? llm(args, calls.length) : { intent: "general", params: {}, reply: "How can I help?" };
    } } },
  };
  globalThis.__assistantClient = () => { if (clientError) throw clientError; return client; };
  t.after(() => { delete globalThis.__assistantClient; });
  return { logs, calls };
}
const request = (body = { message: "Hello", history: [], context: { page: "/marketplace" } }) =>
  new Request("https://example.test/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("successful buyer response survives serialization (undefined seller flag regression)", async (t) => {
  const { logs, calls } = fixture(t);
  const res = await handler(request());
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.reply, "How can I help?");
  assert.equal(body.user.isVerifiedSeller, false);
  assert.equal(calls.length, 1);
  assert.equal(logs.at(-1).outcome, "success");
  assert.equal(logs.at(-1).requestId, body.requestId);
});
test("verified seller flag comes from persisted profiles", async (t) => {
  fixture(t, { profiles: [{ verification_status: "verified", selling_status: "active" }] });
  const res = await handler(request());
  assert.equal(res.status, 200);
  assert.equal((await res.json()).user.isVerifiedSeller, true);
});
test("inventory request completes both provider calls and serialization", async (t) => {
  const { calls } = fixture(t, { llm: (_args, count) => count === 1 ? { intent: "search_inventory", params: {} } : "No matching results were found." });
  const res = await handler(request());
  assert.equal(res.status, 200);
  assert.equal((await res.json()).reply, "No matching results were found.");
  assert.equal(calls.length, 2);
});
for (const [label, options, status, code, stage] of [
  ["missing user", { auth: async () => null }, 401, "AUTH_REQUIRED", "authentication"],
  ["expired token", { auth: async () => { throw Object.assign(new Error("private-token"), { status: 401 }); } }, 401, "AUTH_REQUIRED", "authentication"],
  ["forbidden user", { auth: async () => { throw Object.assign(new Error("private-token"), { response: { status: 403 } }); } }, 403, "AUTH_REQUIRED", "authentication"],
  ["gateway app config", { clientError: new Error("private-token") }, 500, "BACKEND_CONFIGURATION", "client_configuration"],
  ["service token missing", { serviceError: new Error("private-token") }, 500, "BACKEND_CONFIGURATION", "service_role_configuration"],
  ["profile query denied", { profileQuery: async () => { throw Object.assign(new Error("private-token"), { status: 403 }); } }, 502, "BACKEND_DEPENDENCY", "profile_query"],
  ["provider credits/rate limit", { llm: () => { throw Object.assign(new Error("private-token"), { status: 429 }); } }, 503, "PROVIDER_RATE_LIMIT", "provider_classification"],
  ["provider access denied", { llm: () => { throw Object.assign(new Error("private-token"), { status: 403 }); } }, 502, "PROVIDER_ACCESS", "provider_classification"],
  ["provider outage", { llm: () => { throw Object.assign(new Error("private-token"), { status: 500 }); } }, 502, "PROVIDER_ERROR", "provider_classification"],
  ["provider timeout", { llm: () => { throw Object.assign(new Error("private-token"), { code: "ECONNABORTED" }); } }, 504, "UPSTREAM_TIMEOUT", "provider_classification"],
  ["provider network failure", { llm: () => { throw Object.assign(new Error("private-token"), { code: "ENOTFOUND" }); } }, 502, "UPSTREAM_NETWORK", "provider_classification"],
  ["malformed classification", { llm: () => "not an object" }, 502, "PROVIDER_RESPONSE_INVALID", "classification_parsing"],
  ["malformed explanation", { llm: (_args, count) => count === 1 ? { intent: "search_inventory" } : { reply: "bad shape" } }, 502, "PROVIDER_RESPONSE_INVALID", "explanation_parsing"],
]) {
  test(label + " has safe, stage-specific diagnostics", async (t) => {
    const { logs } = fixture(t, options);
    const res = await handler(request({ message: "private-prompt" }));
    const body = await res.json();
    assert.equal(res.status, status);
    assert.equal(body.error, code);
    assert.equal(logs.at(-1).stage, stage);
    assert.equal(logs.at(-1).requestId, body.requestId);
    assert.ok(logs.at(-1).action);
    assert.doesNotMatch(JSON.stringify({ body, logs }), /private-token|private-prompt/);
  });
}
for (const body of [null, {}, { message: 42 }, { message: "Hi", history: {} }, { message: "Hi", context: { page: 12 } }]) {
  test("rejects malformed body " + JSON.stringify(body), async (t) => {
    const { calls } = fixture(t);
    const res = await handler(request(body));
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "INVALID_REQUEST");
    assert.equal(calls.length, 0);
  });
}
