# Customer fixes and Shopping/Purchasing separation — 15 November 2026

## Delivery status

Implemented in the current working tree, preserving the existing staged and unstaged work. No commit, push, deployment, QR rotation, hosted migration, hosted configuration change, or deletion of customer/financial records was performed. Database verification used newly created disposable loopback PostgreSQL fixtures only.

Shopping Planning now saves rows with **only Item, Quantity and Unit**. It has no price, supplier, invoice, payment, purchase-confirmation or financial-total controls. Purchasing & Accounting is a separate Operations route. Variant descriptions are implemented across storage, Java contracts, public menu, shared types and all three applications.

Live registration is **currently blocked by the hosted email quota**. One user-authorized signup returned HTTP 429 / `over_email_send_rate_limit`. Live confirmation/sign-in, Android checkout, real Common QR orders and Operations visibility remain acceptance steps; automated results below do not establish live end-to-end success.

## 1. Root causes and evidence

| Area | Confirmed finding | Correction / remaining action |
| --- | --- | --- |
| Registration | One real signup using the Customer Supabase SDK was rejected at **22:41:37 Asia/Bangkok, 15 November 2026**, with HTTP 429, code `over_email_send_rate_limit`, message `email rate limit exceeded`. One request was sent; no user or session was returned. This establishes the current blocker, while the earlier generic failure's historical cause is unknown. | Preserve confirmation and rate-limit security. Review Auth logs, configured email rate limits and SMTP provider quota; wait for the applicable reset before one authorized retest. No repeated signup/resend attempts were made. |
| Auth configuration | Read-only public Auth settings show email/signup enabled and email confirmation required; phone authentication is disabled. These settings do not reveal the SMTP configuration or deployed trigger state. | Existing signup, confirm-password, password visibility, validation, bilingual errors, resend, gated recovery, secure sessions and account isolation were retained. Unauthorized-recipient errors now provide safe English/Burmese guidance. |
| Guest QR | BFF origin checking rejected an HTTPS browser Origin when TLS termination delivered an internal HTTP Next request. A regression reproduced 403 before the change. | Validate the browser origin against the canonical request Host, allow HTTPS for the reviewed tenant, allow HTTP only for development loopback, and reject spoofed forwarded hosts/protocols. This confirms the ingress defect, not the historical phone's exact ingress configuration. |
| Customer checkout | Optional avatar signing could throw a known Storage configuration/outage error and fail the whole profile request. Account loading requires profile/address data, so an otherwise valid customer could be blocked before checkout. | Return the valid profile with a null optional avatar for only `MEDIA_STORAGE_NOT_CONFIGURED` and `MEDIA_STORAGE_OPERATION_FAILED`. Preserve its private object path and propagate unrelated authorization/profile errors. |
| Shopping design | The previous screen and `LineInput` required `unitCost` for plans and included purchase confirmation, invoices, supplier selection and financial history. | A distinct planning contract/table and separate screens remove the conflict. No zero/dummy prices satisfy the new API. |
| Purchase retry | A lost response followed by draft edits could generate a different key and create a second independent purchase. The sheet unique index protects linked purchases only. | Persist the immutable submitted body/key in account/restaurant/environment-scoped SecureStore before sending; recover and retry that exact request after navigation/relaunch. Block new submissions while unresolved. |

Registration evidence is sanitized in `target/shopping-qa-20261115/customer-registration-safe-result.json`. The temporary unused encrypted test password was removed after rejection. No confirmation email is expected from the rejected request. No hosted administration API or dashboard changes were made.

Detailed investigations: [Customer Auth/Checkout](customer-auth-checkout-investigation-20261115.md), [Guest Common QR](guest-common-qr-investigation-20261115.md), [Variant descriptions](product-variant-descriptions-20261115.md). Earlier profile/session/address/cart/receipt fixes remain documented in [customer-auth-profile-checkout.md](customer-auth-profile-checkout.md).

## 2. Shopping and Purchasing architecture

| Record/table | Purpose and relationships |
| --- | --- |
| `accounting_shopping_items` | Shared reusable item identity and name; optional default unit. Historical default quantities and supplier metadata remain stored. Planning never imports catalog quantities automatically. Search, sorting, suggestions, create/edit and audit reasons remain available. |
| `accounting_shopping_sheets` | Date and creator/updater header. Each date's selected items and quantities are independent. A date may have several saved sheets, consistent with the existing API. |
| **`accounting_shopping_plan_lines` (new)** | Sheet/item references, historical item name, positive decimal quantity, meaningful unit and internal row position. **No cost, total or supplier columns.** Composite foreign keys enforce restaurant ownership. |
| `accounting_shopping_lines` | Preserved legacy valuation archive. Every original ID, name, quantity, unit, cost, total and supplier reference remains; updates/deletes are blocked. Editing a pure plan never deletes/overwrites these archived costs. |
| `accounting_purchases` / `accounting_purchase_lines` | Actual confirmed financial obligations and immutable actual item/name/quantity/unit/cost/total snapshots. A purchase can stand alone or explicitly reference one sheet via the existing unique link. |
| `accounting_purchase_payments` / reversals | Actual payment events and append-only reversals. Existing financial precision, outstanding caps, finalized-day and supplier-payable rules remain. |
| Purchase cancellations / correction links | Existing append-only cancellation and replacement safeguards and historical receipts remain. |
| `accounting_audit` / `accounting_requests` | Existing actor/restaurant audit and idempotency ledgers are retained for planning and financial actions. |

The existing Spring JDBC architecture is retained; no procurement JPA entities were introduced. Owner/Manager finance authorization still applies to both routes and every backend operation. Staff, driver and cross-restaurant access remain denied.

**Shopping** contains Shopping Item Catalog and Daily Shopping Sheets. The compact editor presents Item / Qty / Unit with touch inputs, decimal keyboard, wrapping names and remove buttons. It starts empty. Users add selected items, save/reopen, edit an unposted plan with a correction reason, or explicitly copy a previous sheet to an independent unsaved draft. Discarding unsaved rows requires confirmation. Historical posted sheets are locked and can be copied. At least one valid row is required to save; new writes reject duplicate item IDs, nonpositive/overprecision quantities and blank units. Migrated historical duplicates are retained and must be explicitly resolved before an edit is saved.

**Purchasing & Accounting** contains Record Purchase, Purchase History, Payments, Suppliers, Payables and Audit History. The existing Accounting route continues to expose expenses, cashbook and closing. A user can record a purchase without any plan. Explicitly choosing/copying a saved plan copies item IDs, quantities and units into a separate purchase draft with **blank actual costs**. Users may change actual quantities or remove rows. The original plan is untouched. Review/confirmation requires actual costs and financial details, shows an exact whole-currency total, and submits separately. Payments/reversals/cancellations remain on purchase details; supplier management and balances remain accessible.

Purchase recovery stores no Auth bearer token. Failed/corrupt storage prevents sending a new purchase. Ambiguous network/server failures retain the same body/key; known transaction-rejection statuses 400/403/404/422 and the rolled-back `DATA_CONFLICT` / `PURCHASE_CORRECTION_REQUIRES_CANCELLATION` conflicts release it. Generic conflicts retain recovery. Successful retries resolve to the same backend purchase. The existing per-restaurant transaction lock, financial request ledger and unique sheet/replacement links remain in force.

### API contract

The existing `/api/v1/restaurants/{restaurantId}/accounting/shopping/sheets` POST/PUT endpoints now accept:

```json
{
  "shoppingDate": "2026-11-15",
  "lines": [{"itemId": "<catalog UUID>", "quantity": "1.5", "unit": "kg"}]
}
```

An update additionally requires a header-level correction `reason`. Quantity precision remains twelve integer/six fractional digits. Plan row JSON containing old financial fields is rejected rather than silently discarding newly entered costs. Java `PlanLineInput`/`PlanLine` and TypeScript `ShoppingLineInput`/`ShoppingLine` are distinct from financial `LineInput` and `PurchaseLineInput`/`PurchaseLine`. The existing typed client methods automatically use the new contract. Sheet status/purchase-link metadata remains compatible with existing posted-plan locking; no financial data is displayed in the planning editor.

`POST /accounting/purchases` still requires actual `unitCost` strings and validates exact quantity × cost and total bounds on the server. Saving/opening/copying a plan never calls that endpoint, creates a payment, or changes supplier debt.

## 3. Variant descriptions

Nullable independent plain text, maximum 5,000 characters; blank/null becomes null. Product descriptions are never copied. Java create/update, management/public responses, shared contracts and typed client transport preserve descriptions. Operations has a multiline field; Customer and Guest show descriptions below the corresponding variant names. Guest preserves line breaks and responsive wrapping, renders escaped text and associates selected help text accessibly. Burmese Unicode is covered. Images, availability, modifiers and actual prices retain their existing behavior.

The variant PUT is a full replacement: omitted/null description clears it. Upgrade older Operations clients before editing described variants so they do not omit the new property.

## 4. Forward migrations and rollout

1. Review/apply any outstanding existing migrations in timestamp order, including the already-present uncommitted `20261112090000_owner_account_onboarding.sql` if applicable. This task did not create or alter that earlier migration.
2. New **`20261115090000_product_variant_descriptions.sql`** adds nullable text and a length constraint. Existing variants retain all fields and receive null descriptions.
3. New **`20261115091000_shopping_planning_separation.sql`** creates pure planning lines, copies every old planning row and original identity/order, protects the old valuation archive from update/delete, makes catalog default units optional, enables RLS and revokes direct client privileges. No financial table/history is rewritten.
4. Restart the updated API only after schema review/application: Hibernate validation requires the description column; planning JDBC requires the new table. Coordinate the Operations update and API cutover. Avoid mixed old/new backend binaries, because older code writes the legacy table and older shopping clients send financial fields. Retain archived data; do not drop it in cleanup.
5. Build shared packages/reload updated clients and restart/rebuild Guest Web. Run the acceptance steps below.

**No hosted migration was applied.** Local verification used all 28 migrations in disposable PostgreSQL 16.4 databases on loopback port 55479. Only fixture copies of two older migrations omitted PostgreSQL 17's unsupported `MAINTAIN` privilege; repository SQL was unchanged. Both new migrations executed directly. The isolated legacy preservation fixture inserted data before each new migration, then checked row/identity/duplicate/cost/supplier/purchase/payment preservation, Unicode/length, archive immutability, RLS/client denial and absence of financial side effects. The owned fixture server was stopped after verification.

## 5. Verification results

| Check | Result |
| --- | --- |
| Shared package build | Passed. |
| Customer Mobile | 326 Vitest + 8 Node configuration tests passed; TypeScript and ESLint passed. |
| Guest Web | 214 tests passed; TypeScript, ESLint and production build passed. |
| Built Guest HTTP smoke | 119 checks passed, including four synthetic fixture orders, queue tracking, rotation rejection, duplicate/replay handling, two-tenant isolation and HTTPS-origin/internal-HTTP ingress. These were not live restaurant orders. |
| Operations Mobile | 318 Vitest + 6 Node configuration tests passed; TypeScript and ESLint passed. Includes 12 interactive planning/purchasing cases and 25 durable purchase-attempt tests. |
| Shared API client | 101 tests passed. The loopback transport test required approved local networking after the sandbox rejected its first connection. |
| Full backend Maven verify | 487 discovered: **466 passed, 0 failed/errors, 21 skipped**; BUILD SUCCESS. |
| Backend skips | 13 Docker/Testcontainers migration cases (Docker Linux engine unavailable); 8 separate owner-onboarding opt-in DB cases. These are not described as passed. |
| Final strict planning JSON guard | 8 targeted contract/procurement tests passed after the full run, including 2 new request tests; the other 6 overlap the full suite. |
| Local SQL migration preservation | All 28 migrations and preservation assertions passed in an independent disposable DB. |
| Whitespace checks | Task-scoped checks passed. Earlier unrelated staged work was retained. |
| Live signup | **Rejected** by hosted email rate limit (429); no account/session success claimed. |
| Live devices / public staging | Pending: email confirmation/sign-in, Android SecureStore/maps/COD, actual Guest order/queue and Operations visibility. |

The first full backend run had one error from re-stubbing an already throwing Mockito method in the new profile test. `doThrow`/`doReturn` corrected the test harness; eight profile tests then passed and the complete backend verify was rerun successfully. Existing Operations tests also needed alignment with earlier uncommitted development-network and Expo `File` behavior; production network/image implementations were preserved.

Logs under `target/shopping-qa-20261115/` include `backend-verified.log`, `backend-profile-rerun.log`, `migrations.log`, `migration-preservation.log` and the sanitized live-signup result. PostgreSQL-backed customer profile/address/delivery and procurement/accounting tests were executed against `accounting_verify`; Docker-only acceptance remains open.

## 6. Configuration that still requires operator review

- **Supabase email quota:** correlate the 22:41:37 Bangkok request in Auth logs; inspect Authentication → Rate Limits and SMTP/provider quota. Wait for the actual window. The app cooldown is not proof the hosted quota reset. If using the default sender and customer addresses are restricted, review an approved custom SMTP sender. Keep email confirmation enabled. Then perform one authorized signup/confirmation/sign-in/profile retest.
- **Triggers/profile permissions:** the hosted trigger deployment and full DB role privileges were not audited through public settings. Use the safe read-only queries in the earlier Auth report if provider logs show database/profile failures. Local trigger/profile recovery tests passed; do not recreate/delete live users to test recovery.
- **Guest hosts:** local routing requires `/r/san-thaw-tar`; a localhost root does not implicitly choose a tenant. Public staging uses the exact reviewed HTTPS host in the registry. An arbitrary new tunnel is denied until explicitly reviewed/registered. Production host setup remains required before deployment.
- **QR environment:** current Operations QR URLs use the embedded `guestBaseUrl`. `APP_PUBLIC_WEB_BASE_URL` still affects legacy owner/workspace URLs and defaults to port 3000, while Guest runs on 3002; check the actual running value and intended link target. Changing it does not change an installed Operations embedded origin. Preserve existing distributed links during a planned cutover.
- **QR receipt encryption:** verify the existing stable `APP_IDEMPOTENCY_ENCRYPTION_KEY` (Base64 32-byte secret). Missing/invalid configuration deliberately returns 503. Preserve an existing key; never remove idempotency or substitute a dummy key. No key was generated/rotated by this task.
- **Ingress:** preserve canonical Host and authorized-host routing; keep server-side Guest API reachability and valid TLS. Forwarded headers cannot authorize another tenant.

## 7. Android rebuild requirements

These changes add no native dependencies or manifest changes. For an existing compatible development client, build shared packages and reload Metro; an APK rebuild is unnecessary for these JavaScript features. Backend changes require API restart after manual schema application. Guest BFF changes require Guest process restart/rebuild. Changing embedded tenant/origin/native configuration, or distributing a new release, still follows the existing project's release process. No Android APK was built during this work.

## 8. Windows PowerShell and Android acceptance guide

Run each service in a separate terminal. Use the existing approved API environment; the commands do not print or embed database credentials, service-role keys or QR secrets.

```powershell
Set-Location 'C:\RestaurantManagementSystem\Restaurant-Platform'
npm run build:packages

# API terminal, approved backend environment already loaded — port 8080
$env:JAVA_HOME = 'C:\tools\jdk21'
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
$maven = 'C:\Users\DELL\.m2\wrapper\dists\apache-maven-3.9.9-bin\4nf9hui3q3djbarqar9g711ggc\apache-maven-3.9.9\bin\mvn.cmd'
& $maven -f app/api/pom.xml spring-boot:run

# Operations terminal — port 8082
npm run start -w @restaurant-platform/operations-mobile -- --port 8082

# Customer terminal — port 8083
npm run start -w @restaurant-platform/customer-mobile -- --port 8083

# Guest terminal — port 3002 (the package script already selects it)
$env:GUEST_CONFIG_ENV = 'staging'
$env:GUEST_LOCAL_ROUTING = 'true'
$env:GUEST_API_BASE_URL = 'http://localhost:8080'
npm run dev:guest
```

```powershell
$adb = 'C:\Users\DELL\AppData\Local\Android\Sdk\platform-tools\adb.exe'
& $adb devices -l
# Continue after an authorized device is listed; add -s <serial> if needed.
& $adb reverse tcp:8080 tcp:8080
& $adb reverse tcp:8082 tcp:8082
& $adb reverse tcp:8083 tcp:8083
& $adb reverse tcp:3002 tcp:3002
Invoke-RestMethod 'http://127.0.0.1:8080/actuator/health'
```

1. After quota resolution, register the authorized test address once, open its confirmation email, return/sign in and load Profile. Test existing invalid-field feedback, background/reopen session restoration and sign-out/account isolation. Do not repeat signup while rate-limited.
2. Customer: add an available product with variant/modifiers; Cart → Continue to checkout; load saved addresses and delivery zones; choose a confirmed map pin/coordinates; validate recipient contact and server quote; submit COD once. Verify confirmation, unchanged cart until receipt, history and tracking, plus the same restaurant's Operations order. Test lost-response receipt recovery and confirm one order/stock deduction.
3. Guest/USB: open `http://127.0.0.1:3002/r/san-thaw-tar` with the existing QR entry intent and credential fragment retained privately. Common QR uses the customer-pickup intent; Table QR local path is `/r/san-thaw-tar/workspace`. Never move the credential into query parameters or logs. Choose variants/modifiers, review and submit once. Verify an order number and daily queue ticket, Operations visibility and queue status progression.
4. Guest/public: use the exact reviewed HTTPS host, root Common QR entry or `/workspace` for Table QR. Verify active restaurant/QR/takeaway settings, server reachability and canonical Host. Test existing invalid/previously rotated credentials or fixture credentials without rotating live ones. Check network retry, duplicate taps and tenant isolation.
5. Variants: add/edit multiline Burmese descriptions in Operations, reopen, verify public response and Customer/Guest display; clear a description and verify null. Check image, price, modifiers and availability remain correct.
6. Shopping: create Rice/kg and Eggs/pcs catalog items without quantities. Save one date with Rice 5, another with Rice 2/Eggs 20; reopen both. Edit/copy one and verify the other remains unchanged. Remove a row, test decimal quantity and invalid/duplicate rejection. Confirm the editor has only Item/Qty/Unit and no purchase/payment controls.
7. Purchasing: record an independent actual purchase; separately copy a saved plan, enter actual costs and a different actual quantity, then review/confirm. Verify the original plan is unchanged. Record a payment, check supplier balance/history, reverse it, cancel/correct a purchase and inspect audit history using authorized test records. Test lost-response/remount recovery with the saved request and verify one purchase. Saving a plan must not affect purchases, payments or payables.

No connected Android device was available for these acceptance steps. Real restaurant test orders/purchases were not created by this task.

## 9. Current-task file inventory

Paths below are relative to `C:\RestaurantManagementSystem\Restaurant-Platform`. Existing earlier changes in these files were extended in place. Other pre-existing modified/untracked files were preserved.

| Files | Changes |
| --- | --- |
| `app/api/src/main/java/com/restaurant/platform/service/CustomerProfileService.java`; matching `src/test/.../service/CustomerProfileServiceTest.java` | Optional avatar failure isolation and recovery/authorization regressions. |
| `apps/customer-mobile/src/auth/errors.ts`, `errors.test.ts` | Safe bilingual email-recipient guidance; existing error handling retained. |
| `apps/guest-web/src/lib/guest-api.ts`, `guest-api.test.ts`; `apps/guest-web/scripts/smoke-production.mjs` | Canonical origin fix and proxy/QR/tenant smoke regressions. |
| `app/api/src/main/java/com/restaurant/platform/entity/ProductVariant.java`; `dto/menu/ProductVariantRequest.java`, `ProductVariantResponse.java`, `MenuVariantDto.java`; `service/CatalogManagementService.java`, `CatalogImageService.java`, `PublicMenuService.java` | Optional description validation, persistence and management/public/image responses. |
| `app/api/src/test/java/com/restaurant/platform/service/CatalogManagementServiceTest.java`, `CatalogImageServiceTest.java`, `PublicMenuVariantDescriptionTest.java`; `integration/PostgresMigrationSchemaTest.java` | Variant and migration/schema preservation tests. |
| `packages/shared-types/src/api.ts`, `member-api.ts`; `packages/api-client/src/variant-descriptions.test.ts` | Public/management description contracts and transport regressions. |
| `apps/operations-mobile/src/features/menu/MenuScreen.tsx`, `model.ts`, `model.test.ts` | Multiline variant editing/display/validation. |
| `apps/customer-mobile/src/features/storefront/ProductScreen.tsx`, `Storefront.test.tsx` | Variant descriptions and product-rendering regressions. |
| `apps/guest-web/src/lib/menu.ts`, `menu.test.ts`; `src/components/GuestPage.tsx`, `GuestPage.test.tsx`, `ProductConfigurator.tsx`; `src/app/globals.css` | Safe optional parser, responsive per-variant/selected description rendering and tests. |
| `app/api/src/main/java/com/restaurant/platform/accounting/ProcurementDtos.java`, `ProcurementService.java` | Separate strict pure-planning contracts, validation, snapshots, row order and JDBC persistence. |
| `app/api/src/test/java/com/restaurant/platform/accounting/ProcurementServiceTest.java`, `ProcurementLocalPostgresTest.java`, `AccountingDatabaseChecks.java`, `ShoppingPlanContractTest.java` | Planning/purchase separation, independent dates/copies, audit, tenant and strict contract tests. |
| `packages/shared-types/src/accounting-procurement.ts`; `packages/api-client/src/accounting-procurement.test.ts` | Distinct planning/purchase line types, optional catalog unit and exact pure-plan transport test. |
| `apps/operations-mobile/src/features/accounting/ShoppingScreen.tsx`, `shopping-plan.ts`, `shopping-plan.test.ts` | Pure compact daily planner/catalog, independent copy and validation. |
| `apps/operations-mobile/src/features/accounting/PurchasingScreen.tsx`, `purchase-attempt.ts`, `purchase-attempt-native.ts`, `purchase-attempt.test.ts` | Separate purchasing navigation/workflow and durable isolated exact-request recovery. |
| `apps/operations-mobile/src/features/accounting/procurement-format.ts`, `procurement-format.test.ts`, `shopping-screens.test.tsx` | Exact purchase review amounts and interactive planning/purchasing/recovery regressions. |
| `apps/operations-mobile/src/navigation/policy.ts`, `policy.test.ts`; `app/(workspace)/[screen].tsx` | Separate Purchasing route with existing role/tenant guards. |
| `apps/operations-mobile/tests/app-config.test.cjs`; `src/components/imageUpload.test.ts` | Align existing tests with earlier development-network configuration and native Expo File multipart implementation; production code retained. |
| `supabase/migrations/20261115090000_product_variant_descriptions.sql`, `20261115091000_shopping_planning_separation.sql` | The two forward-only migrations described above. |
| `docs/accounting-procurement.md`; this report and the three dated investigations linked above | API/architecture, evidence, rollout and acceptance guidance. |

Ignored local `target/` fixtures/logs contain test evidence only and are not application migrations or deployment artifacts. The separate registration, device and hosted-configuration acceptance limits remain explicit above.
