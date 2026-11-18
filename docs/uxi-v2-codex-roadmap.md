# Restaurant Platform — Multi-Tenant, Self-Service Theme & Figma UX-01 Codex Roadmap (v2)

**Date:** 18 November 2026 (Asia/Bangkok)  
**Repository:** https://github.com/waiyanphyo-max/Restaurant-Platform  
**Figma:** https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform  
**Audited baseline:** `5a898e5c3a383d90f87ac26a5c34d56914d39e39` (`main` after PR #38). Always verify current local HEAD before each task.  
**Baseline report:** `docs/ux-implementation-baseline.md` (created by UXI-00; merge its audit branch before using it as an input on `main`, or supply that exact report to Codex).  
**Status:** Product decisions approved by owner; this file contains instructions for future Codex runs, **not completed changes**.

## A. Architecture contract — the most important requirement

The platform operator provisions each restaurant once with the owner, initial restaurant name, profile, theme, logo, categories, products, variants, modifiers, prices, and product photos. Then the **restaurant's own Owner and Manager** maintain catalog, prices, variants, modifiers, availability and **in-app theme colors** through Operations Android without the platform operator editing code for each change. Customers see the updated restaurant-specific data in Guest Web and the restaurant-specific Customer Android app. Backend is one shared Spring Boot service using Supabase PostgreSQL/Auth/Storage, with per-tenant isolation and authorization. Guest Web is one tenant-resolving Next.js codebase; Operations Android and Customer Android each have **one shared codebase, built separately for every restaurant**. Every Android build has a fixed restaurant UUID, package ID, deep links, release signing/identity, launcher icon and splash provided by reviewed build configuration. A runtime screen never chooses/switches its tenant based on user input, route or user-editable configuration.

**Two distinct configuration layers, not two competing authorities:**

1. **Runtime / editable tenant data (backend authority):** restaurant profile/display name and in-app logo URL; colors and UI branding; categories/products/variants/modifiers/price/stock/photos; featured editorial product designation. Spring enforces membership, authorizes writes, validates values, persists to PostgreSQL and serves versioned, safe public brand/menu views. Public reads contain no private settings, secrets, QR credentials or financial information. Owner/Manager can manage catalog and palette; **the current Owner-only logo-upload permission remains Owner-only** unless separately and explicitly approved. Owner controls the manually curated featured-product designation (avoid implying computed sales rank). Updates become visible after safe refresh/cache invalidation in Guest, Operations and Customer without rebuilding native binaries. Never trust built-in tenant metadata as authorization.
2. **Build/deployment metadata (reviewed registry + release authority):** restaurant UUID/slug binding; environment API and guest origins, domain routing, Android application IDs, signed release profiles, launcher icons, splash images, app-store display name, App Links. Those do **not** become editable Operations fields. A changed launcher icon/splash/native app name typically requires a new release; a changed application ID is a separate app identity, not an in-place update. Preserve historical installed package IDs and QR/deep-link compatibility.

**No global San Thaw Tar hard-coding.** San Thaw Tar is the first test tenant and approved Figma brand. New restaurant onboarding should be repeatable for Restaurant B without copying San Thaw Tar names, prices, photo URLs, credentials or identity. Any seed/bootstrap must use real returned UUIDs and reviewed customer-supplied media; no invented prices, products or images. Protect historical order/payment snapshots, existing accounting and all tenant boundaries.

### Approved product decisions (D0)

- **Q1 Brand:** San Thaw Tar red `#A51D22`; dark `#82181B`, soft `#FCEAE7`, gold `#C99632`, cream `#FFF8F0`, ink `#231B18`, muted `#71645E`, border `#EBDDD1`. These are **one tenant's palette**, not global colors. Persist editable in-app palette through backend. Registry supplies build/fallback branding only; align initial seed/cutover without assuming hosted configuration already matches.
- **Q2 Media:** Use actual approved full-resolution transparent logo and six user-provided dish originals. Verify ownership, file integrity, quality and exact product/variant UUID before uploading. Figma's tiny image fills are previews, not full-resolution originals. Use authorized Spring Storage endpoints; never write production Storage as part of source-only implementation.
- **Q3 Promotion:** Owner-managed **editorial featured product**, initially Mala Xiang Guo. Never pretend it is an automatically measured sales bestseller. Decide/copy a truthful label such as “Featured / Restaurant pick”; stable tenant-scoped product ID; no product-name matching or first-item inference. Add minimal persistent/server-readable contract if absent.
- **Q4 Options:** KEEP variants **and** modifier groups/options. Figma's variants-only screens must be amended to conditionally show required/optional modifier UI; required options prevent cart addition until selected, without weakening backend pricing/stock/history checks.
- **Q5 Geography:** Existing Region → District → Township canonical API, selectors and IDs are KEEP. Verify hosted migration ledger and data provenance before any live rollout. Keep text-only delivery without fake coordinates and preserve legacy historical addresses.
- **Q6 Deferrals:** Do not create unsupported durable cart/offline drafts, persisted image alt text/crop workflows, custom export schemas/count previews, extra financial metrics, notification-category preferences or accountant role merely because the Figma illustrates them. Mark design-only/blocked where needed.

### What the audited source already has

`RestaurantRole.java` grants both Owner/Manager `MENU_MANAGE` and `SETTINGS_MANAGE`. Catalog write API supports products, categories, variants, modifiers and images. `RestaurantLogoService` is **Owner-only**. `PlatformRestaurantProvisioningController` provisions restaurant/owner; `PlatformRestaurantLifecycleController` stores configuration **as deployment metadata only**, and Admin does not currently provide a complete secure initial catalog/media bootstrap. `configs/restaurants/san-thaw-tar.json` uses green `#234D3C` in the audited commit and carries immutable mobile build metadata. `GuestShell.tsx` and mobile shells use registry/embedded branding, not a canonical dynamically refreshed backend theme. `PublicMenuResponse` lacks public color data; `MenuProductDto` lacks featured field. Existing Accept/Complete/Cancel, delivery COD, geographic hierarchy, year period, CSV, Shopping-vs-Purchasing, QR recovery and financial ledger all exist: **do not reimplement these**.

## B. Every Codex milestone must obey this execution contract

Before writing: inspect local branch/HEAD, staged/unstaged/untracked files and `docs/ux-implementation-baseline.md` if available; reconcile baseline `5a898e5` with actual local HEAD. Inspect **relevant** exact Figma nodes, code and tests (do not invent design pixels or assume the older UX-00 narrative exists). Do not alter unrelated code or silently undo user changes. Do not run `git reset --hard`, `git clean`, force push/checkout or stash/delete untracked Postman fixtures. Do not create/change branches, commit, push, merge, deploy, run hosted migrations, upload live media, send real invites, trigger live checkout, rotate QR, change credentials or perform paid provider actions without the user's separate authorization. Use disposable fixtures for mutating tests. No service-role keys in client, no bypass of RLS/authorization. Never use client-supplied actor/tenant IDs as authority. Typecheck, focused test, and build within reasonable scope; `npm run verify:frontend` at root and `mvn --batch-mode -f app/api/pom.xml clean verify` when pertinent and safe. Distinguish **PASS**, **FAIL**, **SKIPPED**, **BLOCKED** and **NOT RUN**. End each milestone with: branch+SHA, diff summary, touched paths, Figma refs, API/schema changes, tests actually executed, regression risks, next dependencies and approvals required. **Stop at end of milestone; do not automatically run the next prompt.**

**Suggested Git pattern:** User creates a new feature branch from the latest integrated/approved predecessor, not repeatedly from stale initial `main`. Codex does not switch/create/commit/push without instruction. Review → tests → user commit/PR → merge → update main → next branch.

---

## D0 — Product policy and Figma contract corrections (NO feature coding)

**Suggested branch:** `uxi/d0-product-decisions`. **Depends:** UXI-00 baseline. **Deliver:** `docs/ux-product-decisions.md` and precise Figma discrepancy checklist; Figma edits only if Codex has authorized edit access.

```text
Perform D0, the product/data decision and design-consistency gate, without functional code changes. Inspect docs/ux-implementation-baseline.md, the verified Figma Foundations/G01–G19/C01–C34/O01–O69/States, and current repo files. Treat these decisions as owner-approved:

A. One Spring/Supabase-backed, tenant-isolated platform; one Guest Web source; one Operations Android source and one Customer Android source, each native app built per restaurant with immutable identity and separately branded release assets.
B. Initial operator-provisioned restaurant, owner, profile, palette, logo and full catalog/photos; after handover Owner and Manager edit catalog/prices and in-app palette themselves. Runtime data authoritative in backend; build/deployment metadata separate. Current logo upload remains Owner-only.
C. San Thaw Tar initial red #A51D22 and Figma supporting palette only for its tenant.
D. Full-resolution original media/product UUID mapping required; no uploads or guessed IDs.
E. Owner-managed editorial featured product (Mala); no computed popularity claims.
F. Keep variants and required/optional modifiers across all clients; amend Figma variants-only product screens and UX-01 coverage notes accordingly. Do NOT remove modifier controls, DTOs or prices.
G. Keep already-implemented geographic hierarchy, order action state machine, finance/year/CSV, shopping/purchasing separation; host/data rollout still unverified.
H. Defer unsupported optional product/report/provider extras.

Write a concise product authority table: canonical field, editor/permission, initial provisioning path, read consumers, cache/refresh strategy, native rebuild required yes/no, source file. Explicitly document the difference between runtime in-app theme vs launcher icon/splash/package metadata and identify existing source-of-truth drift. Update Figma only if editable access is available; otherwise create an exact screen-by-screen amendment checklist and mark visual review blocked. Do not claim that a Figma screenshot changed if it did not. Stop after decision documentation and review checklist. Do not run migrations, deploy, commit or push.
```

## UXI-01 — Shared design system, tenant-safe tokens and reusable primitives

**Branch:** `uxi/01-shared-design`. **Depends:** D0. **Paths:** `packages/ui-tokens/src/index.ts`, package tests; `apps/guest-web/src/app/globals.css`; `apps/customer-mobile/src/components/ui.tsx`; `apps/operations-mobile/src/components/ui.tsx`, `forms.tsx`, `QueryResult.tsx` as needed. Figma: Foundations/States.

```text
Implement UXI-01 shared visual foundations only. First audit current branch/status and D0 policy. Read Figma Foundations design tokens, reusable components, loading/empty/error/offline/forbidden states and local tenant-shell components.

Define reusable semantic UI tokens: surfaces, foreground, muted, accent, focus, borders, status success/warning/danger, radii, spacing, typography and density. Resolve accessible foreground contrast for tenant-specific primary/secondary; never globally assign San Thaw Tar red. Make the primitives accept safe validated runtime branding values when UXI-02 supplies them and fall back to verified build branding until then; do not create a second editable persistent theme. Keep current accessibility labels and roles, keyboard/screen-reader focus, dynamic text scaling, touch targets and responsive scroll behavior.

Refine Guest CSS + shared native Page/Card/Action/FormField/State/Confirmation where valuable, preserving existing component signatures and screen behavior. Test two opposite tenant palettes (red San Thaw Tar and a non-red fixture), invalid/unavailable branding, loading/error states and no cross-tenant leakage. Do NOT modify auth, checkout, finance, server contracts, `restaurantId` binding, launcher icons or real data. Do not assume fonts exist locally; document external asset requirement. Run targeted token/native/web component tests and root frontend validation. Report any Figma gap rather than inventing a new workflow. Stop.
```

## UXI-02 — Authoritative editable runtime branding: Spring API and typed contracts

**Branch:** `uxi/02-runtime-branding-api`. **Depends:** D0 (may follow UXI-01). **Scope:** minimal Java/Spring persistence and safe public/private DTOs, migrations only if needed, shared TypeScript types/client and tests. Figma: Foundations/Brand Kit, Operations theme settings.

```text
Implement the minimum multi-tenant **runtime-editable in-app branding** contract, without editing native build identities or changing order/business logic. Inspect `Restaurant`, `RestaurantSettings`, `RestaurantPlatformConfiguration`, all existing profile/logo/configuration controllers/services/DTOs, migration history, Spring security and public menu/Guest routing. Document the design chosen before adding fields: server-authoritative runtime display brand, palette and persisted in-app logo URL per restaurant, distinct from platform deployment metadata. Prefer existing canonical restaurant name/logo source and a narrowly scoped mutable theme storage (or a carefully justified extension) rather than storing the same editable value independently in several tables. Avoid confusing PlatformRestaurantConfiguration metadata with runtime theme.

Implement safe public/tenant-scoped branding reads (only display name, approved colors, logo URL and revision/version; no private config) and authenticated Owner/Manager brand palette writes. Use explicit `BRANDING_MANAGE` permission for Owner and Manager if clearer than broad SETTINGS_MANAGE, with tests proving Staff/Driver/foreign tenants denied. Preserve existing Owner-only logo upload; new theme writes MUST NOT grant logo upload to Manager or allow arbitrary external image URL injection. Validate six-digit colors, contrast/readability and allowed fields; use concurrency/version checks where practical so stale admin/owner writes cannot silently clobber changes. No user-selected restaurant switch; restaurant UUID and membership are authoritative. Correct cache-control and safe refresh/invalidation so a saved theme appears in Guest, Operations and Customer on next authorized refresh/foreground without new APK. Offline uses last safe same-tenant theme or embedded fallback, never data from another account/restaurant.

Admin initial provisioning must be able to seed the same canonical runtime theme through a trusted platform-admin-guarded path; expose only the minimal trusted seed contract here if needed, leaving full onboarding UI to UXI-04. Schema modifications, if necessary, must be new forward-only migrations with tenant isolation, grants/RLS and migration-preservation/rollback plan; do not apply to hosted DB. Update docs/api.md and shared-types/api-client only for actual new contract. Add Spring HTTP/auth/tenant, cache/fallback and TypeScript contract tests. No live tenant updates, build-release changes or deployment. Stop with API schema and rollout gates.
```

## UXI-03 — Operations Owner/Manager self-service theme editor + runtime consumer

**Branch:** `uxi/03-owner-theme-settings`. **Depends:** UXI-01 + UXI-02. **Paths:** `apps/operations-mobile/src/features/management/SettingsScreen.tsx`, `app/(workspace)/_layout.tsx`, `src/components/ui.tsx` if necessary, client bindings/tests. Figma: Operations Settings + brand edit/review and States.

```text
Implement UXI-03, the restaurant Owner/Manager's in-app theme settings and Operations runtime brand consumption. Read approved D0 theme policy, existing SettingsScreen and LogoService permissions, UXI-02 backend API, current embedded tenant contract and Figma Settings/confirmation/error/contrast states.

Owner and Manager can preview and save validated primary/secondary/background theme colors. The API persists per-restaurant values; Operations reads current runtime brand and refreshes it after success, after app foreground/resume and on bounded retry. Keep embedded tenant UUID, native display name, icon/splash/app ID, environment origins, signing and routing locked to the build. Show "Native icon/splash/name changes require a reviewed app release" as separate release guidance; do not suggest the color editor changes the installed launcher. Only Owner retains existing logo upload permission; Manager sees a truthful read-only logo state. A failed save must keep the previous persisted theme, show error and allow retry; stale version yields conflict review. Use live current branding across header, nav and primary controls rather than scattering literal red values. Protect authorized roles and no tenant switch/offline cross-contamination.

Add focused settings/render/reload/401/403/409/failed-refresh tests and verify both red and non-red fixture builds. Do not alter catalog or order state machinery, and do not touch app store metadata/credentials/production. Stop.
```

## UXI-04 — Platform operator initial onboarding and secure restaurant data bootstrap

**Branch:** `uxi/04-operator-bootstrap`. **Depends:** UXI-02; UXI-03 optional but recommended for handoff. **Paths:** Admin provisioning UI (`apps/admin-web` limited scope), platform admin controllers/services, catalog service/DTO and typed clients where necessary. Figma: provisioning/initial setup flows (do not expand UX-01 Admin redesign without explicit design); existing role screens.

```text
Implement a focused, repeatable restaurant onboarding workflow for a trusted platform operator. The operator receives the new owner-approved name/profile, language/contacts, original logo, brand colors, categories, products, prices, variants/modifiers and six/or other food photos. DO NOT copy San Thaw Tar records to every tenant.

First inspect existing PlatformRestaurantProvisioningController/LifecycleController, Admin UI, Supabase owner invite flow, CatalogManagementService, media endpoints, roles and tenant scopes. Produce a short capability-gap check. Reuse current owner provisioning/auth/invitations and catalog validation. Provide a minimal guarded operator setup UI/flow or import plan that: validates and previews owner/restaurant/profile/brand; provisions real restaurant and Owner membership; seeds the same canonical runtime brand contract as UXI-02; creates an initial catalog with valid server-calculated identities; optionally attaches approved photos through existing protected Spring uploads; verifies final output and has an explicit handoff to Owner Operations. If platform-admin catalog seeding requires a new endpoint, design the least-privileged **platform-admin allowlist** path with restaurant-scoped transactions/audit and idempotent repeat protection; do NOT impersonate Owner or insert fake memberships, and do NOT expose Supabase service keys in the client. Avoid bulk one-call external invite+Storage+SQL assumptions: use resumable reviewed steps and clear partial-failure recovery. Do not create duplicate products/owners or leak auth invite links/QR credentials.

Use a synthetic Restaurant B fixture and existing San Thaw Tar as two different examples. Photos need a reviewed product ID manifest before import; unsupported media inputs remain PENDING instead of silently fabricated. Audit 401/403/duplicate slugs, invalid prices/currency, failed photo upload, retry, owner/manager isolation and display-read parity. No live invite, Storage write, production migration or launch. Stop after verified staging/synthetic workflow and handoff documentation.
```

## UXI-05 — Catalog media mapping and Owner-curated featured product

**Branch:** `uxi/05-featured-media`. **Depends:** UXI-02 and UXI-04, approved original media/UUID mapping for actual publication. **Scope:** product-level featured status minimal persistence + menu response, admin/Owner control, media previews/fallback. Figma G19 and catalog.

```text
Implement only the approved editorial featured-product support and safe asset mapping, preserving all variant/modifier pricing. Before code, inspect current Product/Menu DTOs, CatalogManagementService, Product repository, public menu aggregation, product/variant upload helpers, Figma G19 and D0 original-media policy. Model one or more explicitly curated featured IDs per tenant only if scope calls for it; default product requirement is a single Owner-curated featured item, initially Mala for San Thaw Tar once its real product UUID is known. The field must be persisted in a tenant-scoped source, exposed as optional/backward-compatible public/menu/catalog data and checked against product ownership/availability. Do not infer from sale totals, category order, title substring or position.

Provide Owner-only 'Feature item' control or explicit Owner confirmation mechanism; Manager retains ordinary MENU_MANAGE for products/prices/photos but cannot silently change Owner-curated editorial selection. For actual media, create a reviewed manifest `{filename, restaurantId, productId or variantId, intended crop, approvedOriginalHash, status}`; the six known names are `Ah-Sein-Kyaw.jpg`, `Fried-Noodle.jpg`, `Fried-Rice.jpg`, `Kan-Sone-Plain.jpg`, `Kyay-Oh-Se-Chat.jpg`, `Malar-Xiang-Guo.jpg`. Treat full-resolution media and product UUIDs as unverified until supplied. Use existing authorized Spring uploads and their limits; no live uploads and no image reconstruction from tiny Figma previews. Preserve prior photo on failure. Render honest 'Featured/Restaurant pick' label and a no-image fallback. Do not add unsupported persistent alt-text/crop schema in this milestone.

If persistence changes are required, create forward-only SQL and tests for two-tenant isolation, deleted/disabled products, stable product IDs, optional backward compatibility, authorization and no effect on historical order snapshots. Keep existing financial/QR/cash APIs unchanged. Stop with media manifest pending fields explicitly listed.
```

## UXI-06 — Per-restaurant Android build/release identity and safe dynamic-theme loading

**Branch:** `uxi/06-branded-builds`. **Depends:** UXI-02/03, bootstrap metadata from UXI-04. **Paths:** `configs/restaurants/*`, `configs/restaurants/expo.cjs`, mobile embedded runtime modules, app config and tests; `docs/m13-android-branding.md`.

```text
Implement or verify per-restaurant branded Android build automation while keeping ONE source codebase for Operations and ONE for Customer. Inspect current `configs/restaurants`, Expo app configs, `mobile-runtime.ts`, native build validation, signing package ID uniqueness, guest host/deep links and release runbooks. Do not fork/copy full app source for each restaurant.

Provide documented safe commands to generate/validate a new restaurant's reviewed public registry JSON and logo/icon/splash assets from provisioned UUID/slug, unique package IDs, public API/guest origins and release profiles. Generation must fail on conflicts and must not replace shipped package IDs. For San Thaw Tar use approved native build palette/assets only after verified originals; registry/build-time fallback may be red, but database runtime theme is canonical for in-app rendering and can change without new APK. Do not treat static registry as a writable owner settings database. Customer/Operations app always verify embedded UUID, app ID and environment and load only that tenant's current public/authorized runtime branding; links/query/auth cannot select another tenant. A changed native launcher icon/splash/display name requires reviewed rebuild/release; native application ID never mutates at runtime. Keep secrets out of all registry/native metadata.

Test two restaurant fixtures each producing distinct config outputs for Operations and Customer, and runtime red/non-red themes without cross-tenant bleed. Run existing `npm run --silent mobile:build -- validate` and related validation/tests; do not create signed releases, distribute APK, upload to Play, change DNS or rotate signing credentials. Stop with build artifact matrix and remaining release approvals.
```

## UXI-07 — Guest Web Figma redesign + dynamic restaurant brand/catalog

**Branch:** `uxi/07-guest-web`. **Depends:** UXI-01/02/05. **Paths:** `apps/guest-web/src/components/{GuestShell,GuestPage,MenuContent,ProductConfigurator,GuestOrdering,GuestState}.*`, styles and relevant tests. Figma G01–G19, States.

```text
Implement Guest Web's approved Figma UX-01 visual structure against dynamic backend-driven per-restaurant menu and runtime branding. Preserve existing exact host/slug resolution, unauthenticated browse, Table QR/Common QR, `#qrToken` capability privacy, receipt/queue, idempotent checkout, BFF origin rules and read-only mode without QR.

Fetch safe runtime brand for resolved tenant with bounded freshness; never use San Thaw Tar palette for other hostnames. Use canonical logo/name/colors and product/variant image URLs with responsive fallback. Render editorial featured flag only from approved backend data. Build image-first card, search, category chips, detail/variants/conditional required & optional modifiers, quantity/notes, accessible cart/review, queue receipts and loading/empty/error/offline states. Required modifier groups must remain visible and validated, not removed because old Figma omitted them. Prices and availability remain server authoritative; no Figma sample price in data. Avoid inventing new URLs for embedded cart/confirmation if current state machine safely provides them.

Test San Thaw Tar red and fictional non-red restaurant, 320px/desktop, Burmese/English, modifier rules, wrong-tenant hosts, queue token secrecy, lost-response exact replay, category search, sold-out/stock/variant prices and update-after-reload branding. No live QR rotation, order, upload or deployment. Stop.
```

## UXI-08 — Customer Android home, catalog, account, cart and theme consumption

**Branch:** `uxi/08-customer-storefront`. **Depends:** UXI-01/02/05/06. **Paths:** `apps/customer-mobile/app/(store)/_layout.tsx`; storefront `Storefront.tsx`, `ProductScreen.tsx`; cart, profile UI, shared primitives/tests. Figma C01–C03/C12–C19/C24/C28–C34.

```text
Align Customer Android's Home/Menu/Product/Cart/Auth/Profile UI with Figma while keeping the same single source codebase used by every restaurant-specific Customer APK. Read its fixed embedded tenant identity, current Supabase auth/email confirmation, cart/account providers, menu API and D0 modifier/branding rules.

After app launch/resume load only the bound restaurant's safe runtime brand, show user-friendly failure/fallback and refresh after Owner/Manager color edits without rebuilding the APK. Preserve native launcher identity, deep links, session isolation and offline cache by restaurant. Show actual product/variant images, supported featured/editorial label, search/categories, price/stock, variants and mandatory/optional modifiers. Maintain existing cart validation, availability checks, special instruction and no durable cart promise without implementation. Rework visual density, cart rows, tab badges, account layout and error/loading/empty/forbidden states. Do not reimplement or weaken account/email confirmation or checkout recovery.

Verify two-tenant builds/fixed UUID, Myanmar/English, 200% text, no-photo state, required-modifier cart eligibility, owner-changed colors after refresh, signout/session transfer and non-red fixture. Run focused and root frontend tests. No live signup, installed APK claim or production release. Stop.
```

## UXI-09 — Customer Android address/checkout/order lifecycle

**Branch:** `uxi/09-customer-checkout`. **Depends:** UXI-08, existing geography code, hosted data gate for release only. **Paths:** `AddressScreen.tsx`, `LocationSelector.tsx`, `CheckoutScreen.tsx`, order detail and tests. Figma C04–C11/C20–C27/C30 + S states.

```text
Implement visual/layout/accessibility changes for Customer Address, delivery location, Quote/Checkout, COD receipt, owned order history and tracking. KEEP currently committed canonical Region -> District -> Township IDs, owned saved/temporary address, optional GPS/manual text, route safety and map-denied fallback. Do not invent ward/village master data or coordinates. Preserve exact server quote/checkout validation, ownership, durable request-key/confirmation recovery and historical delivery snapshots. Keep cash-on-delivery only where actually supported, server `canCancel` and safe reorder from current catalog, not historical prices.

Use actual runtime restaurant theme and return to safe same-tenant UI after theme refresh. Handle hierarchy resets, quote invalidation after destination/cart changes, unavailable zone, stale/partial source data and real server 401/403/409. No new checkout from a lost response unless original key/body recovery rules permit it. Do not mark geography hosting ready just because source tests pass. Test actual UI behavior using disposable fixtures and current code; document hosted migration/status as release BLOCKER when unverified. No hosted SQL, live orders or provider writes. Stop.
```

## UXI-10 — Operations orders, navigation, delivery and existing actions

**Branch:** `uxi/10-operations-core`. **Depends:** UXI-01/02/03/06. **Paths:** Operations workspace layout/navigation, dashboard, OrdersScreen, OrderDetailScreen, OrderCardActions, QueueScreen, DeliveryDetailScreen/DeliveriesScreen, CounterOrderPanel and related tests. Figma O01–O13/O37–O56.

```text
Redesign Operations role-aware navigation, dashboard, order list/detail, counter entry, queue and delivery tasks according to current UX-01 while retaining the existing Spring state machine. Do NOT introduce another Accept/Complete/Cancel API: use current `POST /orders/{orderId}/actions` and server availableActions, expectedStatus/stale conflict, reason length and permission gates. Completion of kitchen prep is NOT physical pickup, delivered COD or cash collection. Staff's early unpaid cancel grant differs from Owner/Manager full cancel; preserve cancellation stock/payment logic, actor/history and protected delivery contact. Assigned drivers see only current assignments; reassignments revoke prior access. Respect queue READY/CALLED/COMPLETED and existing physical pickup action.

Use backend runtime palette (not hard-coded red) and ensure all Owner/Manager/Staff/Driver routes remain reachable. Maintain current tenant fixed in build, live membership check and 401/403 boundaries; never use frontend gating as authority. Update only presentation/local state and tests unless a proven contract defect exists. Cover role matrix, stale actions, COD required flag, paid-order cancel rejection, queue/driver scope, offline/error states and no duplicate money/order writes. No live mutations/deployment. Stop.
```

## UXI-11 — Operations catalog, self-service prices, zones, team and QR

**Branch:** `uxi/11-operations-catalog`. **Depends:** UXI-03/04/05/10. **Paths:** `MenuScreen.tsx`, `model.ts`, `SettingsScreen.tsx` (only complementary changes), Tables/Team, imageUpload helpers, zone/location selector and tests. Figma O14–O20/O57–O62/O69, states.

```text
Improve Owner/Manager self-service Operations screens for catalog and configuration, preserving backend authority. Both roles must manage THEIR restaurant's categories/products/prices/variants/modifiers/images, availability and relevant operational settings through existing `MENU_MANAGE` / `SETTINGS_MANAGE` grants. Never require the platform operator to rebuild the APK or edit a JSON file for these runtime changes. Keep Owner-only team/ownership management and existing Owner-only logo upload; Manager can manage in-app palette from UXI-03 but not native icon/splash/package identity. Owner's editorial featured-product control is sourced from UXI-05 and scoped to one restaurant.

Keep safe reviewed image upload/replace (type/size, failure retains previous), actual product UUID, storage tenant scope, variant descriptions, modifier pricing/required selection and historical order snapshots. Zone editor uses canonical hierarchy/fees/minimums; default driver is restricted to configured eligible role; manual assignment may have different permitted roles. Table/Common QR tokens are one-time secrets; do not rotate or print sensitive QR in logs. Support inline validation, optimistic UI only where reversible, review/confirmation for destructive operations, accessibility and Manager/Staff/Driver 403. Use two-tenant tests proving changes to one restaurant never show in the other. Do not upload original media/live data or migrate production schema. Stop.
```

## UXI-12 — Finance visual alignment without new accounting engine

**Branch:** `uxi/12-finance-ui`. **Depends:** UXI-01/02/10. **Paths:** Operations `src/features/accounting/*` existing screens, `src/features/operations/ReportsScreen.tsx` and tests. Figma O21–O34/O41–O47/O63–O68.

```text
Adapt existing Operations financial dashboard, ledger, Shopping Planning, Purchasing, suppliers/payables, expenses, cashbook, closing, refunds and reports to Figma. No new accounting engine or role. KEEP immutable history, whole-currency exact decimal strings, restaurant-local day/month/year/range, 366-day maximum, bounded CSV private exports, distinct order-cohort sales vs collections vs refunds, current null profit/COGS, server authorization and stable financial request keys/reconciliation.

Shopping plan accepts item+quantity+unit only, without creating purchase obligations; actual Purchasing records true costs, payables and later payment events, never auto-posts planning changes. Do not describe unpaid orders as cash collected; do not display unsupported net profit, till custody, double entry, dynamic export schema/row previews or computed best-seller ranking. Relabel any misleading Figma 'recognized sales' with actual DTO semantics. Runtime branding may change card visuals but not math or tenant source. Test role restrictions, exact amounts/periods, duplicate posting/retries, exports/session/cache, cancellations/financial audits and Figma accessibility. No live financial writes. Stop.
```

## UXI-13 — Multi-tenant end-to-end regression, Figma visual QA and release readiness

**Branch:** `uxi/13-integrated-qa`. **Depends:** all accepted feature slices, approved staging environment. Figma every UX-01 page; UXI-00 40 findings/51 families/122 app screens/40 safeguards.

```text
Perform integrated acceptance of the updated architecture and Figma across two distinct synthetic restaurants A/B, including San Thaw Tar red and a contrasting non-red fixture. Produce a traceable screen/finding/safeguard matrix with implemented/tested/blocked/unverified counts and exact evidence; do not reuse historical QA numbers as new results.

Critical journey: trusted operator provisions A and B with separate owner, profile, palette, source photo mapping, catalog/prices/variants/modifiers, trusted onboarding handoff and separate two-APK-per-tenant build plans. Owner and Manager update products, prices and colors through Operations; Guest and Customer show changes after bounded refresh WITHOUT native rebuild; native launcher icon/splash/package identity remain unchanged. B never displays A's catalog/theme/orders/media. Owner controls featured product and existing logo upload; non-owners and other tenants are denied. Verify fixed embedded UUID, release config and deep links; no client tenant switch.

Regression: Table/Common QR + idempotent retry, read-only guest browse, customer auth/deep links/addresses/hierarchy/quote/COD/uncertain recovery, Staff early cancel, server Accept/Complete/Cancel, delivery pickup/COD, photo upload failure, historic pricing, shopping-vs-purchasing, sales/year/CSV, financial audit and 401/403/404 scopes. Check 320px/mobile/desktop, accessibility, Myanmar/English, reduced motion and offline/loading/error/forbidden states. Run `npm run verify:frontend`, `mvn --batch-mode -f app/api/pom.xml clean verify`, relevant PostgreSQL fixture tests, `npm run --silent mobile:build -- validate`; signed Android/FCM/Maps/store-release tests only when device/keys/permissions exist. Distinguish native JS export from signed installed-device PASS. Compare hosted migration ledger and actual full-resolution assets separately; no production migrations/uploads/QR rotation without approval.

Deliver docs/ux-multi-tenant-acceptance.md, red/yellow/green blockers with provenance, safe deployment sequencing (schema -> API -> apps/runtime media -> staged build -> public release), rollback/cache strategy and final GO/NO-GO. Do not deploy, commit or push. Stop.
```

---

## C. Dependency summary and approval gates

| Order | Milestone | Primary objective | Approval gate |
|---|---|---|---|
| Done | UXI-00 | Baseline audit (already completed) | Merge audit document or provide it to Codex |
| 0 | **D0** | Confirm owner-approved multi-tenant product rules and patch Figma mismatch | Review Figma modifier UI and runtime-vs-build theme authority |
| 1 | **UXI-01** | Semantic shared UI foundations | Two contrasting tenants render safely |
| 2 | **UXI-02** | Backend runtime theme authority | Inspect/approve any forward migration before applying anywhere hosted |
| 3 | **UXI-03** | Owner/Manager self-service theme editor | Manager colors work; logo remains Owner-only |
| 4 | **UXI-04** | Operator provisioning + initial catalog/image workflow | Secure, repeatable synthetic Restaurant B onboarding |
| 5 | **UXI-05** | Curated featured product and media-ID manifest | Approved photo originals + exact UUIDs required for production publication |
| 6 | **UXI-06** | Shared-code per-restaurant Android build metadata | No source forks; immutable app IDs, safe fallback theme |
| 7 | **UXI-07** | Guest Web UX-01 | Runtime brand/menu refresh and QR replay preserved |
| 8 | **UXI-08** | Customer storefront/cart/account UX-01 | Runtime theme + variant/modifier regression |
| 9 | **UXI-09** | Customer geography/checkout/orders UX-01 | Hosted geography checked before release, COD recovered safely |
| 10 | **UXI-10** | Operations core/order/delivery UX-01 | Role/state/payment invariants |
| 11 | **UXI-11** | Operations catalog/tenant settings UX-01 | Owner/Manager edit actual data without rebuild |
| 12 | **UXI-12** | Finance UX-01 | Preserve exact source-of-truth/accounting semantics |
| 13 | **UXI-13** | Full tenant A/B QA and release decisions | Device/hosted schema/asset evidence honestly separated |

**Useful parallelism:** UXI-01 and UXI-02 can be developed separately once D0 is reviewed, but integration must wait for contracts. UXI-07/08/10 can start once foundations + runtime theme API are stable; do not start dependent features against invented backend contracts. One prompt at a time remains safest for the user's single workspace.

## D. User-run Windows PowerShell branch handoff

```powershell
Set-Location 'C:\RestaurantManagementSystem\Restaurant-Platform'
git status -sb
git branch --show-current
git rev-parse HEAD
# Only after prior changes have been reviewed/committed/merged and the tree is clean:
git switch main
git pull --ff-only origin main
# Example for D0 (create this yourself; Codex is instructed not to create it):
git switch -c uxi/d0-product-decisions
```

If the UXI-00 audit file is only on an unmerged branch, **do not assume that `main` contains it**. Merge/bring that reviewed document forward first or point Codex to the exact available audit content. Do not include `.postman/`/`postman/` in broad staging without inspecting contents/secrets.

## E. Additional decisions that are NOT silently authorized

Manager gaining logo-upload permissions (currently Owner-only); installed-app icon/name changes without store release; platform-admin impersonation of Owner; any new direct Supabase client write; automatic best-seller sales ranking; new modifier removal; new customer notification preferences; historical order repricing; COGS/net profit claims; live production migration/media uploads; hosted domain changes; store publishing. Escalate those as separate user approvals.
