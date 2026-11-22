# UXI-13A — PostgreSQL CI and continuous synthetic integration

22 November 2026, Asia/Bangkok. Branch: `uxi/13a-integration-remediation`. HEAD: `fcf69064b6f1e2ce403702c28eef73cb4190fe00` (UXI-13, PR #53). This report describes **uncommitted working-tree implementation and its verification**, not a new committed or deployed revision.

## 1. Scope, evidence and implementation decision

Read the complete UXI-13 acceptance, backend/browser/mobile/native-DOM reports, command-result JSONs and migration inventory before implementation. Reviewed baseline/product-policy, API, architecture, role/security and onboarding/branding contracts, existing migration/database/HTTP utilities, QA reproduction scripts, workflows and mobile build/Firebase implementation. No applicable repository or ancestor `AGENTS.md` was found.

The initial tracked and staged diffs were empty. Only `.postman/` and `postman/` were untracked. [Baseline](qa/uxi-13a/baseline.json) records branch/HEAD, seven Postman hashes and all migration hashes. These user files are not implementation deliverables.

The announced plan was:

- **KEEP** the existing PostgreSQL container/migration runner, historical Shopping upgrade fixture, services, authorization, source SQL and business rules.
- **ADAPT** the single Backend CI verification to require actual database execution and retain sanitized evidence; improve existing Firebase validation diagnostics.
- **ADD** a fail-closed result guard, focused guard tests, one continuous signed-JWT A/B HTTP journey and focused restricted-principal acceptance using existing database fixtures.

No independently reproduced business-logic defect justified an application/API/schema change. B01/B02 are integration-evidence gaps; B03 is an external client-configuration dependency. B04–B09 remain outside remediation scope.

## 2. Actual implementation files

| Files | Resulting change |
| --- | --- |
| `.github/workflows/backend-ci.yml` | Existing job still runs Maven once; migration/guard paths trigger PR verification; always-run mandatory guard and 14-day sanitized JSON artifact; existing `contents: read` permission retained. |
| `scripts/verify-postgres-acceptance.py`, `scripts/test_verify_postgres_acceptance.py` | Python standard-library Surefire/evidence validator and 20 synthetic acceptance-guard tests. |
| `app/api/src/test/java/com/restaurant/platform/integration/PostgresMigrationSchemaTest.java` | Reuses `postgres:17-alpine`, exact source migration runner and legacy seed; records actual version/order/hashes/commit; adds HTTP journey and restricted-principal delegates, giving 23 mandatory cases. |
| Same integration directory: `SyntheticTwoTenantHttpJourneyChecks.java`, `PlatformBootstrapLocalPostgresTest.java` | One connected real HTTP/security/JPA journey plus opt-in wrapper for the existing disposable loopback fixture. |
| Same integration directory: `RestrictedPrincipalDatabaseChecks.java`, `RestrictedPrincipalLocalPostgresTest.java` | Transaction-scoped restricted-role/grant/RLS tests and matching opt-in local wrapper. |
| `configs/restaurants/firebase-android.cjs`, `configs/restaurants/expo.cjs` | Existing Firebase validation returns safe app/environment/package/client/project facts and precise recovery instructions. |
| `configs/restaurants/tests/firebase-android.test.cjs` | Seven focused diagnostic/privacy/normal-Expo-path cases. |
| `README.md`, `configs/restaurants/README.md`, this report | Reproduction instructions and acceptance boundaries. |
| `docs/qa/uxi-13a/` | Sanitized execution summaries, baseline CI excerpts, preservation/migration inventories and isolated synthetic mobile plans/results. Raw `.log` files remain ignored. |

No source SQL, Maven dependencies, production services, API contracts, role grants, native identities, private Firebase JSON or Figma objects were changed.

## 3. PostgreSQL 17 evidence and required-test enforcement

**Existing remote baseline: PASS for the executed baseline suite.** Read-only inspection of [Backend CI run 45028343236](https://github.com/waiyanphyo-max/Restaurant-Platform/actions/runs/45028343236), job `137226183759`, proves that the baseline `postgres:17-alpine` container started and all **21** original `PostgresMigrationSchemaTest` cases executed: **0 failures, 0 errors, 0 skips**. Overall baseline Maven: **655 discovered, 601 executed, 54 skipped**. [Sanitized metadata and log excerpts](qa/uxi-13a/baseline-ci-execution.json) distinguish this from the modified working tree. There were no retained baseline Surefire artifacts. The baseline log did not record an actual `SHOW server_version_num` result or migration hashes; image metadata alone is not that evidence.

**Modified PostgreSQL 17 acceptance locally: BLOCKED.** Docker's Linux engine pipe is absent. A fresh workspace-only PostgreSQL 18.0 `initdb` reproduced exit 1 / Windows `0xC0000005` during post-bootstrap initialization. No migrations were applied to that failed cluster. Ordinary Maven remains usable without Docker: its mandatory class is explicitly **SKIPPED**, while the separate guard exits **1 / BLOCKED**, as recorded in [local acceptance](qa/uxi-13a/local-postgres17-acceptance.json).

**Modified remote acceptance: NOT RUN / pending.** No commit/push, workflow dispatch or rerun was authorized or performed. The current baseline run cannot certify the two newly added cases or new guard. The next permitted PR/branch run must retain the new artifact before exact PostgreSQL 17 remediation is accepted.

The guard requires one valid mandatory Surefire suite, all 23 named methods, consistent declared/per-case counts, no mandatory skips/failures/errors, successful Maven, exact tested SHA, actual `server_version_num >= 170000`, the existing container image, all 35 applied source hashes in order, successful Hibernate validation, legacy Shopping seed, restricted-principal evidence and completed HTTP-journey evidence. Missing, malformed, stale, changed-order/hash, wrong-version and incomplete results cannot PASS. Optional developer-local suites can remain explicitly skipped.

Statuses are deliberate: **PASS** means required execution and evidence succeeded; **FAIL** means executed verification or evidence validation failed; **BLOCKED** means required execution was prevented/missing (including absent Docker); **SKIPPED** records explicit skipped cases and never grants mandatory acceptance; **NOT RUN** identifies work not executed. Every non-PASS guard outcome exits 1. Twenty guard tests cover positive, negative, non-skip, privacy, version, order/hash, commit, principal and journey paths.

The workflow uploads only `app/api/target/postgres-acceptance/acceptance.json`, named with run ID/attempt, for 14 days. It contains allowlisted Docker/version/commit facts, per-suite counts, mandatory case statuses, applied migration inventory and principal/journey summaries. Raw Surefire XML, JVM/environment properties, test stdout, SQL dumps, credentials, tokens and provider files are not uploaded. No second CI job/container/migration framework was added.

## 4. Migration and local database evidence

All **35** repository source migrations retain their baseline SHA-256 values and unique chronological 14-digit prefixes, from `20261010204938_create_initial_schema.sql` through `20261120100000_add_restaurant_featured_product.sql`. See [source inventory and compatibility qualifications](qa/uxi-13a/migration-source-inventory.csv) and the baseline/preservation records. Historical SQL was not rewritten.

The existing PostgreSQL 16 reproduction script was examined and reused in memory with only task-owned evidence paths and loopback port redirected. A new isolated PostgreSQL **16.4** cluster on `127.0.0.1:55431` applied **35 temporary compatibility copies**, creating **62 public tables**. Only the unsupported `MAINTAIN` privilege token in two historical temporary copies differs from source (`20261016051330`, `20261016052430`); the other 33 copies are byte-identical. This is **qualified compatibility evidence**, not exact-source PostgreSQL 17 acceptance. Supabase Auth schemas/roles/users are synthetic. No existing database was reset.

The original Testcontainers migration loop still seeds legacy duplicate Shopping plans, valuation/archive and confirmed purchase/payment history immediately before `20261115091000_shopping_planning_separation.sql`. Its assertions and transaction/concurrency/financial schema suites remain present. That exact seeded upgrade executed in the baseline CI; it was not reproduced by the empty-schema local compatibility fixture and awaits the modified CI run.

## 5. Continuous authenticated A/B journey

**Runtime outcome: PASS, 59 actual HTTP requests, on qualified PostgreSQL 16.4; modified PostgreSQL 17 execution pending.** [Journey evidence](qa/uxi-13a/http-journey-pg16.json) records all 12 phases and cleanup. The same helper runs inside the existing mandatory migration suite and the existing opt-in local bootstrap suite. It starts a loopback Spring API and ephemeral ES256 JWKS server against the same migrated database; production JWT decoder, filters, controllers, membership guards, services, repositories and transactions execute. There is no mocked persistence or authorization.

One invocation owns five synthetic Auth UUIDs (Platform Admin, Owner/Manager A/B), two restaurant UUIDs returned by real provisioning, and catalog UUIDs returned by real bootstrap. Those identities and rows persist continuously across:

1. Allowlisted Admin provisioning A without gaining restaurant membership; verified initial Owner resolution and real Owner-created Manager membership.
2. Canonical runtime palette initialization; category/product/variant/required modifier/option creation and linking.
3. Committed receipt retry with exact identity/payload and persisted timestamp, changed-intent conflict and incomplete required-modifier rejection.
4. Actual Owner onboarding API with signed fresh-password AMR prerequisite; blocked premature handoff and successful supported handoff.
5. Owner product and Manager variant/palette updates; anonymous public menu/branding reflect those same persisted UUIDs, values and revisions.
6. Owner Featured selection and Manager denial.
7. Independent B provisioning/catalog/branding/handoff/edit state; foreign membership/resource/category/Featured reads/writes rejected without changing A.
8. Anonymous, wrong-signature, wrong-issuer, wrong-audience and expired JWT denials; forged role text confers no membership.

Only external Supabase Auth Admin exact-UUID lookup and the signing issuer/AMR authority are synthetic. Preexisting synthetic `auth.users` rows model provider identities; membership is created exclusively through actual provisioning/Owner APIs. No invitation/recovery email is sent. A synthetic verified email/password-AMR claim proves Spring handling, not mailbox/password-provider/hosted authentication. Photos/native-build status remain PENDING under the supported handoff contract.

The journey uses the disposable administrator datasource; it does not certify a restricted deployed principal. Separate checks below cover focused database capabilities. Checkout/orders, provider/device and complete frontend-to-Spring journeys are **NOT RUN within this connected journey**; existing independent QR/COD/accounting regressions remain separate evidence. The helper closes Spring/Hikari/HTTP/JWKS and removes only its own UUID fixtures before writing its sanitized successful summary.

The first local run exposed a new harness assumption: comparing the entire first/replay JSON receipt treated equivalent UTC offsets and PostgreSQL's microsecond timestamp rounding as failure. The fixture now retains exact operation/kind/resource/result/actor equality, requires replay time to equal the stored database Instant, and bounds the first in-memory timestamp difference to one microsecond. No application behavior or existing assertion was changed. The focused rerun passed the complete journey, rather than stopping at retry.

## 6. Restricted database principal and RLS

**Runtime outcome: PASS on qualified PostgreSQL 16.4; modified PostgreSQL 17 execution pending.** [Executed principal evidence](qa/uxi-13a/restricted-principal-pg16.json) records the actual server version and capabilities. The focused fixture creates two transaction-scoped NOLOGIN roles with **NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOINHERIT**, no memberships and no table ownership. Both receive only public-schema usage and these explicit grants:

| Private table | Focused trusted-server operations |
| --- | --- |
| `restaurant_runtime_branding` | SELECT, INSERT, UPDATE |
| `restaurant_bootstrap_steps` | SELECT, INSERT (no receipt rewrite) |
| `restaurant_featured_product` | SELECT, INSERT, UPDATE (clear keeps revision) |

The existing migrations enable RLS on all three tables, revoke direct PUBLIC/anon/authenticated/service-role grants and define **no** policies. Therefore a nonowner NOBYPASSRLS role with object grants sees zero rows and cannot insert; ordinary table grants alone do not enable Spring's private-table operations. The focused trusted role is explicitly **BYPASSRLS**, while still denied unrelated settings/orders/purchases/Auth reads, receipt UPDATE and TRUNCATE. Its real inserts/updates/Featured clear succeed; a foreign-tenant Featured product fails with SQLSTATE **23503**. Direct `anon`, `authenticated` and even BYPASSRLS `service_role` access fail with **42501** because their private-table grants are revoked. Savepoints retain the transaction after expected negative checks; rollback removes all fixture roles/grants/rows, and role absence is verified.

This establishes database capabilities, not a new tenant RLS policy. BYPASSRLS intentionally does not provide tenant isolation: actual HTTP/service guards provide that boundary above. No production RLS/grants/policies were weakened. The tested grant subset concerns the three private UXI tables; the full Spring application also needs its actual catalog/membership/profile/settings and applicable domain tables. Existing eligibility/onboarding code additionally reads reviewed columns of `auth.users` under server-only schema usage. A complete least-privilege deployment grant manifest and **actual hosted Spring role** remain **BLOCKED**, pending independent read-only role/grant/owner/RLS evidence. No frontend membership or role was fabricated.

## 7. Firebase diagnostic result

**Diagnostic: PASS. Provider readiness: BLOCKED. Normal frontend aggregate: FAIL (exit 1).** [Current results](qa/uxi-13a/frontend-results.json) refine the older mismatch label:

- App kind **operations**, selected environment **development**.
- Unchanged selected package **`dev.restaurantplatform.starter.operations.staging.dev`** (the package text includes `staging`; selected environment is still development).
- `OPERATIONS_GOOGLE_SERVICES_FILE` is configured and contains Android client JSON.
- Expected Firebase project **matches: true**; matching Android clients **0**; selected-client metadata valid **false** because no matching client exists.

Operator action: in the approved Firebase project's **Project settings → General → Your apps**, select/register that exact Android application ID, download its Android `google-services.json`, point `OPERATIONS_GOOGLE_SERVICES_FILE` to the ignored file relative to Operations, and retain the same approved `MOBILE_FIREBASE_PROJECT_ID`. Rerun the original command. A fresh download also resolves duplicate-client or invalid sender/app/key metadata when applicable. No project, certificate, private JSON, native identity or notification setting was invented/changed. Diagnostic output excludes paths, actual project values, JSON and API keys.

## 8. Command outcomes and counts

| Command/check | Status and result |
| --- | --- |
| Initial sandboxed Maven verification | **BLOCKED**, interrupted after Windows Mockito attach-pipe failure; no completed result claimed. |
| `mvn --batch-mode --no-transfer-progress -f app/api/pom.xml clean verify` with permitted process retry | **PASS**, exit 0; **659 discovered, 580 executed, 79 skipped; 0 failures/errors**. The skips are 23 Docker cases and 56 local opt-in descriptors. |
| `python -B scripts/verify-postgres-acceptance.py --maven-outcome success` after fresh full run | **BLOCKED**, exit 1; mandatory 23-case PostgreSQL suite SKIPPED, no database execution evidence. Maven PASS is not migration acceptance. |
| `python -B -m unittest discover -s scripts -p test_verify_postgres_acceptance.py` | **PASS**, **20**, zero failures/skips. Synthetic guard fixtures are not DB execution. |
| Existing `js-yaml` parsing/single-Maven-job/permissions check | **PASS**. |
| `mvn ... '-Dtest=*LocalPostgresTest' test`, qualified PG16 | Initial **FAIL**, 60 discovered / 52 executed / 8 skipped, 1 failure / 0 errors: only the new timestamp-representation assertion failed; other **51 PASS**, including the restricted-principal case. |
| Focused corrected `PlatformBootstrapLocalPostgresTest#continuousAuthenticatedTwoTenantHttpJourneyUsesPersistedState` | **PASS**, exit 0; **1 executed**, no failures/errors/skips, **59 HTTP requests** through all phases. |
| Separate `OwnerOnboardingLocalPostgresTest` | Initial **SKIPPED**, eight cases, wrong environment-variable selection; corrected `OWNER_ONBOARDING_TEST_DATABASE_URL` on a fresh minimal fixture: **PASS**, exit 0; **8 executed**, zero failures/errors/skips. |
| `npm run verify:frontend` | **FAIL**, exit 1 at ordinary Operations Firebase validation; preceding stages below PASS; ordinary Customer starter **NOT RUN** after chain stops. |
| Aggregate's root typecheck/lint/tests | **PASS**, **2,039 Vitest / 172 files + 52 Node = 2,091 tests**, zero failures/skips; includes seven new Firebase cases. |
| Aggregate's `npm run build:web` | **PASS**, both Admin and Guest production builds. |
| A/B app/environment resolves | **PASS**, **12/12** offline plans; [plans](qa/uxi-13a/mobile-plan-summary.json). |
| Isolated development Android JavaScript exports | **PASS**, **4/4**; Operations 1,739 modules / 4,980,247 bytes each; Customer 1,394 / 3,861,568 each; [results](qa/uxi-13a/mobile-check-results.json), [bundle hashes](qa/uxi-13a/mobile-js-artifacts.json). |
| Modified remote PostgreSQL CI | **NOT RUN**, pending first authorized run of these changes. |
| Hosted schema/principal/Auth/FCM, signed install, device/visual/media acceptance | **NOT RUN / BLOCKED**, unchanged independent gates. |

Full Maven includes authorization/security, QR idempotency, Owner-only logo/Featured/team, branding, catalog and accounting regressions. [Backend command ledger](qa/uxi-13a/backend-results.json) and [initial per-suite results](qa/uxi-13a/initial-local-suite-results.json) retain the failed/skipped attempts as well as their resolution. **60 distinct local database cases ultimately passed across the qualified runs** (51 initially successful, one corrected journey, eight separately enabled Owner cases); no aggregate rerun is misrepresented as having passed. Local database results must be read with their PG16 compatibility qualification. Repeated/overlapping commands are not added as distinct end-to-end successes. The four isolated exports reuse the examined UXI-13 harness with new task-owned output paths, dotenv disabled and notifications false **only in child development-fixture environments**; they do not replace normal frontend verification or change production policy.

## 9. Reproduction

For exact acceptance, use a working Docker engine (GitHub's existing Ubuntu job suffices), JDK 21, Maven and Python 3. From repository root:

```sh
python -B -m unittest discover -s scripts -p test_verify_postgres_acceptance.py
mvn --batch-mode --no-transfer-progress -f app/api/pom.xml clean verify
python -B scripts/verify-postgres-acceptance.py --maven-outcome success
```

If Maven fails, run the guard with `--maven-outcome failure` to retain the truthful failure summary. CI always does this with the actual step outcome. For a focused container run use `'-Dtest=PostgresMigrationSchemaTest'`; it runs the same migration/legacy/schema/transaction/journey/principal fixture. A focused command does not replace full verification.

Without Docker, ordinary Maven may succeed with explicit skips; the guard is expected to fail closed. For the existing opt-in local checks, provision a **new disposable loopback database**, apply the reviewed fixture/migration prerequisites and set `ACCOUNTING_TEST_DATABASE_URL=jdbc:postgresql://127.0.0.1:<port>/accounting_verify`. Run `mvn --batch-mode -f app/api/pom.xml '-Dtest=*LocalPostgresTest' test`. The separate Owner suite requires an **empty** fresh `owner_onboarding_verify` database and its separate variable `OWNER_ONBOARDING_TEST_DATABASE_URL=jdbc:postgresql://127.0.0.1:<port>/owner_onboarding_verify`; run `'-Dtest=OwnerOnboardingLocalPostgresTest'`. It prepares its own minimal fixture and must not reuse the complete application schema. These existing local wrappers use a synthetic `postgres` principal/empty fixture password and must never target a hosted or developer database. The focused new cases are `PlatformBootstrapLocalPostgresTest#continuousAuthenticatedTwoTenantHttpJourneyUsesPersistedState` and `RestrictedPrincipalLocalPostgresTest`.

Run ordinary `npm run verify:frontend` for frontend release checks. A safe diagnostic reproduction is the existing `npm run build:mobile:starter`; synthetic diagnostic tests are `node --test configs/restaurants/tests/firebase-android.test.cjs`. Preserve the ordinary Firebase failure until the operator supplies the matching client. Isolated JS exports are separately labelled regression evidence only.

## 10. Remaining blockers and UXI-13B prerequisites

| Prior blocker | UXI-13A disposition / remaining prerequisite |
| --- | --- |
| **B01 / P0** continuous A/B + hosted parity | Continuous synthetic Spring journey **PASS (59 HTTP requests, qualified PG16)** and mandatory CI delegate added. Real hosted ledger/principal, provider identity lifecycle, complete client/device bridge remain **BLOCKED**. |
| **B02 / P0** exact PG17 migrations | Baseline 21 cases proven executed; fail-closed 23-case gate implemented and locally tested. Modified exact-source PG17 execution/version/hash artifact **NOT RUN / pending CI**; local target unavailable. |
| **B03 / P1** Firebase | Precise missing-package-client diagnosis and seven regression tests added. Matching client unavailable: **BLOCKED**; normal aggregate remains **FAIL**. |
| **B04 / P1** native/provider | **BLOCKED / NOT RUN**: approved signed staging binaries, devices, providers/App Links, keyboard/TalkBack/200% font acceptance still required. |
| **B05 / P1** pilot media/domains | **BLOCKED**: approved original/hash→actual UUID mapping, publication/artwork/palette/hosts; no real upload or tenant mutation. |
| **B06 / P1** visual/localization/accessibility | **BLOCKED**: independent design/linguistic/native focus/reflow acceptance; previous DOM evidence not relabelled native. |
| **B07–B09 / P2** known contracts/deferred scope | **UNCHANGED**: catalog/settings revision limits, recovery/provider-call limits, assignment/address-book/race/geography boundaries and explicitly deferred features remain separate decisions. No new API/state/financial feature introduced. |

Recommended UXI-13B entry inputs: a successful reviewed **modified** PostgreSQL 17 artifact; matching approved Firebase clients with existing package/signing identity; approved disposable hosted API/database and read-only ledger/grant evidence; synthetic provider identities authorized for real lifecycle acceptance; approved signed-device/provider/accessibility/visual plan. Pilot media/publication/domain approval remains separately required. These are prerequisites only; UXI-13B/14 were not started.

## 11. Preservation and acceptance decision

**PASS.** Branch and HEAD remain unchanged; staged diff is empty. All seven Postman files retain their initial hashes, all 35 source migrations retain their hashes, and existing UXI-13 artifacts are unchanged. [Final preservation](qa/uxi-13a/final-preservation.json) records the checks. [Cleanup](qa/uxi-13a/cleanup.json) confirms PostgreSQL stopped (`pg_ctl status` exit 3), the validated task-owned PG16 cluster directory removed, and the journey's HTTP/JWKS/context cleanup completed. The failed PG18 initialization left no running server. Only task-owned disposable fixtures were removed; no existing developer/hosted database or user file was reset/deleted.

**Local source regression acceptance** applies only to the completed successful checks listed here. **Modified exact PostgreSQL 17 CI acceptance remains pending. Hosted/staging/production/native-provider acceptance remains BLOCKED / NO-GO.** No hosted migration, real invitation/restaurant/order/payment/refund/media/QR action, Figma edit, signing/native identity change, database reset, commit, push, merge or deployment occurred. UXI-13A stops after implementation, verification and this report.
