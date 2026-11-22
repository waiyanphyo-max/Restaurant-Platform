# UXI-13 backend, authorization, accounting and migration evidence

Audit date: 22 November 2026, Asia/Bangkok. Baseline HEAD: `c8659e40c27606ae137ae8cb5befa7aadd0079c5`, branch `uxi/13-integrated-qa`. This is local synthetic acceptance, not staging/production certification. No backend implementation, business contract, authorization rule or source migration was changed.

## Environment and commands

| Capability | Classification | Actual observation |
| --- | --- | --- |
| Spring Java/Maven verification | AVAILABLE | Installed Oracle JDK 21.0.6 at `C:\Program Files\java\jdk-21`; Maven 3.9.9 under the existing `.m2/wrapper/dists` cache. Both were initially outside PATH; only child-process environment paths were set. |
| Docker/PostgreSQL 17 Testcontainers | UNAVAILABLE | Docker executable is installed, but `docker version --format '{{.Server.Version}}'` exits 1 because `dockerDesktopLinuxEngine` does not exist. The repository's `postgres:17-alpine` suite retains its existing Docker skip gate. |
| Disposable PostgreSQL 18.0 | BLOCKED | Installed binaries report 18.0. Fresh workspace-only `initdb --auth=trust --encoding=UTF8 --locale=C` exits 1 in post-bootstrap initialization with Windows `0xC0000005`, both sandboxed and approved retry. No migration was applied to this failed cluster. |
| Disposable PostgreSQL 16.4 | AVAILABLE, limited | A newly initialized cluster bound only `127.0.0.1:55413`; no system service or preexisting database was used. Source compatibility qualification is below. |
| Hosted/staging API/database/metadata | BLOCKED | No approved disposable hosted target or authorized read-only metadata session is available. No hosted credential or real record was used. |
| Actual hosted Spring DB principal | BLOCKED | Local JDBC tests use the synthetic cluster's `postgres` superuser. This proves neither least privilege nor deployed-role access. |

The initial sandboxed Maven run was interrupted after Mockito's attach pipe failed (`could not open (5) pipe ... javatool...`), before a result could be certified. The approved rerun uses unchanged tests and completes normally. It is the completed run below, not the stalled run, that supplies the baseline counts.

| Executed command/check | Outcome | Evidence |
| --- | --- | --- |
| `mvn --batch-mode -f app/api/pom.xml clean verify` | PASS, exit 0; **655 discovered, 580 executed, 75 skipped; 0 failures/errors** | `maven-clean-verify-retry.log`; [per-suite summary](maven-baseline-suite-summary.json) |
| PostgreSQL 16 temporary compatibility chain | PASS in qualified scope, exit 0; **35 migrations, 62 public tables** | `pg16-migrations.log`; [source hashes and copy differences](migration-source-inventory.csv) |
| `mvn --batch-mode -f app/api/pom.xml '-Dtest=*LocalPostgresTest' test`, explicit disposable `ACCOUNTING_TEST_DATABASE_URL` | PASS, exit 0; **58 discovered, 50 executed, 8 skipped; 0 failures/errors** | `maven-pg16-local-integration.log`; [per-suite summary](maven-pg16-local-suite-summary.json) |
| Separate `mvn --batch-mode -f app/api/pom.xml '-Dtest=OwnerOnboardingLocalPostgresTest' test`, explicit fresh `owner_onboarding_verify` | PASS, exit 0; **8 executed, 0 skipped/failures/errors** | `maven-pg16-owner-integration.log`; [summary](maven-pg16-owner-suite-summary.json) |
| Actual executable Spring JAR + PostgreSQL public HTTP smoke | PASS, exit 0; **13 assertions**, including A/B identity/catalog/palette/currency, health, anonymous finance denial and no-store | [HTTP results](spring-public-http-smoke.json), `spring-http-stdout.log` |
| Exact unchanged migration suite on PostgreSQL 17+ | **BLOCKED**; 21 Docker cases SKIPPED in default Maven run | `PostgresMigrationSchemaTest.java`; failed PG18 initialization logs |
| Hosted SQL, invitations, real QR/order/money/provider operations | NOT RUN; outside scope | No hosted or real-tenant action performed |

Skipped parameterized classes report one descriptor per method before execution; enabling their fixtures expands parameterized cases. Therefore the default run's 54 local skip descriptors become 58 discovered local cases. Counts across these commands overlap and must not be summed as unrelated tests. Expected SQL constraint exceptions are negative assertions, not failed tests.

Raw `.log` files are ignored local execution artifacts, retained alongside the structured summaries. No secrets from environment/provider files were copied into this report.

## Current security contracts

`SecurityConfig.java` validates signed JWT issuer/audience/timestamps/UUID subject, whitelists only explicit public method/path pairs, and defaults other paths to authenticated. `RestaurantAuthorization.java` derives the subject from `JwtAuthenticationToken`, queries membership for the requested restaurant, and scopes delivery access by restaurant and assignment. JWT role strings, client restaurant headers and frontend navigation do not grant backend authority.

All tests cited below are under `app/api/src/test/java/com/restaurant/platform/`; corresponding implementations are under `app/api/src/main/java/com/restaurant/platform/`.

| Principal/control | Fresh evidence | Acceptance and limit |
| --- | --- | --- |
| Platform Admin | `security/PlatformAdminAuthorizationTest`, `config/PlatformAdminEndpointsHttpIntegrationTest`, `controller/PlatformRestaurantBootstrapHttpTest`, provisioning/lifecycle service tests | Server UUID allowlist and fail-closed empty configuration; restaurant roles cannot grant bootstrap/provisioning access. External Auth behavior is mocked. |
| Owner/Manager scoped brand/catalog | `controller/RestaurantBrandingHttpTest`, `service/CatalogManagementServiceTest`, local runtime/Featured/bootstrap suites | Owner/Manager palette/catalog permissions and foreign-tenant refusal; public brand DTO excludes private settings/QR/owners/finance. |
| Owner-only logo/Featured | `controller/RestaurantProfileLogoHttpTest`, `controller/FeaturedProductHttpTest`, logo/Featured service tests | Manager/Staff/Driver cannot mutate editorial selection or logo; general profile PUT cannot bypass upload authority. Platform Admin alone is insufficient for Owner Featured. |
| Owner-only team/transfer | `config/OwnerOperationsHttpIntegrationTest`, `service/RestaurantMemberServiceTest` | Manager assignment options do not confer member administration. Transfer verifies actual current Owner and same-restaurant existing target; ordinary member writes cannot assign/remove Owner. |
| Staff cancellation | `service/ManagerOrderServiceTest`, `service/OrderCancellationServiceTest`, `integration/DeliveryCancellationLocalPostgresTest` | Actual role enum includes `ORDER_CANCEL_EARLY_UNPAID` without general `ORDER_CANCEL`; unpaid early-state checks, reason, reserved-stock release and payment disposition are enforced. Paid/settled evidence requires refund review. |
| Driver/Staff assigned delivery | `security/RestaurantAuthorizationTest`, `service/AssignedDeliveryServiceTest`, `service/DeliveryServiceTest`, real delivery local tests | Assigned-to-self location access, revoked assignment, stale revision and foreign resource denial; management has separate restaurant-wide permissions. |
| Owner/Manager finance versus Staff/Driver | `accounting/AccountingHttpIntegrationTest`, `AccountingSupportTest`, actual `AccountingLocalPostgresTest.sharedManagerAccounting` | Real Spring guards protect ledger/report/receipt/CSV/postings; Staff/Driver denied independently of UI hiding and forged role claims. |
| Anonymous/expired/foreign auth | `config/SecurityConfigHttpIntegrationTest`, `config/SecurityConfigJwtValidatorTest`, endpoint HTTP tests | Synthetic signed-key signature/expiry/issuer/audience checks plus HTTP 401/403/404 behavior; hosted Supabase-issued token lifecycle not exercised. |
| Customer subject and foreign references | customer profile/address/history/controller tests and real customer local suites | JWT subject controls private profile/address/order access; new branded history/checkout also scope restaurant. |
| Public privacy/errors | branding/logo HTTP tests, `common/error/GlobalExceptionHandlerTest`, assigned delivery and customer history tests | Public projections/unauthorized errors do not reveal private records; Staff preparation DTOs redact unrelated delivery/customer fields. |
| Membership revocation / role change while already pending | Source entry-point membership lookups; delivery reassignment revocation tests | **PARTIAL:** no deterministic existing backend acceptance was found proving revocation/role-change races against every already-running mutation. Per-request lookup and frontend disposal are not blanket in-flight revocation proof. Security/backend QA owns targeted concurrency acceptance before release. |

The role-matrix document is historical supporting material; current `RestaurantRole.java` additionally includes Staff early-unpaid cancellation and operational delivery-detail grants. Current source/tests are authoritative.

Customer addresses belong to the **JWT subject's global address book**, not a restaurant-partitioned address table. Separate customers have separate private address books; a single customer can use their own saved destinations across restaurants. Restaurant-scoped Customer order/history routes additionally require restaurant identity. This audit does not certify stronger restaurant-private partitioning of one person's address book or change that domain. Product/security must explicitly resolve any stronger launch requirement.

## Real database journeys versus mocks

`PlatformBootstrapLocalPostgresTest` executes `PlatformBootstrapDatabaseChecks` against actual JDBC/JPA transactions. A and B use random new restaurant/product/user UUIDs. A is **Synthetic San Thaw Tar example**, MMK, runtime `#A51D22 / #FCEAE7 / #FFF8F0`; B is **Synthetic Blue Lotus Kitchen**, THB, initially `#123B70 / #DDEEFF / #F4FAFF`, later Manager-updated `#234D3C / #E8EEDB / #FFFFFF`. Each has separate synthetic Owner/Manager identities. A has six synthetic dish-name products, variant and required modifier option; B has an independent pumpkin bowl. No production UUID/media record is reused.

The executed workflow validates allowlisted operator without fabricated restaurant membership; palette initialization; category/product/variant/modifier bootstrap; foreign category/product and wrong-currency rejection; manifest review remaining PENDING; complete/review checkpoints; Owner account-setup blocker; direct synthetic account marker; Owner edits invalidating review; handoff closing new bootstrap writes; Owner/Manager edits; and independent public menu/brand refresh. Concurrency cases validate keyed retries, rollback and stale-manifest review/replay. Auth Admin results are fixture ports, and account markers are synthetic repository writes: this does not prove a real mailbox/verified-password provider lifecycle. Separate suites cover Staff, editorial Featured, addresses/orders and financial isolation; these are not a fabricated single uninterrupted A/B session.

| Journey | Fresh executed evidence | What remains unproven |
| --- | --- | --- |
| Common/Table QR | `service/QrGuestCheckoutTest`, `service/QrOrderIdempotencyServiceTest`, `config/PublicQrGuestHttpIntegrationTest`; actual `DeliveryCancellationLocalPostgresTest.parallelCommonQrOrdersAllocateSeparateTenantQueuesAndReplayTheOriginalReceipt` and `.tableQrAndStaffOrdersUseTheSameCounterPaymentDisposition` | Physical scanning/installed native flow; provider/staging environment |
| QR rotation / invalidation | `QrGuestCheckoutTest.rotatedCommonTokenFailsBothPreflightAndCheckout`, `.rotatedOrDisabledTableFailsBothPreflightAndCheckout`, foreign-tenant capability tests | Current QR schema has rotation/revocation, **no wall-clock QR expiry**. The 24-hour idempotency replay retention is not credential expiry. |
| Customer quote/durable checkout/COD | `integration/CustomerDeliveryLocalPostgresTest`: concurrent original-key checkout, quote changes/abandonment, saved text/null-coordinate snapshots, delivery assignment/reassignment, pickup/explicit COD completion/accounting | Real email, map/GPS, signed-device persistence/provider behavior; native recovery evidence belongs to client/device QA |
| Cancellation/collection race | Real `integration/DeliveryCancellationLocalPostgresTest`: parallel counter collection/cancellation, explicit reservation history, paid refusal, injected write failure rolling back stock/payment/history | Hosted load/latency and native error presentation |
| Queue readiness/call/physical collection | queue/manager/payment service tests and corresponding local orders | Source keeps kitchen completion, READY/CALLED, physical pickup and payment separate; device acceptance remains separate |
| Canonical geography | `integration/GeographicLocationLocalPostgresTest` five cases; shared HTTP/controller/service tests | Actual GPS/map provider/native integration and approved legacy-data mapping |

## Financial precision, history and reports

The default Maven run executes Spring HTTP authorization/validation plus exact-domain unit tests. The qualified real PostgreSQL run executes accounting (7), private receipt (1) and procurement (4) cases, plus related checkout/collection effects. `AccountingDatabaseChecks`, `ProcurementLocalPostgresTest` and the local delivery/cancellation suites verify actual transaction behavior, not frontend simulation.

| Concern | Executed/source evidence | Result in local qualified scope |
| --- | --- | --- |
| Sales versus actual collections/outstanding | `AccountingDatabaseChecks.salesCashClosingAndReport`; `SalesAccountingService` independent aggregation | PASS: created-order cohort and dated payments remain separate; unpaid/digital collections do not create physical cash |
| Historical price/modifier/supplier snapshots | Actual accounting/procurement checks; immutable migration triggers | PASS: current catalog edits do not replace stored history; absent historical labels/actors remain unknown |
| Plans versus actual purchases | shopping contract/real plan transactions and `20261115091000` separation | PASS: quantity/unit planning creates no payment/obligation; historical valued plans preserved |
| Supplier obligations/payments | Actual procurement payment/reversal/cancellation/detail/CSV checks | PASS: canonical purchase-payment rows, cap and correction histories retained |
| Expenses/payments/recurrences | `AccountingDatabaseChecks.expenseCorrectionsAndCashHistory`, `ExpenseCashServiceTest` | PASS: recorded expense differs from dated settlement; templates require explicit confirmation |
| Refunds/reversals/immutable audit | Actual sales/cash checks, concurrency/tenant checks and append-only triggers | PASS: original collection/refund retained; dated correction restores capacity without erasing event |
| Consolidated physical cash / opening/closing | Actual accounting close/carry-forward/history cases | PASS: driver-held restaurant cash is part of consolidated balance; opening/variance/closed-period locks and reasoned corrections preserved |
| Exact amount above JS safe integer | `AccountingSupportTest.exactValuesSurviveJsonAndRejectFractionalCurrency` uses **9007199254740993**, asserts exact JSON string, rejects fractional whole currency and signed-64-bit overflow | PASS for Java/JSON; SQL precision smoke is separately recorded below; native display/share not proven by this test |
| Day/month/year and ranges | `AccountingSupportTest.localCalendarBoundariesRespectDstAndLeapYears`, actual report checks | PASS within tested cases; maximum 366-day range, exact 23/25-hour DST boundaries and whole-currency convention |
| Private CSV | Spring finance export denial tests; actual sales/purchase CSV history checks; formula/quote escaping unit test | PASS server/client contracts; no installed-device filesystem/share cleanup acceptance |
| Durable purchase-attempt recovery | Current Purchasing client original-body/key/store tests audited by frontend team | Separate client evidence; no universal restart durability for every money form |

COGS, recognized profit, inventory valuation, tax, double-entry, Trial Balance and Balance Sheet are not certified or synthesized. Report `costOfGoodsSold/grossProfit/netOperatingProfit` remain unavailable/null where documented. Trading payment net is not profit. Recorded synthetic refund tests initiate no real provider transfer.

## Migration ordering, constraints and principal limitations

[migration-source-inventory.csv](migration-source-inventory.csv) lists every migration name, SHA-256 and temporary-copy qualification. All **35** names have unique 14-digit ordered timestamps. Source chain starts `20261010204938_create_initial_schema.sql` and ends `20261120100000_add_restaurant_featured_product.sql`.

The local PG16 path removed only the unsupported `MAINTAIN,` privilege token in **two temporary copies**: `20261016051330_remote_schema.sql` and `20261016052430_revoke_unneeded_table_privileges.sql`. The other 33 copied files are byte-identical. All runtime branding/bootstrap/Featured/accounting/geography source migrations were applied unchanged. Supabase prerequisites were local NOLOGIN `anon/authenticated/service_role`, synthetic `auth.users`, `auth`/`extensions` schemas and pgcrypto, matching the existing Docker fixture approach. The database has 62 public tables. This fixture cannot certify PG17 `MAINTAIN` privileges, hosted Auth/Storage extensions, actual service grants or the exact chain.

| Control | Observed evidence |
| --- | --- |
| Runtime branding UXI-02 | `20261119090000`: restaurant PK/FK, three hex color constraints, bounded revision; RLS enabled, all direct PUBLIC/anon/authenticated/service_role table privileges revoked; actual local constraints/privileges and concurrent initialization/writes tested |
| Bootstrap UXI-04 | `20261119100000`: restaurant FK, unique tenant/key and tenant/step-index, kind/hash/result checks; private receipts/RLS/revoked direct clients; real concurrent replay/rollback/stale review tested |
| Featured UXI-05 | `20261120100000`: tenant-keyed row with composite `(product_id, restaurant_id)` FK, explicit clear and bounded revision; RLS and direct service/client revocations; actual foreign-product/concurrent selection/rollback checks |
| Tenant links | Initial catalog/order/queue/modifier composite FKs; accounting suppliers/receipts/purchases/payments scoped references; canonical geography full-chain constraints; actual negative SQL tests |
| RLS versus grants | Client-role `SET ROLE`/`has_table_privilege` assertions prove expected denials in this fixture. Geography has intentionally limited active-row read policies. Database owner/superuser bypass is a different boundary. |
| Spring principal | `application.yml` uses server-only datasource environment properties and `ddl-auto: validate`; no startup migration runner. Tests run as `postgres`, `rolsuper=true`, `rolbypassrls=true`. Actual deployed restricted role/schema/auth.users rights are **BLOCKED**, not certified by these passing tests. |
| Compatibility and rollback | Forward-only chain; preserve existing IDs, snapshots, QR/request/receipt ledgers. No assumed down-SQL/reset. The shopping-separation migration makes legacy valuation rows immutable; old API shopping writers are not safe rollback binaries. Avoid mixed old/new planning APIs. Use specifically schema-compatible rollback or reviewed forward repair/backup restoration. |

The fresh empty-schema fixture tests SQL schema/transaction behavior. The Docker suite additionally seeds a specific legacy shopping dataset before separation; that entire exact PG17 seeded upgrade path was not reproduced here and remains a release gate. No hosted migration ledger or real upgrade dataset was inspected/applied.

## Open backend release gates

1. Database/CI: exact unchanged PostgreSQL 17+ chain and seeded upgrade cases; hosted version/ledger parity and actual Spring-principal access. PG16 compatibility PASS cannot close this gate.
2. Platform/auth/QA: approved synthetic staging identities and actual verified-owner/customer email lifecycle; continuous API-to-client A/B workflow. Local synthetic identity ports/markers are insufficient for hosted provider acceptance.
3. Security/backend QA: deterministic role-change and membership-revocation races during pending mutation; product review of global personal address-book semantics if the launch requirement expects stronger partitioning.
4. Mobile/QA: native delivery/QR/purchase recovery/CSV/TalkBack/provider acceptance; source/API tests do not close installed-device evidence.

No backend regression requiring a source fix was proven by the completed suites. Every exclusion above remains explicit; no test was weakened or removed.

## Final execution addendum

The separate fresh `owner_onboarding_verify` database completed all eight repository tests: concurrent owner/operator cooldown reservations, durable failed-attempt throttling, idempotent completion, inactive/banned/deleted/foreign eligibility, client-role rejection and safe missing-schema behavior. Those repository tests use only synthetic local users and do not send email or contact an Auth provider. Combined with the general local run, **58 actual local-database Java cases executed** (50 + 8), without failures/errors. The default 580 executed non-local cases plus these 58 constitute 638 executed cases across overlapping runs; the 21 exact PG17 Docker cases remain SKIPPED/BLOCKED.

The actual packaged Spring Boot 4.1.1 server started on loopback port 58013 against the synthetic PostgreSQL 16.4 fixture, with provider credentials explicitly blank, Firebase sending disabled and Platform Admin allowlist empty. It passed 13 assertions: health UP; red A and blue B identity and exact palettes; MMK versus THB; independent actual persisted public menus/products; safe branding projection; anonymous accounting 401; and no-store branding/unauthorized headers. [spring-public-http-smoke.json](spring-public-http-smoke.json) retains only synthetic public projections. This is actual Spring/JPA/SQL/HTTP public evidence, distinct from mocked MVC persistence and frontend wire fixtures. It does not exercise authenticated HTTP provisioning/finance or bridge the entire client-to-Spring A/B workflow.

The SQL-only exact integer read returned `9007199254740993`, sum `9007199254741010`, and product `18014398509481986`, all as exact text; [precision/principal result](postgres-precision-principal.json) records it. The same query explicitly found `current_user=postgres`, `rolsuper=true`, `rolbypassrls=true`: those privileges are disclosed, not mistaken for hosted least-privilege acceptance. Java's exact JSON serialization is separately covered by `AccountingSupportTest`.

The Spring smoke server was stopped and `pg_ctl status` confirmed no PostgreSQL server running (exit 3). [backend-process-cleanup.json](backend-process-cleanup.json) records process cleanup. Only newly created task-owned `.tmp/uxi-13-pg16` and `.tmp/uxi-13-pg18` directories are removed after validating their absolute workspace paths. Existing files and Postman directories are preserved. No application server or database is left running by this audit.

Diagnostic reproduction scripts are retained as [reproduce-pg16-migrations.ps1](reproduce-pg16-migrations.ps1) and [reproduce-spring-http-smoke.ps1](reproduce-spring-http-smoke.ps1). They require the same explicitly disposable loopback cluster and are not hosted migration/deployment scripts. The migration script expects an empty cluster prepared with local `initdb`/`pg_ctl`; it deliberately refuses existing `accounting_verify` rather than resetting it. The HTTP script expects that pre-migrated test database and the locally built JAR. All such fixtures must be recreated separately before rerunning; the completed execution logs and structured results above remain the acceptance evidence.
