# TreEbay assistant runtime audit

Audited repository revision: `41408ce933379e1bcc321b958b85dad47dd24bbd`. Checks performed September 12, 2026. The patch is local; it has not been deployed or pushed.

## Confirmed defects and evidence

1. `base44/functions/trebayAssistant/entry.ts:232` in the audited revision returns `user: { id: user.id, isSeller, isVerifiedSeller, presentationRole }`. `isVerifiedSeller` has no declaration. Every request that reaches that success response throws a ReferenceError. Running the original handler with successful mocked authentication, profile lookup, and InvokeLLM returns HTTP 500 with `error: "isVerifiedSeller is not defined"`. This defect does not depend on a missing AI API key.
2. The catch at original lines 233–235 collapses auth, configuration, entity, provider, and programming failures into HTTP 500, exposes `error.message`, and emits no diagnostic log. A real unauthenticated POST to production returned HTTP 500 with `error: "Authentication required to view users"` and the backend fallback. This proves the deployed route runs and mishandles auth errors. It does not prove a signed-in request reaches the provider.
3. The exact user-reported fallback is in historical commit `c3246ef`, `src/components/AIAssistant.jsx:60`. Current source has different frontend wording at line 74; the downloaded production bundle also has the newer wording. The backend has a similar fallback. A quoted UI message alone does not identify which downstream stage failed or which frontend version was served at the time.
4. Existing lint/typecheck configuration excludes backend functions. The regression therefore escaped those checks. New tests execute the real TypeScript handler bundled with an injected SDK fixture, including final response serialization.

## Complete request path

1. Browser loads `https://treebay.insuredspending.org`. The observed JS asset is `/assets/index-C9hbXVIe.js`.
2. `src/components/AIAssistant.jsx` calls the shared client with `base44.functions.invoke("trebayAssistant", {message, context, history})`.
3. `src/api/base44Client.js` creates the SDK using `src/lib/app-params.js`. The production bundle contains app ID `6a77a39c9b7e1d39b7705b42`, functions version `prod`, and no default appBaseUrl. URL/storage overrides may select a different app/version in an individual browser and should be checked if behavior differs.
4. The deployed SDK's invoke sends POST to `https://base44.app/api/apps/6a77a39c9b7e1d39b7705b42/functions/trebayAssistant` with `X-App-Id`, `Base44-Functions-Version: prod`, JSON content type, and the signed-in user's bearer token when present. `requiresAuth: false` disables automatic redirect; it does not make the function public. `appBaseUrl` is not this SDK invoke's API origin override.
5. The Base44 gateway forwards to the hosted function. `createClientFromRequest(req)` restores caller auth and platform service-role context. The SDK uses platform headers including `Base44-App-Id`, `Base44-Service-Authorization`, optional `Base44-Api-Url`, and functions version. These are gateway-managed headers, not frontend environment secrets.
6. `base44.auth.me()` authenticates the caller. `base44.asServiceRole` is then needed for VendorProfile lookup and authorized marketplace queries. The original lookup runs even for general/onboarding questions, so service-role configuration and the VendorProfile entity are dependencies of every valid request.
7. `base44.integrations.Core.InvokeLLM` classifies the prompt with `response_json_schema`. This runs in caller context. The assistant uses Base44's managed AI integration; no model name, direct OpenAI/Anthropic URL, or provider API key is configured in this handler. Base44's internal provider and credentials are outside this repository and were not inspectable.
8. Structured classification selects authorized entity queries or drafts. Many inventory/order/RFQ requests make a second InvokeLLM request for a plain-text explanation. Either provider call, entity access, invalid output, SDK/configuration failure, or serialization error can trigger the original fallback.
9. The function serializes `{reply, intent, results, user}`. The original undefined seller flag crashes here. The frontend expects the raw Axios response's `.data`; non-2xx rejects and enters the UI catch.

## Environment audit: keep development and production separate

| Exact name / dependency | Codex development and tests | TreEbay production | Secret? |
|---|---|---|---|
| `VITE_BASE44_APP_ID` | Needed for a functional frontend build; use a separate Base44 test app for independent integration tests. This audit's read-only hosted checks target `6a77a39c9b7e1d39b7705b42`. | Must identify that production app at frontend build time. Correct value is present in the observed deployed bundle. | No |
| `VITE_BASE44_APP_BASE_URL` | Set to the chosen hosted app URL for the local Vite `/api` proxy; README documents this. | Optional for the current hosted SDK invocation; deployed default is absent, but invoke correctly uses `https://base44.app/api`. Not evidence of a production misconfiguration. | No |
| `VITE_BASE44_FUNCTIONS_VERSION` | Optional version selection; use the version intended for the test target. | Observed value is `prod`. Ensure published code is available in that version. | No |
| `BASE44_LEGACY_SDK_IMPORTS` | Optional build switch, true only for legacy import rewriting. | Optional build switch; not an AI credential. | No |
| Caller login token | No real token needed by unit tests; a test-user session is required for authenticated hosted testing. | Obtained by user sign-in and transmitted in Authorization. Never bake a user's token into the build. | Yes |
| Platform app/service-role headers | Mocked in handler tests. A local backend needs its own documented Base44 runtime context. | Base44 gateway supplies them; verify injection if `BACKEND_CONFIGURATION` is logged. Do not add a browser service token. | Service authorization is secret |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` | Not read or required by this assistant. | Not read or required by this assistant. Adding them does not fix the ReferenceError. | Would be secrets, but unused |

The initial local build had none of the VITE settings and warned that the app ID was missing. A second build with the public production app ID, URL, and `prod` version passed. This local absence is separate from production, whose bundle already contains the app ID and version. No missing production AI environment variable was established. Production secret settings were not accessible.

Other environment names in the repository belong to commerce, not the assistant path: `STRIPE_SECRET_KEY`, `STRIPE_TEST_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_TEST_WEBHOOK_SECRET` (backend secrets); `BASE44_APP_ID`, `TREE_MARKETPLACE_LIVE_PAYMENTS`, `TREE_MARKETPLACE_STRIPE_SANDBOX`, `TREE_MARKETPLACE_PUBLIC_URL`, `TREE_MARKETPLACE_PAYOUT_HOLD_HOURS` (backend configuration). Unit tests use fake Stripe values. Do not copy live commerce secrets into Codex to test AI. Test/live webhook secrets and keys belong to their respective deployed commerce modes. None of these reads executes in the assistant path merely because shared transaction helpers are imported.

No new environment variable is introduced by this fix. Source inspection found no direct provider secrets in the frontend configuration. A pattern scan of the observed production bundle and new build found zero recognizable long Stripe/OpenAI secret literals. This is scoped evidence, not a guarantee that arbitrary secrets could never have entered a historical artifact. Secrets were not printed or moved.

## Diagnostics added

The function writes structured `trebay_assistant` JSON events: `started`, `success`, or `failure`, with a generated request ID. Failure events include stage, stable error code, response status, upstream status if available, elapsed time, and an actionable operator instruction. Raw exceptions, prompts, tokens, user records, and SDK response bodies are never logged. The browser receives a safe reply, code, and request ID; it logs only sanitized status/reference metadata.

Stages identify client configuration, authentication, request validation, service-role configuration, profile lookup, provider classification, classification parsing, marketplace lookup, provider explanation, explanation parsing, and serialization. Auth failures return 401/403; invalid input 400; provider/network/response failures 502, provider rate limit 503, upstream timeout 504, configuration/programming errors 500.

Find the matching request ID in Base44 function logs. If there is no function `started` event, inspect browser Network and gateway/deployment logs for missing route, blocked preflight, DNS/TLS failure, or gateway auth rejection. A server cannot conclusively diagnose a browser CORS failure for a request it never received; the browser intentionally combines some network/CORS errors. Boot/import failures also precede handler logs and require platform deployment logs. Provider 429 identifies a rate/quota rejection but platform logs/credits are needed to distinguish exact billing cause. No new public diagnostic endpoint or unauthenticated provider probe was added.

## Live and local verification

| Check | Observed result |
|---|---|
| Public repo clone | Success |
| Production website | HTTP 200; browser displays signed-out landing page |
| Correct default app/function/version | Confirmed in production JS bundle |
| CORS | OPTIONS with real origin and authorization/content-type/x-app-id/base44-functions-version requested headers returns 200; allow-origin `*`; all requested headers accepted. POST also carries allow-origin `*`. Current bearer-token client does not need credentialed cookie CORS. |
| Endpoint existence | Real unauthenticated POST executes function and returns recognizable auth error/fallback, HTTP 500 |
| Valid authentication reaching backend | Not verified: no signed-in TreEbay session available |
| Backend reaching AI provider | Not verified live; no authorized provider request completed |
| Original source reproduction | Successful mocked auth/profile/provider still produces 500: `isVerifiedSeller is not defined` |
| Patched handler success | Buyer, verified seller, and two-provider-call inventory paths return 200 with SDK fixtures |
| Tests | All 41 pass, including 21 new assistant tests |
| Lint / typecheck | Pass using repository configurations; typecheck does not cover backend |
| Build | Pass with public VITE settings; existing bundle-size and stale Browserslist warnings |
| Production deployment / real end-to-end success | Not completed; do not treat mocked success as production proof |

`npm run verify` initially could not recurse through this desktop environment's incomplete npm launcher. All its constituent commands were then executed directly and passed: `node --test test/catalog-loader.test.js test/account-profiles.test.js test/stripe-sandbox.test.js test/assistant.test.js`, ESLint, TypeScript, and Vite build. No repository npm failure was inferred from that launcher issue.

## Required production follow-through

1. Apply this patch to the repository, sync the changes to the correct Base44 app, and publish according to the repository README. Public GitHub read access does not provide push or Base44 deployment access. MCP still reports APP_NOT_FOUND for the app.
2. Preserve the observed production app ID and `prod` function version. Do not change provider or payment secrets to address this bug.
3. Verify the function's platform-managed service-role context, VendorProfile schema, and Core.InvokeLLM access/credits using the new stage logs if any error remains. The relevant account's Base44 dashboard is needed; these values cannot be certified from the public repo.
4. Sign into the production website as an authorized test user. Send `Hello`, then `Find 25 Live Oaks`. Confirm POST 200, a nonempty reply with arrays for cards/actions, no fallback, and matching server success request IDs. Record timestamp, URL, status, request ID, and redacted reply. This is the outstanding end-to-end proof.
5. Repeat a signed-out/expired-token request: expect 401 rather than the old 500. Keep the existing working CORS configuration; no CORS change is justified by these probes.

## Codex Cloud networking (separate from production)

This work ran in Codex Desktop with outbound network access; no Cloud environment was modified. If repeating in Codex Cloud, allow the actual request destinations: `base44.app` (SDK API), `treebay.insuredspending.org` (site), and `app.base44.com` (MCP/dashboard). Source/setup may also need `github.com`, `api.github.com`, `raw.githubusercontent.com`, `registry.npmjs.org`, and `docs.base44.com`. Allow POST for assistant requests and MCP, and OPTIONS for CORS probes, not just GET/HEAD. A direct `api.openai.com` allowlist entry is not required by this assistant's observed request path. Base44's provider egress is a production-platform responsibility.

OpenAI documents that Cloud agent internet is off by default while setup has internet, and that per-environment domain/method restrictions are configurable: [Agent internet access](https://learn.chatgpt.com/docs/cloud/internet-access). An authorized test login belongs to the test flow; do not put app service credentials in VITE variables or treat Codex networking as production configuration.
