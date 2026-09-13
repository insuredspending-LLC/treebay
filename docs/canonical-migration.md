# Canonical TreEbay repository migration

Prepared on 2026-09-13 for review on `migration/canonical-treebay` in `insuredspending-LLC/treebay`. Do not merge or publish until reviewed. This migration does not change live production settings.

## Source and history preservation

- Canonical destination: `insuredspending-LLC/treebay`.
- Source/reference: `notenoughtimeinaday/TreEbay`, retained intact for rollback.
- Source main: `41408ce933379e1bcc321b958b85dad47dd24bbd`, confirmed against the remote before migration.
- Destination main baseline: `8180053bac4edbc79899fb46f010861a6692c580`.
- Destination main is an ancestor of source main. The migration fast-forwards the review branch through the existing source history, preserving both repositories' history without an unrelated-history merge or conflict resolution. No destination-only files needed to be discarded.
- Prepared assistant fix reference: `211f8045844fc2f04e29bc2266a30a870b7325c2`.
- Assistant fix applied and committed here: `07269feba487c89dc3d5c32879bcf3ea5b868b3a`.
- `git apply --check` passed before applying the prepared patch. The staged result matched the prepared fix commit's tree exactly.

## Application changes

The source import includes the existing frontend, backend functions and entities, Android wrapper, assets, and tests. Existing commerce and Stripe source is preserved from the source commit; no payment configuration was edited for this migration.

The assistant patch fixes an undefined `isVerifiedSeller` reference during response serialization. It adds safe request-ID diagnostics, stage-specific server errors, safer frontend handling, and 21 assistant regression tests. Its six paths are `README.md`, `package.json`, `base44/functions/trebayAssistant/entry.ts`, `src/components/AIAssistant.jsx`, `test/assistant.test.js`, and `docs/assistant-runtime-audit.md`.

See [canonical-migration-files.txt](canonical-migration-files.txt) for the complete application diff against destination main. The inventory excludes itself and this migration report.

## Verification

`npm ci --no-audit --no-fund` succeeded using the committed lockfile. `npm run verify` exited 0 on the migrated source plus assistant patch:

- Catalog: 4 passed.
- Buyer profiles: 5 passed.
- Stripe sandbox: 11 passed.
- Assistant: 21 passed.
- Total: 41 passed, 0 failed.
- ESLint, TypeScript check, and Vite production build: passed.

Warnings: stale Browserslist data and a generated JavaScript chunk larger than 500 kB. Neither failed verification. Android packaging is outside `npm run verify` and was not built.

Verification used only process-local public build settings: `VITE_BASE44_APP_ID=6a77a39c9b7e1d39b7705b42`, `VITE_BASE44_APP_BASE_URL=https://treebay.insuredspending.org`, and `VITE_BASE44_FUNCTIONS_VERSION=prod`. No API keys, provider secrets, or payment credentials were moved, added, or changed. Assistant tests mock Base44 authentication, entities, and provider calls; they do not establish that a signed-in production request succeeds.

## Base44 rollout after review and merge

The production app identity must remain `6a77a39c9b7e1d39b7705b42`. Its external GitHub integration is not encoded in the tracked `base44/config.jsonc`, and `base44/.app.jsonc` is ignored. The tracked project configuration is unchanged from the source and destination baseline. Actual external Base44 repository linkage has not been verified or changed during this migration.

After review and merge, inspect the production app's GitHub integration and connect its source to `insuredspending-LLC/treebay` on `main`. Confirm the destination repository is not synchronized to a different app that could overwrite the migrated source. Review existing branch synchronization before changing links. Preserve the current domain, app identity, environment, payment mode, and secrets.

Publish the correct app only during the separately authorized rollout. Then test signed-in `Hello` and `Find 25 Live Oaks`; retain each HTTP 200 response, its request ID, and the matching `trebay_assistant` success log. These production checks remain pending because this PR is intentionally unmerged and unpublished.

## Render and deployment references

A tracked-source scan found no old TreEbay repository URL, `render.com`, `onrender.com`, or deployment `repo:` reference in application code. Historical source repository references in audit and migration documentation remain for provenance.

Read-only inspection of the user-selected Render workspace `My Workspace` found two services: `iabt-staging-web` and `iabt-api-insured-spending`. Both point to `https://github.com/notenoughtimeinaday/iabt` on `main`; neither points to `notenoughtimeinaday/TreEbay`. No Render settings were changed. This result covers the selected workspace, not other accounts or services outside it.

## Review boundary

Only the migration branch is pushed and proposed for merging. Destination main, the original repository, DNS, Base44 publication, Stripe settings, payment configuration, and secrets are unchanged by this work. Production behavior will not change until the reviewed migration and subsequent Base44 publication occur.
