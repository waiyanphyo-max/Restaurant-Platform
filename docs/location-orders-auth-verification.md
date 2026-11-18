# Verification results — 16 November 2026

This report distinguishes local automated verification from hosted or physical-device acceptance. It accompanies [the implementation and runbook](location-orders-auth-implementation.md).

## Automated results

| Check | Pass | Fail | Skip | Evidence |
| --- | ---: | ---: | ---: | --- |
| All frontend/package/script tests (`npm test`) | 1,251 | 0 | 0 | `target/continuation-frontend-tests.log`; loopback access enabled for disposable HTTP servers |
| UI tokens | 2 | 0 | 0 | Full workspace test run |
| API client, including canonical lookup and order actions | 111 | 0 | 0 | Full workspace test run |
| Restaurant configuration | 8 | 0 | 0 | Full workspace test run |
| Admin Web, including existing auth/owner/recovery | 171 | 0 | 0 | Full workspace test run |
| Guest Web, including confirmation fallback/security | 229 | 0 | 0 | Full workspace test run |
| Operations Mobile | 334 | 0 | 0 | 328 Vitest + 6 Node tests |
| Customer Mobile | 386 | 0 | 0 | 378 Vitest + 8 Node tests |
| Root scripts, including geographic import audit | 10 | 0 | 0 | Full workspace test run |
| All workspace TypeScript checks | Pass | 0 | — | `target/continuation-typecheck.log`; includes shared types, API client and both mobile apps |
| All workspace lint | Pass | 0 | — | `target/continuation-lint.log` |
| Spring backend + opt-in PostgreSQL (546 discovered) | 533 | 0 | 13 | `target/continuation-backend-verify.log` and `app/api/target/surefire-reports` |
| Operations Android JavaScript export | Pass | 0 | 0 | `target/continuation-android-exports.log`, `apps/operations-mobile/dist-starter/metadata.json` |
| Customer Android JavaScript export | Pass | 0 | 0 | `target/continuation-android-exports.log`, `apps/customer-mobile/dist-starter/metadata.json` |
| Guest Web production build | Pass | 0 | 0 | Production build passed on the current Guest source before continuation; final Guest tests/typecheck/lint were rerun |
| Tracked migration preservation | Pass | 0 | 0 | `git diff --name-only -- supabase/migrations` is empty; only new forward migrations |
| Patch whitespace check | Pass | 0 | 0 | `git diff --check` |

All 50 opt-in local PostgreSQL integration tests passed, including the eight owner-onboarding cases in their separate fixture database. The only 13 backend skips are `PostgresMigrationSchemaTest`: PostgreSQL 17 Testcontainers could not find a valid Docker environment. Final Maven `verify` exited successfully and built the executable JAR. Backend suite totals and local PostgreSQL breakdown are retained in `target/continuation-qa-20261116/test-results.json`.

The total frontend row includes the component rows and must not be added to them. Shared types have no standalone runtime test script; their emitted contracts and consuming workspaces are typechecked. Focused runs were used during development and are not double-counted.

An initial API-client HTTP integration test failed with sandbox `EACCES` connecting to its own loopback server. The authorized local-access rerun and full workspace suite passed. An initial lint pass found a missing explicit `node:buffer` import in the geographic generator; that was corrected before the final lint run. A new read-only endpoint test exposed the existing catch-all handler mapping unsupported methods to HTTP 500; the handler now preserves HTTP 405. These initial failures are not hidden skips. The initial full backend run also exposed outdated District snapshot expectations, a missing geography bean in a test application, and an incorrect Minhla ambiguity expectation. These fixtures were corrected without bypassing validation; targeted checks and the final full 546-test run passed.

## PostgreSQL scope and preservation

The disposable PostgreSQL 16.4 cluster was stopped after verification (files retained; restart command is in the handoff). Its data is under ignored `target/continuation-qa-20261116/data`, listening only on `127.0.0.1:55488`, database `accounting_verify`. All 32 migrations were processed chronologically against this fresh cluster; the four pending text-only/geographic migrations were applied unchanged. Two temporary copies of old PostgreSQL-17 privilege migrations omit only the unsupported `MAINTAIN` keyword for this PG16 run; repository copies were not altered. This is not a claim that the PostgreSQL 17 Docker matrix ran. A fresh PG18 initialization was attempted first, but the installed binary crashed during post-bootstrap with Windows exception `0xC0000005` (`target/continuation-qa-20261116/initdb.log`); the proven PG16 installation initialized successfully and supplied the final test databases.

Migration evidence is in `target/continuation-qa-20261116/migrations.log` and adjacent local QA artifacts. Preservation assertions check the old customer-address text and null identity, unchanged historical order snapshots, unique legacy zone identity backfill with original labels/fees retained, and review-only address candidate mapping. The geographic integration tests check seed repeatability/counts, foreign keys, scoped uniqueness, invalid/mismatched/inactive hierarchy, strict legacy resolution, RLS and revoked writes.

The separate `owner_onboarding_verify` database in the same isolated cluster enables the eight optional owner-onboarding regressions; it contains only that test fixture. For a fresh disposable test database with the complete migration chain applied, set `ACCOUNTING_TEST_DATABASE_URL=jdbc:postgresql://127.0.0.1:<local-port>/accounting_verify` and run the Maven verify command from the runbook. To include owner-onboarding tests, separately create an empty `owner_onboarding_verify` database and set `OWNER_ONBOARDING_TEST_DATABASE_URL=jdbc:postgresql://127.0.0.1:<local-port>/owner_onboarding_verify`. Never reuse these destructive fixture tests against hosted or customer databases. Tests enforce the loopback database-name contract.

## Export and build scope

The first fixture export encountered an existing local `.env.local` Firebase JSON whose Android package belongs to the branded app rather than the starter fixture. Exports were rerun with `EXPO_NO_DOTENV=1` and notifications disabled in the verification process only; local environment files were preserved. The final continuation reran both Android exports after the final contracts: Customer bundled 1,379 modules (3.8 MB Hermes); Operations bundled 1,706 modules (4.7 MB Hermes). Guest Web production compilation, lint/typechecks, static generation and build tracing passed. Two initial Guest build attempts hit Windows EPERM while creating generated route directories; pre-creating only the generated folders resolved the build without source changes. These are JavaScript/Hermes fixture exports, not APK generation, native push verification or real-device acceptance. No native dependency was added.

## Manual checks remaining

Real-device/inbox/hosted checks were not run and have no fabricated pass counts:

- Review current geographic boundaries, duplicate quarantines and legacy candidate/unmatched reports.
- Manually apply reviewed migrations and deploy the compatible backend before new clients.
- Select and host the stable HTTPS tenant callback and configure the exact Supabase redirect allowlist/template as documented.
- Verify branded Android cold/warm confirmation return, invalid/expired email, missing-app fallback, manual sign-in/resend and owner/admin recovery.
- Verify text-only saved/temporary checkout, unsupported/mismatched township, totals/minimum/COD, duplicate/recovery behavior and immutable order history.
- Verify Operations item/modifier/address readability and role privacy, early cancellation/refund behavior, queue pickup, assigned driver delivery and physical COD cash reconciliation.

See [the detailed Windows/device runbook](location-orders-auth-implementation.md) and [email-specific checklist](customer-email-confirmation.md).
