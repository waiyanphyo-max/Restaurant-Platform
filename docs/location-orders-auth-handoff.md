# Location, order and email confirmation handoff

Continuation of the existing local implementation on `rebuild/build-for-device-testing`, in `C:\RestaurantManagementSystem\Restaurant-Platform`. The working tree is the source of truth. Existing edits, untracked files and the staged `san-thaw-tar` configuration are preserved. No commit, push, merge, deployment, hosted migration or live Supabase Auth change was performed.

## A. Completed Features

| Feature | Implemented behavior and principal files |
| --- | --- |
| Myanmar reference hierarchy | `geo_regions → geo_districts → geo_townships`, deterministic source identities, foreign keys, indexed parent queries, inactive-record filtering and read-only reference APIs. See `GeographicLocationService.java`, `GeographicLocationController.java`, the three geographic migrations and `scripts/geography-import.cjs`. |
| Canonical selection | Both apps have searchable cascading `src/components/LocationSelector.tsx` controls with loading, retry and empty states. Region changes clear District/Township; District changes clear Township. `AddressScreen.tsx`, `address.ts`, `destination.ts`, `CheckoutScreen.tsx` and the Operations `DeliveriesScreen.tsx` zone editor submit hierarchy IDs. |
| Delivery eligibility and snapshots | Server validates the entire active hierarchy, matches restaurant zones by Township ID, calculates fees/minimums and preserves quote confirmation, stock checks, COD, idempotency and receipt recovery. Saved addresses remain owned by the customer. New orders keep canonical IDs, individual address components and a complete readable snapshot. Maps/GPS remain optional. See `CustomerAddressService.java`, `DeliveryZoneManagementService.java`, `CustomerDeliveryCheckoutService.java`, `OrderService.java`, and `Order.java`. |
| Operations visibility | Paginated cards show historical products, variants, quantities, modifiers, instructions, totals/time and complete delivery destination/contact details for authorized restaurant handlers. Items, modifiers and cancellation eligibility are batch-loaded; summaries omit full status/payment histories. See `ManagerOrderService.java`, `OrderSummaryDto.java`, `ManagerOrderDetailDto.java`, `OrdersScreen.tsx`, `OrderAddress.tsx` and `OrderDetailScreen.tsx`. |
| Three kitchen actions | `POST /api/v1/restaurants/{restaurantId}/orders/{orderId}/actions` accepts `ACCEPT`, `COMPLETE`, `CANCEL`, with `expectedStatus` and optional `reason`. Transitions are atomic and record one history entry. Delivery Complete means READY, with pickup/delivery/COD separate. Queue pickup remains separate. See `OrderActionRequest.java`, `OrderCancellationService.java`, `OrderCardActions.tsx`, `workflows.ts` and `QueueScreen.tsx`. |
| Authorization and cancellation | Explicit delivery-detail permission grants restaurant owner/manager/staff access; drivers retain assigned-delivery access. Staff cancellation is limited to unpaid PENDING/ACCEPTED orders. Cancellation requires 10–500 meaningful characters. Collected/settled payment evidence blocks kitchen cancellation, including inconsistent pending payments with collection timestamps/actors. No action issues refunds or marks cash collected. |
| Customer confirmation return | Signup/resend use the same validated build-scoped redirect. Confirmation returns to Customer sign-in without importing a session. A reviewed stable HTTPS callback supports a token-free app handoff and missing-app fallback. Native routing rejects wrong schemes/tenants and unsafe links. Owner/admin recovery routes remain intact. See Customer `AuthPanel.tsx`, `native.ts`, `confirmation-link.ts`, `app/email-confirmation.tsx`, shared `configs/restaurants/customer-confirmation.ts`, and Guest Web's `auth/customer-confirmation/[environment]/[slug]` page. |

The complete changed-file inventory, including preserved pre-existing local files, is [location-orders-auth-files.md](location-orders-auth-files.md). Additional architecture, ERD and contracts are in [location-orders-auth-implementation.md](location-orders-auth-implementation.md), [geographic-master-data.md](geographic-master-data.md), [operations-order-actions-20261116.md](operations-order-actions-20261116.md), and [customer-email-confirmation.md](customer-email-confirmation.md). Final execution evidence is recorded in section C and the linked verification report.

## B. Fixed Remaining Issues

| Issue identified during final integration/continuation | Resolution |
| --- | --- |
| Customer delivery-zone responses lacked canonical identity used by checkout | `OrderService.listCustomerDeliveryZones` now returns Region/District/Township IDs and Region/District names alongside existing fee/minimum/coverage fields. Matching remains server-authoritative. |
| Legacy delivery creation needed a readable Township without inventing confirmed-checkout metadata | New orders capture a separate immutable `delivery_township_name`. `Order.getDeliveryTownship()` preserves the original historical value when present and otherwise exposes the canonical snapshot. Region uses the corresponding safe fallback. Existing quote/idempotency snapshot constraints remain intact. |
| Old assertions omitted District in the formatted address | Fixtures/assertions now expect the complete details → Township → District → Region snapshot. Historical rows are not rewritten. |
| Integration fixture omitted the geography service | The relevant test application explicitly imports `GeographicLocationService`; production validation remains enabled. |
| Minhla fixture assumed ambiguity despite a specified Region | The fixture now reflects hierarchy-scoped exact matching. Same names across different regions are not globally ambiguous; within-region ambiguity remains rejected. |
| Collected counter cash could coexist with cancellation under the older policy | Cancellation now rejects collected/settled evidence before payment/stock writes. The collection-versus-cancellation race test asserts the winning transaction: collection wins → `REFUND_REQUIRED`; cancellation wins → `CANCELLED_ORDER_PAYMENT`. |
| Legacy COD settlement used a weaker payment predicate than new staff/card checks | COD, staff and counter guards share one strict predicate: PAID/refunded state, `paidAt`, or `collectedByUserId` blocks cancellation. Focused regressions cover inconsistent PENDING rows and refunded histories. |
| Generic exception mapping turned unsupported methods into HTTP 500 | Unsupported methods preserve HTTP 405; geographic data still has no write route. |

No assertions were removed to bypass geography, tenant, payment, stock, snapshot or idempotency checks. The corrected fixtures passed targeted checks and the final full verification run.

## C. Tests and Verification

Final continuation verification completed on 16 November 2026 (Asia/Bangkok). All implemented-code checks passed. The 13 skips are exclusively the existing PostgreSQL 17 Docker/Testcontainers migration suite because no valid Docker engine was available.

| Final check | Discovered | Passed | Failed | Skipped | Final status / evidence |
| --- | ---: | ---: | ---: | ---: | --- |
| Complete Spring Boot Maven `verify` | 546 | 533 | 0 | 13 | **BUILD SUCCESS**; `target/continuation-backend-verify.log`, Surefire XML aggregate |
| PostgreSQL integration cases included above | 50 | 50 | 0 | 0 | Fresh PG16.4 cluster on `127.0.0.1:55488`; accounting, profile/address, checkout, cancellation, geography and owner-onboarding cases |
| Fresh chronological migration files | 32 | 32 | 0 | 0 | `target/continuation-qa-20261116/migrations.log`; all four pending migrations executed unchanged; legacy preservation assertions passed |
| Seed repeatability and source audit | 3 | 3 | 0 | 0 | One PostgreSQL seed-repeat test plus two import-script tests, already included in aggregate rows |
| All frontend/package/root script tests (`npm test`) | 1,251 | 1,251 | 0 | 0 | Fresh post-contract rerun; `target/continuation-frontend-tests.log` |
| Shared/consuming workspace TypeScript checks | — | — | — | — | **PASS**; `target/continuation-typecheck.log` |
| All workspace ESLint checks | — | — | — | — | **PASS**; `target/continuation-lint.log` |
| Customer Android Hermes JavaScript export | — | — | — | — | **PASS**, 1,379 modules / one Hermes bundle; final `dist-starter/metadata.json` |
| Operations Android Hermes JavaScript export | — | — | — | — | **PASS**, 1,706 modules / one Hermes bundle; final `dist-starter/metadata.json` |
| Guest Web production build | — | — | — | — | **PASS** on the unchanged current Guest source before continuation; final 229 tests/typecheck/lint rerun; production build itself not repeated |
| Existing tracked migration preservation / `git diff --check` | — | — | — | — | **PASS**; only new forward SQL files, no tracked migration modifications |
| Real Android device, live email inbox, hosted Supabase | — | — | — | — | **NOT PERFORMED**; manual acceptance below |

Frontend breakdown: UI tokens 2; API client 111; restaurant configuration 8; Admin Web 171; Guest Web 229; Operations 334 (328 Vitest + 6 Node); Customer 386 (378 Vitest + 8 Node); root scripts 10. Shared types have no standalone runtime test script; their contracts and consuming apps passed TypeScript checks. Both Android exports were rerun after the final contracts; evidence is `target/continuation-android-exports.log`.

The fresh cluster is `target/continuation-qa-20261116/data`. Every migration ran in timestamp order. PG16 required temporary copies of two old baseline privilege migrations with only PostgreSQL 17's unsupported `MAINTAIN` grant removed; all four pending text-only/geographic migrations ran directly from the unchanged repository files. The hash ledger is `target/continuation-qa-20261116/migration-hashes.json`. Legacy address text/identity, historical order snapshots, safe zone identity backfill and candidate review were asserted. A PostgreSQL 18 bootstrap attempt failed locally with Windows exception `0xC0000005` (`initdb.log`); the working PG16 installation supplied the successful fresh verification. This local binary issue did not block final tests. The exact PG17 Docker matrix remains unverified.

The aggregate Maven result includes its PostgreSQL cases; do not add them twice. The aggregate frontend result includes individual workspaces; do not add focused reruns again. Docker/Testcontainers skips, if any, must state their exact reason even when equivalent local PostgreSQL checks passed. A PG16 run with temporary adaptations for older PG17-only `MAINTAIN` grants does not establish the PG17 Docker matrix. Repository migrations must remain unchanged.

Final detailed outcomes are also recorded in [location-orders-auth-verification.md](location-orders-auth-verification.md). Any earlier loopback restriction or fixture failure is an intermediate result; retain its explanation and identify the successful rerun rather than hiding it as a skip.

Reproduction commands, after preparing only disposable loopback test databases and their existing documented test credentials:

```powershell
Set-Location 'C:\RestaurantManagementSystem\Restaurant-Platform'
$env:JAVA_HOME = 'C:\tools\jdk21'
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
$maven = 'C:\Users\DELL\.m2\wrapper\dists\apache-maven-3.9.9-bin\4nf9hui3q3djbarqar9g711ggc\apache-maven-3.9.9\bin\mvn.cmd'
# Restart only the retained disposable test cluster if needed.
$qaPg = 'C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe'
$qaData = Join-Path (Get-Location) 'target\continuation-qa-20261116\data'
$qaLog = Join-Path (Get-Location) 'target\continuation-qa-20261116\postgres.log'
& $qaPg -D $qaData status
if ($LASTEXITCODE -ne 0) {
  & $qaPg -D $qaData -l $qaLog -o '-p 55488 -h 127.0.0.1' -w start
  if ($LASTEXITCODE -ne 0) { throw 'Disposable PostgreSQL start failed' }
}
$qaPort = 55488
$env:ACCOUNTING_TEST_DATABASE_URL = "jdbc:postgresql://127.0.0.1:$qaPort/accounting_verify"
$env:OWNER_ONBOARDING_TEST_DATABASE_URL = "jdbc:postgresql://127.0.0.1:$qaPort/owner_onboarding_verify"
& $maven -o -B --no-transfer-progress -f app/api/pom.xml verify
if ($LASTEXITCODE -ne 0) { throw 'Backend verification failed' }
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw 'Typecheck failed' }
npm run lint
if ($LASTEXITCODE -ne 0) { throw 'Lint failed' }
npm test
if ($LASTEXITCODE -ne 0) { throw 'Frontend tests failed' }
```

The task-created QA clusters were stopped after verification; their files/logs were retained for review and the restart command above is scoped to the fresh cluster. These integration fixtures mutate/reset their test databases. Never use hosted or application customer databases for them. The accounting database must have the reviewed chronological migration chain; the optional owner-onboarding database is a separate empty fixture database. API-client HTTP integration tests need local-loopback process access. Keep passwords/keys out of logs and the repository.

## D. Database Migrations

All earlier migrations must precede these pending local files:

| Order | Filename | Purpose |
| ---: | --- | --- |
| 1 | `20261116090000_allow_text_only_customer_delivery_checkout.sql` | Preserved pre-existing text-only checkout migration; no mandatory map coordinates. |
| 2 | `20261116100000_add_geographic_master_data.sql` | Reference hierarchy, indexes/read-only privileges, nullable canonical triples, parent integrity and immutable structured order snapshot columns, including the legacy-route Township name snapshot. |
| 3 | `20261116101000_seed_myanmar_geography_v1.sql` | Deterministic audited seed and identity collision checks. |
| 4 | `20261116102000_report_legacy_geographic_locations.sql` | Backfill only confidently unique zone identities; retain labels/fees; create restricted legacy-location review view. |

**None was applied to hosted Supabase by this task.** The hosted migration ledger was not changed. A release operator must inspect that environment's existing ledger to determine which files remain pending; do not assume the pre-existing text-only file is already applied. Local fresh-database application evidence and exact PostgreSQL version belong in section C.

Use the normal migration ledger to apply each migration once in timestamp order. Do not rerun schema DDL manually. The seed itself is deterministic/repeatable for the same source and fails on conflicting identities; it does not overwrite unrelated entities. No original CareNet `import.sql` is executed. Existing tracked migrations remain untouched and rollback must not delete the forward schema or historical data.

Import findings are explicit and reviewable:

| Review item | Result |
| --- | --- |
| Source | CareNet geographic blob `bd247b556f7d77d407abceea159752e1183b4a73`, pinned in `docs/data/carenet-geography-v1.sql` |
| Rows retained | 15 Regions/States, 85 Districts, 323 Townships; 423 source-to-new-ID mappings |
| Normalization | 43 names trimmed; no invented missing places or Burmese translations |
| Parent audit | Zero invalid source parent IDs |
| Quarantine | Thayet 120/121, Tada-U 125/126, Pyigyidagun 133/134, Wundwin 138/139, Yamethin 152/153 |
| Selectability | All ten duplicate rows retain distinct IDs but stay inactive; 313 Townships selectable |
| Current boundaries | Unverified source-era administrative data; Yangon grouping, transliterations and all other boundaries require authoritative review |

The full duplicate/ambiguous-name/normalization report is [geography-import-audit.json](geography-import-audit.json); exact identity mapping is [geography-source-mapping.json](geography-source-mapping.json). Codes identify pinned source rows, not official administrative codes.

Existing customer address text and historical orders are not backfilled/relabelled. Through an authorized platform database workflow, inspect `SELECT * FROM public.legacy_geographic_location_review` for candidates, ambiguous and unmatched records. Do not place customer data in source control. Customers explicitly select/save canonical locations in Profile; owners review unmatched zones. Old installed clients can use exact unique legacy Region/Township matches; unknown, ambiguous, inactive or mismatched geography fails safely. Unrestricted legacy zones cannot authorize canonical checkout. Nullable identity triples remain staged until remediation and old-client support are formally retired.

Deployment order: review source/data → apply pending forward migrations → start compatible backend → configure/host reviewed confirmation callback and manual Supabase allowlist → distribute updated clients. Keep previous web Auth/recovery routes and old redirect entries needed by installed clients. Application rollback must use code compatible with the expanded schema.

## E. Manual Actions Required

**Supabase and callback configuration.** Follow [customer-email-confirmation.md](customer-email-confirmation.md) for the exact Dashboard procedure. Preserve the existing global Site URL and owner/admin invite/recovery URLs. Keep Email confirmation enabled. Add only exact per-environment Customer redirect URLs: development `rp-san-thaw-tar-customer-development://email-confirmation`, staging `rp-san-thaw-tar-customer-staging://email-confirmation`, production `rp-san-thaw-tar-customer://email-confirmation`. Default Confirm signup emails should use `{{ .ConfirmationURL }}` so `emailRedirectTo`/`redirect_to` is honored; do not alter invite/reset templates. Send new test emails after changes.

For an absent-app fallback, first approve and register a stable HTTPS tenant host, deploy Guest Web there with matching `GUEST_CONFIG_ENV` and public Supabase configuration, then allowlist and build with its exact `/auth/customer-confirmation/<environment>/san-thaw-tar` URL. The current Quick Tunnel and placeholder production host are intentionally not accepted as stable callbacks. No real production hostname was invented. Preserve HTTPS/no-store/no-referrer behavior and redact authentication query credentials from ingress logs. The optional token-hash template path needs separate review of all shared-project signup clients; it is unnecessary for the default ConfirmationURL flow. No hosted setting is changed automatically.

**Windows restart and device connection.** Use separate terminals. Stop only the existing task's API/Metro/Guest process using Ctrl+C in its own terminal. Preserve local environment files. Restart the API after schema/service changes; Metro restart alone cannot load Java changes. The commands below use existing approved local database/JWT/public Supabase environment values, and do not set or print secrets.

```powershell
# Terminal 1: API. Retain approved SUPABASE_DB_* and Auth environment values.
Set-Location 'C:\RestaurantManagementSystem\Restaurant-Platform'
$env:JAVA_HOME = 'C:\tools\jdk21'
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
$maven = 'C:\Users\DELL\.m2\wrapper\dists\apache-maven-3.9.9-bin\4nf9hui3q3djbarqar9g711ggc\apache-maven-3.9.9\bin\mvn.cmd'
$env:PORT = '8080'
npm run build:packages
if ($LASTEXITCODE -ne 0) { throw 'Package build failed' }
& $maven -f app/api/pom.xml spring-boot:run
```

```powershell
# Terminal 2: Operations Metro; cache-clearing restart.
Set-Location 'C:\RestaurantManagementSystem\Restaurant-Platform'
$env:RESTAURANT_SLUG = 'san-thaw-tar'
$env:MOBILE_ENV = 'development'
$env:MOBILE_ADB_REVERSE_ENABLED = 'true'
$env:MOBILE_DEVELOPMENT_API_BASE_URL = 'http://127.0.0.1:8080'
npm run start -w @restaurant-platform/operations-mobile -- --port 8082 --clear
```

```powershell
# Terminal 3: Customer Metro. Keep the configured public Supabase values.
Set-Location 'C:\RestaurantManagementSystem\Restaurant-Platform'
$env:RESTAURANT_SLUG = 'san-thaw-tar'
$env:MOBILE_ENV = 'development'
$env:MOBILE_ADB_REVERSE_ENABLED = 'true'
$env:MOBILE_DEVELOPMENT_API_BASE_URL = 'http://127.0.0.1:8080'
# Native-only confirmation return until the reviewed stable HTTPS callback exists.
$env:EXPO_PUBLIC_CUSTOMER_CONFIRMATION_URL = ''
npm run start -w @restaurant-platform/customer-mobile -- --port 8083 --clear
```

```powershell
# Terminal 4: Guest Web, using the existing approved Host/registry environment.
Set-Location 'C:\RestaurantManagementSystem\Restaurant-Platform'
npm run dev -w @restaurant-platform/guest-web
# The package script serves port 3002. It is not a stable emailed callback host.
```

```powershell
# Terminal 5: Android Platform Tools; select the intended USB device.
adb devices -l
# If more than one device is present, set its serial before reverse/launch commands.
$env:ANDROID_SERIAL = Read-Host 'Connected test-device serial from adb devices'
adb reverse tcp:8080 tcp:8080
adb reverse tcp:8082 tcp:8082
adb reverse tcp:8083 tcp:8083
adb reverse tcp:3002 tcp:3002
adb reverse --list
# Open the matching installed development clients and connect to their Metro ports.
# Token-free routing probe only; never paste live codes/tokens into the shell.
adb shell am start -W -a android.intent.action.VIEW -d 'rp-san-thaw-tar-customer-development://email-confirmation?result=returned' com.restaurantplatform.santhawtar.customer.dev
```

Accept the device's USB debugging prompt. An unauthorized/offline device must be reconnected before testing. ADB reverse is development transport; release builds require their reviewed reachable HTTPS origins. Loading Guest Web through localhost does not bypass its reviewed host/tenant resolver. If a port is occupied, identify its owning terminal/process rather than terminating unrelated work.

**Full manual acceptance — not yet performed:**

1. Owner/manager opens `san-thaw-tar` delivery settings, searches Yangon Region → East Yangon → Tamwe, sets fee/minimum and saves. Change Region and District and verify descendants reset; exercise loading, empty/search and retry behavior. Verify a legacy ambiguous zone requests review and cannot become unrestricted coverage.
2. Customer creates an email/password account, sees confirmation guidance and remains signed out. Confirm a fresh email on the phone; check the correct cold/warm branded app returns to sign-in, then sign in explicitly. Check expired/invalid/consumed links, resend, manual return, wrong tenant/environment and no automatic identity switch. Exercise missing-app fallback with the approved HTTPS host. Owner/admin recovery and existing sessions must remain unaffected.
3. In Profile, save a canonical address with recipient phone, ward, street, house/building and instructions without Maps/GPS. Open an old saved address, review its original text and explicitly select the hierarchy. Use the saved address and a separate temporary text checkout destination.
4. Add variants/modifiers/instructions and review delivery quote. Verify supported/unsupported Township behavior, mismatched hierarchy rejection, restaurant-specific fee/minimum, exact server totals and pending COD. Double tap/retry, interrupt connectivity and restart to verify one order/receipt recovery. Inspect customer history and unchanged saved/historical address snapshots.
5. Before acceptance, permitted Operations staff must immediately see all item and address/contact details. Another restaurant and unassigned driver must be denied private access. If ward/street is outside practical service area, cancel an eligible unpaid order with a meaningful reason; verify the customer notification, reservation disposition and one immutable history entry. Staff cannot cancel preparation/dispatched/settled orders or issue refunds.
6. On a fresh delivery order, Accept then Complete. Expect READY and a delivery task, no delivered event, no cash collection and pending COD. Assigned driver records physical pickup, then delivered only with actual cash confirmation. Reject missing cash confirmation, wrong driver, duplicate transitions and direct cancellation of completed/settled orders. Reconcile physical cash against accounting/history.
7. Exercise Common QR takeaway, staff counter and Table QR/DINE_IN orders. Queue orders become READY and notify on kitchen Complete; call/confirm physical pickup separately. Nonqueue fulfillment may become COMPLETED while unpaid remains unpaid. Collect counter cash explicitly. Confirm stock, queue and customer history/notifications remain consistent.

## F. APK Requirements

| Situation | Required action |
| --- | --- |
| Existing matching `san-thaw-tar` development APK with current Expo/native dependencies | Restart API and Metro with `--clear`, then reload the app. Selectors, order cards/actions and confirmation route are JavaScript changes. No new native dependency, permission, custom scheme or intent filter was added by this task. |
| Standalone installed APK that cannot load Metro | Build/distribute an updated APK containing the new JavaScript/public configuration; old bundled code will not update from a backend restart. |
| Changing `EXPO_PUBLIC_CUSTOMER_CONFIRMATION_URL` | Reload/rebundle the matching development client; rebuild/rebundle distributed standalone artifacts. URL must match the reviewed tenant/environment registry. |
| Changing application ID, custom scheme, Android App Link host/path, signing configuration, manifest or native dependencies | Rebuild/reinstall the native APK and verify its routing/asset-link association. Such changes were not introduced here. |
| HTTPS confirmation fallback | Stays in the browser for verification, then opens the existing custom scheme. No new App Link association is required. Existing `/app/customer/` App Links retain their normal reviewed `assetlinks.json`/signing requirements. |

Existing older clients retain the old status endpoint and exact-unique text-location compatibility. They do not acquire new selectors/confirmation routes without an update. Missing cancellation reasons are rejected; retain legacy web callbacks/Site URL for old emails and clients during rollout. Backend/schema must precede new client commands.

Hermes export commands verify packaging, not an APK or device. Use a separate terminal for the starter fixtures so local Firebase files for a branded package do not contaminate fixture verification:

```powershell
Set-Location 'C:\RestaurantManagementSystem\Restaurant-Platform'
$env:EXPO_NO_DOTENV = '1'
$env:OPERATIONS_NOTIFICATIONS_ENABLED = 'false'
$env:CUSTOMER_NOTIFICATIONS_ENABLED = 'false'
npm run build:starter -w @restaurant-platform/operations-mobile
if ($LASTEXITCODE -ne 0) { throw 'Operations export failed' }
npm run build:starter -w @restaurant-platform/customer-mobile
if ($LASTEXITCODE -ne 0) { throw 'Customer export failed' }
```

Preserve existing push/Firebase configuration for real builds. These process-local export settings do not validate push delivery. Follow the repository's existing Android build/branding runbooks for a distributable branded APK.

## G. Outstanding Problems

- **No unresolved implementation/test failure:** final Maven build, all executed tests, TypeScript, lint and both Hermes exports passed. The remaining verification gap is the 13 PostgreSQL 17 Docker migration cases; rerun them in CI or with a working Docker engine. The local PG18 binary bootstrap failure is recorded above; PG16 validation succeeded.
- **Administrative-data review remains manual:** five duplicate pairs stay inactive; current official boundaries/transliterations and ambiguous/unmatched legacy records require review. The pinned dataset is not claimed to be the latest official Myanmar map.
- **Stable HTTPS callback is not configured:** current Quick Tunnel/placeholder entries were preserved. A reviewed host, hosting and exact manual Supabase allowlist/template configuration remain release prerequisites for the absent-app fallback.
- **Hosted migrations and deployment remain manual:** no hosted schema/Auth changes or deployment were performed. Inspect the hosted migration ledger, review/apply pending files and deploy in section D's order.
- **Real-device/email/COD acceptance remains unperformed:** automated suites and Hermes exports do not establish actual Android intent dispatch, inbox delivery, browser app-open behavior, push delivery or physical cash collection. Complete section E on the intended devices before release.

Final automated verification found no other unresolved code failure. The manual release requirements above remain explicit; automated local success is not a claim of hosted deployment or real-device acceptance.
