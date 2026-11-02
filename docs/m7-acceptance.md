# M7 acceptance — White-label Operations Android foundation

Date: 2026-11-02. Application: `apps/operations-mobile`. M7 builds the mobile foundation and audits accounting contracts; complete accounting workflows belong to M8 and their reuse to M9.

## Delivered foundation

| Requirement | Implementation and boundary |
| --- | --- |
| Maintainable project | Expo Router files in `app/`; separate `src/auth`, `config`, `navigation`, `components`, `hooks`, `features/operations`, `features/profile`, `features/accounting`; public DTOs/REST transport remain shared packages. [App runbook](../apps/operations-mobile/README.md). |
| Router and roles | Protected workspace mounts only after verified server membership; the same manifest checks visible navigation and direct/deep-link routes. Unknown roles, inactive restaurants, wrong tenant and unsupported features fail closed. No role picker or tenant picker. |
| Email/password | Official Supabase SDK password sign-in. Reusable form with accessible labels, busy/error state and password clearing. No token/password in router state. |
| Native persistence/refresh | Encrypted Android SecureStore, scoped by app/environment/restaurant/Supabase origin; backup exclusions; SDK process lock; foreground auto-refresh/background pause; same-UUID validation and generation-isolated refresh results. No plaintext fallback. |
| Durable logout | Workspace revokes immediately; encrypted logout barrier precedes SDK sign-out, blocks late writes, and prevents restored credentials after offline logout/interrupted cleanup. Online SDK token revocation remains possible. Scoped session/user/PKCE keys are erased. SecureStore failures surface as an error requiring another sign-out attempt. |
| Feature-gated phone OTP | Build request defaults off. Tested real SDK adapter uses existing-user-only SMS requests and same-UUID verification. No existing server capability/provider-readiness contract exists: native gate stays closed even if the flag is true. No phone sign-in screen or live SMS claim. |
| Typed Spring client | Existing immutable-tenant member client plus audited daily report, menu categories/products, team, settings and order-payment reads. Shared DTOs mirror actual Java records. Tenant-bearing responses and payment order IDs are checked. No proposed accounting route is called. |
| Branding/configuration | Shared restaurant registry selects display name, color, public logo, approved Android icon, application ID and scheme. Runtime metadata validation rejects unsafe origins/invalid identity/brand. One restaurant per build. |
| Membership authority | Provider calls real `GET /api/v1/my/restaurants`, accepts only configured restaurant and known role, and never persists membership. Foreground/reconnection checks again; background/known offline revokes ready state. Spring remains the authority for every record/API operation. |
| Reusable UI | Accessible forms/actions, cards, horizontally scrollable tables, native confirmation dialog, order-count bar chart, state views, page layout, abortable queries. No fabricated financial chart series. |
| Profile and states | Membership/account profile, refresh access, confirmation logout, loading/membership-check/offline/denied/error/unconfigured/not-found screens. A query 401 signs out; record-specific 403 remains denied without automatic remount loops. Changing query keys cannot relabel previous results as new data. |
| Android development build | Expo dev client, Router/native screen/safe-area/network dependencies; development and staging APK profiles; production App Bundle profile. SDK compatibility aligned to React Native 0.88.1. Android JS/Hermes export and native configuration introspection pass; no APK/AAB was built or installed. |
| Environment separation | Explicit development/staging/production selection, distinct Android IDs/session scopes; per-profile EAS environments and public Supabase/API variables. Fixture only in development. API/Auth HTTPS required outside local development; Android cleartext disabled outside development. No service-role credentials bundled. |

## Navigation acceptance

All entries require current server membership for the embedded restaurant and matching audited backend permission. The membership API supplies a role rather than an effective permission list; the UI mirrors current `RestaurantRole` grants and Spring still checks each request. Changing backend grants requires reviewing this manifest. Product visibility is narrower than some operational permissions.

| Role | Runnable navigation |
| --- | --- |
| OWNER | Dashboard, Orders, Menu, Sales History, Reports, Team, Settings, Profile |
| MANAGER | Dashboard, Orders, Menu, Sales History, Reports, Deliveries, Profile |
| STAFF | Dashboard, Orders, Menu, assigned Deliveries, Profile |
| DELIVERY_DRIVER | Dashboard, assigned Deliveries, Profile |

Shopping and Accounting retain shared OWNER/MANAGER planning metadata but produce no runnable links and are denied on direct route access. Driver cannot mount orders/menu/report/history/team/settings screens. Staff cannot mount financial history/report/team/settings screens, and its order detail does not request payment history. Staff order prices remain operational data authorized by existing `ORDER_READ`. Staff and Driver deliveries use the real assigned-to-self endpoint; M7 adds no delivery mutations. Existing broader backend Staff delivery access remains a separately documented policy gap.

The Owner/Manager screens use the same components. Dashboard links to supported operations. Orders and Sales History page through real operational records; details show stored product/variant/modifier names and prices, quantities, discounts, timestamps with offsets, channel and status history. Owner/Manager also see creator UUID and separate payment method/status records. These are historical **order creation** records, not a new sale-recognition ledger. Search/server date filters, authorized staff name/role-at-event and dated refunds are not implemented. Reports accept a valid local calendar date and show the existing daily operations response in its returned timezone, separating order-created totals and paid-at collections. No accounting revenue, month/year trend, profit or CSV export is claimed.

## Accounting architecture and audit

The detailed [accounting API gap report](accounting-api-gap-report.md) audits checked-in schema/migrations, entities, controllers, services, repositories, DTOs and permission checks. It lists real contracts separately from proposed M8 routes and forward-only database work. This is a source audit, not inspection of a deployed database.

The shared [accounting boundaries](../apps/operations-mobile/src/features/accounting/boundaries.ts) and [proposed TypeScript contracts](../apps/operations-mobile/src/features/accounting/contracts.ts) cover all nine requested areas:

1. Daily/monthly/yearly sales dashboard, trends and order counts.
2. Detailed sale/order snapshots, payments, staff, refunds/cancellation and search/date filtering.
3. Persistent shopping catalog, daily quantities/units, seven-day suggestions and search/reactivation.
4. Purchase snapshots, costs/suppliers, workflow/payment status and private receipts.
5. Rent, salaries, utilities, transport, packaging, maintenance and other expenses.
6. Opening/receipts/payouts/expected/counted/variance and daily closing history.
7. Revenue/purchase/expense/cash-flow reports, conditional P&L, date/month/year and CSV.
8. Suppliers, purchase obligations, payment allocations, outstanding balance and history.
9. Created/updated actors, timestamps, reasons and immutable reversal/correction references.

The proposals are type-only and clearly prefixed `Proposed`; they implement no fetch methods, simulated successful response or financial workflow. Future permissions/capabilities, string money with explicit currency/scale, decimal quantities, tenant-scoped references, immutable events, concurrency/idempotency, receipt privacy and unavailable P&L states are specified for M8/M9 reuse.

Material backend blockers include manager/customer cancellation asymmetry, absence of dated/partial refund events, no purchase/expense/payable/cash ledger, unspecified legacy money scale, mutable historical currency/timezone labels, missing payment collector identity and missing inventory valuation/COGS. The existing daily report is not accounting-grade revenue/profit. No backend source or SQL migration was changed.

## Automated validation

Executed in this workspace on 2026-11-02:

| Check | Result |
| --- | --- |
| Root `npm run typecheck` | Passed; builds shared packages and checks all workspaces, including both mobile apps and both active web apps. |
| Operations `npm run typecheck -w @restaurant-platform/operations-mobile` after auth hardening | Passed. |
| Operations lint including `app/`, `src/`, configuration, entry and tests | Passed. |
| Operations test command | Passed: 3 build-config tests plus 45 Vitest tests (33 auth/session/storage/phone, 6 navigation, 3 runtime config, 3 amount/date/timestamp). |
| API-client full test suite | Passed: 47 tests, including 5 new real endpoint/tenant/payment/date contract checks. Loopback HTTP integration required sandbox escalation; the sandbox-only EACCES failure was environmental. |
| Shared-types and API-client lint/build/typecheck | Passed. |
| Restaurant registry tests | Passed: 5 tests. |
| UI-token tests | Passed: 2 tests. |
| Expo SDK dependency check | Passed against installed SDK compatibility data; offline CLI reports dependencies up to date after RN 0.88.1 alignment. No remote package-health claim. |
| `npm ls --workspace @restaurant-platform/operations-mobile --depth=0` | Exit 0; required dependencies resolved. Existing unrelated optional root packages are reported as extraneous. |
| Android starter export | Passed: Metro/Hermes bundle and Router assets exported to ignored `dist-starter`; development fixture only. This is not an APK or an Android device test. |
| Expo native config introspection | Passed: embedded fixture package `dev.restaurantplatform.starter.operations.staging.dev`; Router/build-properties plugins; development cleartext enabled; Android secure-store backup/data-extraction exclusions present. Production exclusion of the fixture is covered by build tests; no real production config exists. |
| Whitespace diff check | Passed after removing a trailing blank line in the auth form. |

Important test cases include wrong-restaurant/inactive/unknown-role denial; Staff/Driver financial route denial; logout/identity switch/background/offline invalidating late membership results; reconnect revalidation; same-UUID refresh; encrypted storage failure; offline logout/restart and interruption; expired/wrong-identity OTP capabilities; exact integer display and invalid calendar dates. Tests use fakes/injected ports and inspect real REST paths; they do not claim live provider authorization coverage.

## Live/native acceptance remaining

These require a reviewed real tenant configuration, matching development/staging Spring and Supabase projects, invited accounts, approved brand assets and an authorized Android build. M7 does not fabricate these or upload a build.

- Build/install development APK on an emulator and physical Android device; verify keyboard, accessibility/font scaling, horizontal navigation/tables, logo/icon, hardware back and direct links.
- Sign in with each role and with an account belonging only to another restaurant; verify server denials, native persistence/restart, foreground token refresh, expiry and revoked membership. Verify 401/403 with the actual backend and no retained record after role/account changes.
- Disconnect/reconnect and background/foreground during sign-in/membership/data requests; verify access remains locked until revalidated, offline logout survives process death and secure-store failures remain visible.
- Validate restaurant-local date boundaries against known fixtures and payment/cancellation states. Treat reported totals as operations data until M8 reconciles accounting semantics.
- Before release, supply real per-restaurant/per-environment public configuration, EAS project/signing setup and production HTTPS services. OTP remains disabled until backend/provider/security gates and actual SMS identity tests are complete.

No staging, commit, push, merge, deployment, native install, database migration creation or migration application was performed. Pre-existing untracked `.postman/` and `postman/` directories were left untouched.
