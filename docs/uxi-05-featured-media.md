# UXI-05 — Owner-curated Featured and safe catalog media

Date: 20 November 2026 (Asia/Bangkok). Scope: UXI-05 only. Source implementation and verification record; hosted publication and visual approval remain separate gates.

## Baseline and assessment

Branch: `uxi/05-featured-media`. Starting HEAD: `31f57546add3be0ee6d2d93a9799adb3d86533a6`. Starting staged/unstaged tracked diffs were empty. Existing untracked `.postman/` and `postman/` directories were preserved without opening their private contents. No reset, stash, branch switch, staging, commit or push was performed.

The team read the seven requested baseline/policy/amendment/roadmap/UXI-02/03/04 documents completely using bounded reads, plus relevant API, authorization and catalog/media source. Working source and history confirm UXI-01 semantic tokens/native primitives (`740dc6a`), UXI-02 canonical runtime branding (`91e7fb4`), UXI-03 Operations runtime editor/provider (`ddd3115`) and UXI-04 bootstrap/manifest/receipt implementation (`31f5754`). Historical “unstarted” statements in D0 and the v2 roadmap describe their authoring baseline; they do not override these implementations. This milestone extends the existing source and stops before UXI-06.

| Assessment | Decision |
| --- | --- |
| KEEP | Existing Product IDs, prices, stock, variants, required/optional modifiers, immutable order snapshots, public menu, verified JWT/membership authorization, Spring-mediated product/variant uploads, Supabase tenant paths, UXI-04 manifest/receipts/stale-head concurrency and separate Platform Admin setup authority. |
| ADAPT | Add optional public editorial metadata, focused Operations selection/media states and stricter validation for new approved media reviews. Preserve older fixtures and exact recorded operation replay. |
| ADD | One canonical tenant-scoped Featured selection, Owner-only permission and revision-checked route, explicit review/confirmation, and focused synthetic security/concurrency/UI tests. |

## Canonical persistence and lifecycle

Forward-only source migration: `supabase/migrations/20261120100000_add_restaurant_featured_product.sql`, after the UXI-04 migration. `restaurant_featured_product` uses restaurant UUID as primary key, nullable actual product UUID and editorial revision. A composite foreign key `(product_id,restaurant_id)` references the existing `products(id,restaurant_id)` unique constraint `uq_product_id_restaurant`, enforcing tenant membership without another product index. A separate small server-only row avoids product-wide flag races, JSON configuration authority and touching profile/order/price data. At most one selection exists per restaurant.

Missing row returns `NONE`, null UUID, revision 0. Explicit clear keeps the row and increments revision, preserving stale-review protection. Every successful PUT increments revision, even a repeated pick/clear. The active restaurant parent is locked before checking revision, serializing concurrent first writes and replacements. Management reads snapshot selection UUID/revision together so an initial concurrent selection cannot pair an old `NONE` with its new revision.

Selected unavailable products remain selected with `UNAVAILABLE`; no alternative is promoted. Displayability follows the existing final menu projection (active category, availability, stock, variants, modifier feasibility) and requires an actual usable price. Public product/options/price representations remain unchanged. Existing removal uses availability/category flags. Hard deletion or tenant reparenting of a selected product is restricted until Owner clear/replace; no hard-delete workflow is added. No production pick or tenant defaults are seeded.

RLS is enabled with no client policies; PUBLIC, anon, authenticated and service_role table privileges are revoked. Spring must use its reviewed server database principal after JWT/membership authorization. Hosted principal access and migration parity have not been verified.

## Implemented contracts and roles

| Route | Actual behavior |
| --- | --- |
| `GET /api/v1/restaurants/{restaurantId}/featured-product` | Existing `MENU_READ`: Owner/Manager/Staff status read; Driver denied. |
| `PUT /api/v1/restaurants/{restaurantId}/featured-product` | New `FEATURED_MANAGE`, granted only to Owner in the requested restaurant. Anonymous, Manager, Staff, Driver and foreign-tenant actors denied. Platform Admin allowlisting grants no Owner membership. |
| Existing `GET /api/v1/public/restaurants/{restaurantId}/menu` | Adds `featuredProduct: {productId,status}`; no new public promotion route. |

PUT requires explicit `productId` (UUID or null) and nonnegative safe `expectedRevision`; unsupported fields and missing/invalid product UUIDs fail validation. Selection requires an actual eligible same-tenant product. Stale writes return `409 FEATURED_PRODUCT_STALE`; revision exhaustion returns 409, unavailable selections are rejected with 400, and unknown/foreign product IDs return scoped 404. Actor identity always comes from the verified JWT. Success and relevant error responses are no-store; public menu success is also no-store.

Management `FeaturedProductResponse` has only `restaurantId`, `productId`, `status`, `revision`. Public `FeaturedProductDto` excludes revision and private identities/configuration/bootstrap/media review records. States are `NONE` (null product UUID), `AVAILABLE` (selected and currently displayable) and `UNAVAILABLE` (selected UUID retained). Shared TypeScript exports mirror these DTOs. The existing member client exposes `getFeaturedProduct` and `updateFeaturedProduct`, validates its fixed restaurant identity, projects only editorial write fields and requires a matching newer server confirmation. Writes never retry automatically.

Public metadata is optional in shared types for older servers/fixtures. The Guest parser preserves only safe optional metadata and strips private extras; malformed metadata or an invalid AVAILABLE association is discarded without breaking the catalog. Customer already consumes the additive public response without requiring Featured. Guest/Customer image, variant, modifier, pricing, stock and cart representations were inspected; existing catalog rendering remains in place. Full Guest/Customer Featured presentation is deferred to UXI-07/08.

## Operations workflow

The existing products tab contains a focused Featured card using UXI-01 components and runtime tokens. Owner sees the current server selection and can propose a single eligible product, replace or clear it. A review dialog displays old/proposed values and expected revision. Cancel does not write. Saved feedback appears only after backend confirmation. Manager and Staff see read-only status; existing catalog editing remains available to Manager. Driver retains the existing menu route restriction and sees no editorial action.

The panel has independent loading/error/offline/forbidden states so a Featured read failure does not prevent normal catalog work. Duplicate submission is gated. Identity/lifetime guards reject obsolete responses; conflict or uncertain save blocks another write until successful explicit refresh and new review. Catalog refresh also refreshes editorial availability. Text uses scalable shared primitives, labelled controls and existing confirmation focus/announcement behavior. Automated component checks are not installed-device screen-reader or 200% text acceptance.

Product and variant image controls now distinguish existing published image, local preview (not published), explicit upload, pending upload, failure/uncertainty, server confirmation and missing/failed-image fallback. Discard removes the preview without changing published data. Server DTO ID and image URL are checked before success feedback; duplicate uploads and obsolete responses are guarded. Ambiguous upload requires checking current server state before another upload. Image upload and Featured remain separate actions. No persistent alt text/crop metadata is added.

## Media manifest reuse and originals

No second manifest/table/bootstrap pipeline was introduced. UXI-04 remains the reviewed mapping authority and durable receipt ledger. New APPROVED entries require a safe original basename, actual restaurant/product/variant association and observed 64-hex SHA-256. Unknown/unverified product mapping remains PENDING. Variant IDs must belong to the stated actual product in that tenant. Exact recorded legacy receipt replay still precedes new proposal validation; operation-key hashes and stale-head concurrency are preserved. The API client permits exact legacy payload replay while the server validates new proposals and the Admin builder requires a hash for new approval. Manifest `uploadStatus` stays PENDING; approval never verifies published bytes or changes Storage.

Read-only integrity checks found the six JPEGs under `C:\RestaurantManagementSystem\San Thaw Tar Photos\food` and the PNG under `logo`. All observed values match the supplied candidates:

| Original relative path | Dimensions | Observed SHA-256 |
| --- | --- | --- |
| `food/Ah-Sein-Kyaw.jpg` | 736×920 | `7a98eb6878f199d253197fb4106e343123309c494027dfab76d6ad59f030b01b` |
| `food/Fried-Noodle.jpg` | 736×736 | `6f250770ed028360e7adf608702b45f8200e1154b5f13aed9cd12b9375846f11` |
| `food/Fried-Rice.jpg` | 736×1104 | `999133ea6750e318a02ccb551fceac8a8acc980f4304e2a3ae424cd2378472b7` |
| `food/Kan-Sone-Plain.jpg` | 676×1200 | `87d9ecf522ccb64e05f1f764f1b804ade188eea684533ea9e608d9040db26203` |
| `food/Kyay-Oh-Se-Chat.jpg` | 736×861 | `e068f030300e97846aaf2e28bfe7d89dd65c481585e798a43a486e022d70b293` |
| `food/Malar-Xiang-Guo.jpg` | 736×981 | `0e10f91ce19af367a2999decfae332bacefc2ee6f4652bd11de4afc2cf3deadd` |
| `logo/Burmese Red and Gold Food Emblem.png` | 1254×1254 | `780758f968cde0a6d83ca8dc100f804efd1eb9b94f46f4a3eb27d2b413b90fd1` |

For **each** candidate: restaurant UUID PENDING; actual product/variant UUID PENDING (logo product association not applicable); intended association PENDING owner review; ownership/provenance/quality approval PENDING; intended crop/display treatment PENDING; upload/publication PENDING, no production URL. The intended Mala pick cannot be selected until its exact tenant product UUID and explicit Owner review exist. Filenames and hashes do not supply this authority. Originals were not copied, reconstructed from Figma, uploaded or attached to any real record.

Read-only visual inspection also identified a concrete logo quality gate: the candidate PNG includes a visible checkerboard background and decodes as `Format24bppRgb` with sampled alpha 255. It is opaque, so it does not establish the approved transparent-logo requirement despite matching the supplied filename/hash. An approved transparent original is still needed; no image was edited to manufacture one.

## Upload safeguards and synthetic evidence

Existing Spring endpoints require `MENU_MANAGE`, verify product/variant tenant membership before Storage, validate PNG/JPEG/WebP MIME/signatures and maximum 5 MiB, write unique tenant/product/variant object paths and update only the image URL after Storage success. Existing images survive upload failure; price/stock updates are not overwritten by old snapshots. No direct public/mobile Supabase Storage access is added. Tests use synthetic A/B fixtures and mocked Storage only.

Focused HTTP, SQL/service and frontend coverage checks separate A/B selections/catalog/media, cross-tenant writes, unrelated variant IDs, invalid/missing hashes and filenames, unknown mapping UUIDs, unauthorized Storage operations, failed-upload image preservation, duplicate submissions, truthful manifest upload state, old receipt recovery and stale concurrent media review. Real database checks exercise parent locking, FK/grants, rollback and first/replacement revision races. Existing pricing/order/variant/modifier suites remain part of repository verification; no tests were weakened.

## Current Figma evidence and gaps

Read-only inspection used the original [Restaurant Platform file](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform): brand kit `88:118`, G19 `101:123`, C01 `14:3`, O05 `15:137`, O14 `39:554`, O15 `39:605`, O57 `72:2944`, O58 `72:2964`, O69 `101:3127`, audit `27:2` and discovered descendants `27:137`, `27:349`, `27:425`. Design context and O14/O57 screenshots were inspected. Audit canvas design context returned a selection diagnostic; metadata and descendant contexts succeeded.

The current kit explicitly makes San Thaw Tar a tenant preview and gold Owner-curated Featured; G19/C01 use editorial Featured and configured modifiers. O14 uses Review/Discard and current O57 explains preview/original UUID pending, failure/discard and deferred persistent alt text. O15/O58 retain variants/modifiers. **O05 and O69 still contain historical “Best seller” row copy**, and some component descriptions still omit modifiers. Approved D0 policy governs source behavior. No Figma edits, preview asset extraction or production asset reconstruction occurred. Focused controls compose existing design patterns; source test success is not final Figma design approval or pixel/device acceptance.

## Verification

| Executed check | Actual result |
| --- | --- |
| Initial combined focused Maven HTTP/role/media/bootstrap/public-variant checks | **PASS**, 61 tests, no failures/errors/skips. |
| Recompiled Featured PostgreSQL/service focus | **PASS**, 4 tests: real database constraints, concurrent writes, rollback/history preservation, cold-read revision race and invalid-price projection. |
| Final offline Maven `clean verify` | **PASS**, exit 0: 659 discovered, 638 passed, 21 Docker-only skipped, zero failures/errors; API JAR built/repackaged. |
| Local PostgreSQL suites within the final run | **PASS**, including Featured 2, bootstrap 4, runtime branding 2 and Owner-onboarding 8; existing accounting/delivery/geography database suites also ran. |
| Exact PostgreSQL 17 Testcontainers migration suite | **SKIPPED**, 21 cases: Docker daemon unavailable. New source schema/grants/service hooks remain ready for that environment. |
| Final frontend typechecks and lint, all workspaces | **PASS**. |
| Final complete frontend tests | **PASS**, 1,560 Vitest tests across 134 files plus 32 Node tests, no failures/skips. Includes API-client 243, Admin 220, Guest 236, Operations 457, Customer 392 and tokens 12. |
| Final Admin Web and Guest Web production builds | **PASS**. |
| Normal `npm run verify:frontend` aggregate | **FAIL**, exit 1 at the existing Operations Firebase starter mismatch after all checks above passed. |
| Customer starter export in the aggregate | **SKIPPED / NOT REACHED**, because the preceding Operations export failed. |
| `npm run --silent mobile:build -- validate` | **PASS**, 18 existing reviewed build configurations; no native release. |
| Candidate integrity checks | **PASS**, seven dimensions/hashes match; production suitability/approval remains PENDING, including the opaque logo issue. |
| `git diff --check`, branch/HEAD, staged diff and scoped inventory | **PASS**, 52 scoped files, same branch/HEAD and empty staged diff; Postman paths preserved. |
| Hosted Supabase schema/Auth/Storage acceptance; actual production UUID selection/publication | **NOT RUN / BLOCKED** on separately reviewed production inputs and authorization. |
| Final Figma approval, browser/device pixel/TalkBack/200% text acceptance, signed Android build | **NOT RUN**, no approval claim. |

Final frontend log: `target/uxi-05-frontend-final.log`; initial restricted run: `target/uxi-05-frontend-verification.log`. The initial run passed 242/243 API-client tests and failed only the existing real-loopback HTTP transport test with `ApiNetworkError`; the same unmodified suite passed 243/243 with local network permission. No test was disabled to bypass the restriction.

The normal Operations starter export still fails before bundling because `OPERATIONS_GOOGLE_SERVICES_FILE` does not supply the Firebase Android client for `dev.restaurantplatform.starter.operations.staging.dev` in `MOBILE_FIREBASE_PROJECT_ID`. This is the existing starter-environment mismatch documented in UXI-01/02/03/04. No private Firebase JSON, `.env`, notifications setting or application identity was edited. No notification-disabled workaround export or signed native build was performed; the normal aggregate remains red.

Backend logs: `target/uxi-05-backend-focused.log`, `target/uxi-05-featured-db-final.log`, `target/uxi-05-maven-verification.log` and `target/uxi-05-maven-final.log`. An initial focused compile caught an incorrect test fixture ID class, which was corrected. The initial full Maven run discovered 659 tests with zero assertion failures, one new history-fixture cleanup error and 29 skips. Maven had compiled an earlier fixture version while its transaction-bound rollback change was being finalized; bytecode inspection confirmed the discrepancy. Recompiling the final test source passed all four focused database/service checks. The final clean run also corrects the dedicated Owner-onboarding test database URL; the initial full run's eight Owner-onboarding skips were configuration, separate from Docker skips. No immutability trigger was disabled or historical record deleted to make cleanup pass; final snapshot fixtures roll back their entire transaction.

Final Maven used installed JDK 21, Maven 3.9.11, the cached Byte Buddy 1.18.11 test JVM agent and explicit loopback fixture URLs. It ran with local socket permission; no repository dependency/test-agent configuration changed. The successful clean run compiled the final source after all backend edits ended and completed at 15:33 Bangkok. Independent read-only review found no blocking backend/shared-contract/tenant-security issues. Evidence logs are ignored local artifacts, not production acceptance records.

Database execution uses the disposable PostgreSQL 16.4 loopback fixture (`accounting_verify` and separate `owner_onboarding_verify`). The final new migration was applied unchanged locally. This retained fixture's historical migrations previously omitted PostgreSQL-17-only `MAINTAIN` clauses in temporary copies; source migrations were not changed. Fresh PostgreSQL 18 initialization was attempted and failed with Windows `0xC0000005` during post-bootstrap. **No PostgreSQL 17+ or exact unchanged full migration-chain acceptance is claimed.** The new schema, actual JPA/service transactions, grants, tenant isolation and concurrency are verified only to the local version and tests actually executed. Docker/hosted/version acceptance remains a rollout gate. Local logs and failed-run synthetic history stay in ignored disposable fixture data; no real tenant records were used.

The disposable PostgreSQL 16 fixture was stopped cleanly after the final successful verification; data/logs were retained without deletion.

## Rollout and remaining publication gates

The migration is a source-only review artifact. Hosted application is NOT RUN. Before any separately authorized rollout: review SQL/backups and full migration ledger, execute exact PostgreSQL 17+ chain tests, verify hosted RLS/grants/server-principal access, apply reviewed schema before new API, then release clients and validate same-tenant/public contracts. Retain the additive table and increasing revisions during application rollback; use forward repair rather than dropping selections or resetting revision. Hosted schema/API parity and Storage/provider acceptance remain unverified.

Production publication remains blocked on real restaurant/product/variant UUIDs, original provenance/owner approval, reviewed mapping/crop/display treatment and separately authorized upload verification. Native release identity, Firebase starter configuration, signed builds, device accessibility and final design review remain separate gates. UXI-06 prerequisites are reviewed provisioned tenant/build metadata and its separately requested milestone; no native IDs/icons/splash/signing or build tooling is changed here. No UXI-06 or later implementation, hosted SQL, production media upload, real invitation/order/payment/finance action, deployment, commit, push or merge was performed.

## Exact changed files

52 scoped source, test, migration and documentation files; existing Postman paths are excluded.

```text
app/api/src/main/java/com/restaurant/platform/common/error/GlobalExceptionHandler.java
app/api/src/main/java/com/restaurant/platform/controller/FeaturedProductController.java
app/api/src/main/java/com/restaurant/platform/controller/PublicMenuController.java
app/api/src/main/java/com/restaurant/platform/dto/menu/FeaturedProductDto.java
app/api/src/main/java/com/restaurant/platform/dto/menu/FeaturedProductResponse.java
app/api/src/main/java/com/restaurant/platform/dto/menu/PublicMenuResponse.java
app/api/src/main/java/com/restaurant/platform/dto/menu/UpdateFeaturedProductRequest.java
app/api/src/main/java/com/restaurant/platform/entity/RestaurantFeaturedProduct.java
app/api/src/main/java/com/restaurant/platform/repository/RestaurantFeaturedProductRepository.java
app/api/src/main/java/com/restaurant/platform/security/RestaurantPermission.java
app/api/src/main/java/com/restaurant/platform/security/RestaurantRole.java
app/api/src/main/java/com/restaurant/platform/service/FeaturedProductService.java
app/api/src/main/java/com/restaurant/platform/service/PlatformRestaurantBootstrapService.java
app/api/src/main/java/com/restaurant/platform/service/PublicMenuService.java
app/api/src/main/resources/messages_en.properties
app/api/src/main/resources/messages.properties
app/api/src/test/java/com/restaurant/platform/controller/FeaturedProductHttpTest.java
app/api/src/test/java/com/restaurant/platform/integration/FeaturedProductDatabaseChecks.java
app/api/src/test/java/com/restaurant/platform/integration/FeaturedProductLocalPostgresTest.java
app/api/src/test/java/com/restaurant/platform/integration/PlatformBootstrapDatabaseChecks.java
app/api/src/test/java/com/restaurant/platform/integration/PostgresMigrationSchemaTest.java
app/api/src/test/java/com/restaurant/platform/security/RestaurantRoleTest.java
app/api/src/test/java/com/restaurant/platform/service/CatalogImageServiceTest.java
app/api/src/test/java/com/restaurant/platform/service/FeaturedProductServiceTest.java
app/api/src/test/java/com/restaurant/platform/service/ImageUploadValidatorTest.java
app/api/src/test/java/com/restaurant/platform/service/PlatformRestaurantBootstrapServiceTest.java
app/api/src/test/java/com/restaurant/platform/service/PublicMenuVariantDescriptionTest.java
apps/admin-web/src/components/RestaurantBootstrap.tsx
apps/admin-web/src/lib/bootstrap.test.ts
apps/admin-web/src/lib/bootstrap.ts
apps/guest-web/src/lib/menu.test.ts
apps/guest-web/src/lib/menu.ts
apps/operations-mobile/src/components/imageUpload.test.ts
apps/operations-mobile/src/components/imageUpload.ts
apps/operations-mobile/src/components/useImageUpload.ts
apps/operations-mobile/src/features/menu/CatalogImageControl.tsx
apps/operations-mobile/src/features/menu/featured-media.test.tsx
apps/operations-mobile/src/features/menu/FeaturedProductPanel.tsx
apps/operations-mobile/src/features/menu/MenuScreen.tsx
docs/api.md
docs/role-permission-matrix.md
docs/uxi-05-featured-media.md
packages/api-client/README.md
packages/api-client/src/bootstrap.test.ts
packages/api-client/src/bootstrap.ts
packages/api-client/src/clients.ts
packages/api-client/src/featured.test.ts
packages/api-client/src/featured.ts
packages/shared-types/src/api.ts
packages/shared-types/src/featured-api.ts
packages/shared-types/src/index.ts
supabase/migrations/20261120100000_add_restaurant_featured_product.sql
```
