# UXI-02 — Backend-authoritative runtime restaurant branding

Date: 19 November 2026 (Asia/Bangkok). Scope: UXI-02 only.

## Persistence decision (recorded before implementation)

Keep `restaurants.name` and `restaurants.logo_url` as the only canonical public identity fields. Add `restaurant_runtime_branding`, keyed by the existing restaurant UUID, containing only primary, secondary and background six-digit colors and a palette revision. A separate server-only table gives runtime palette writes an explicit RLS/grant boundary and avoids coupling palette concurrency to unrelated profile, lifecycle, order or settings edits. `RestaurantPlatformConfiguration` remains deployment metadata, never a runtime fallback or second editable palette.

No backfill or tenant-specific default is justified: a missing row returns `palette: null, revision: 0`. A stored palette starts at revision 1. Authenticated Owner/Manager writes reuse `SETTINGS_MANAGE`; all palette writers lock the active parent restaurant row before checking the expected revision and persisting the complete palette in one transaction. This also serializes concurrent first writes. A trusted platform-admin initialization endpoint uses the same authority and lock, and can only initialize revision 0. Revisions describe palettes, not name/logo identity; all responses use `Cache-Control: no-store` and do not offer revision-based 304 responses.

Validation accepts exactly three `#RRGGBB` colors, normalizes uppercase and rejects missing/unknown fields. Semantic foregrounds, contrast, focus and status colors remain the responsibility of UXI-01 `resolveThemeTokens`/`ThemeProvider`; storing additional derived colors or duplicating that resolver in Java would create competing presentation logic. Any valid sRGB color has a readable black/white foreground under that resolver. Runtime absence/invalidity uses only the current tenant's reviewed build fallback, then neutral tokens.

## Verified baseline and Figma

Branch `uxi/02-runtime-branding-api`; starting and ending HEAD `740dc6a9df64df2c9bc4c9b56ab13380e17d881d` (UXI-01, PR #41). At start, staged/unstaged tracked diffs were empty. Existing `.postman/` and `postman/` files were preserved without reading their private contents. No applicable `AGENTS.md` was found. HEAD is the merged UXI-01 change: 13 foundation/component/test/report files, 1,328 insertions and 178 deletions; this milestone builds on those current implementations, not historical UXI-00 mappings. All five requested baseline documents were read completely across the implementation review.

Read-only current Figma inspection used the five requested nodes: [brand kit `88:118`](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=88-118), [settings `39:742`](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=39-742), [ordering settings `72:3041`](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=72-3041), [foundations `12:76`](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=12-76), and [audit coverage `27:2`](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-2). Their current text confirms tenant-only red, backend runtime authority, Owner/Manager colors, Owner-only logo, release-managed native identity, failed-save/stale handling and pending visual/runtime/device review. No Figma mutation or visual/device acceptance is claimed.

## Actual API and authorization

| Method and endpoint | Permission and behavior |
| --- | --- |
| `GET /api/v1/public/restaurants/{restaurantId}/branding` | Public read of an active restaurant; no private configuration or membership read |
| `PUT /api/v1/restaurants/{restaurantId}/branding` | Existing `SETTINGS_MANAGE`, exactly Owner/Manager in that restaurant, actor derived from JWT |
| `POST /api/v1/platform/restaurants/{restaurantId}/branding` | Existing platform-admin UUID allowlist; initializes an active restaurant once, expected revision 0 |

`RestaurantBrandingResponse` contains exactly `restaurantId`, `displayName`, `logoUrl`, `palette`, `revision`. `RestaurantPalette` contains only `primaryColor`, `secondaryColor`, `backgroundColor`. `UpdateRestaurantBrandingRequest` contains only `expectedRevision` and `palette`. Bean validation and service validation reject incomplete/invalid values; JSON any-setters reject extra logo, actor, tenant or deployment fields. The database also enforces all three colors and revision range 1–9007199254740991. Writes normalize colors uppercase; stale saves return `409 RESTAURANT_BRANDING_STALE`, and revision exhaustion has its own 409 code. Identity/profile changes do not increment the palette revision.

The public logo is read from the canonical Restaurant and projected only when HTTPS, without user info/fragments, and with either no query or exactly the existing `v=<UUID>` upload cache-buster. Signed/token query URLs and unsafe legacy values become null. No client-supplied logo is accepted by palette management. The public read deliberately allows A and B as public identities but always queries their own UUID; authenticated management remains tenant-isolated. There is no overlapping authenticated brand-read endpoint.

Shared TypeScript exports `RuntimeBrandingPalette`, `RestaurantBrandingResponse`, `UpdateRestaurantBrandingRequest`. Existing client factories gain `publicClient.getBranding()`, `memberClient.updateBranding(request)` and `adminClient.initializeBranding(id, request)`. Response checking validates the fixed UUID and safe revision, projects the public fields, filters unsafe logos and maps missing/invalid palettes to null. Request projection sends only the revision and three colors. No mutable/global cache, UI, shell fetching or tenant switching was added.

## Logo gap and compatibility

Previously `RestaurantManagementService.updateRestaurant()` assigned `logoUrl` under `SETTINGS_MANAGE`. It now rejects changed non-null URLs with `403 RESTAURANT_LOGO_UPLOAD_REQUIRED` before mutating any profile field. Null/omitted fields preserve the canonical logo; normalized unchanged URL resends remain compatible with Operations Settings and the existing API client. Profile writes never assign the logo, so a concurrent Owner upload is not overwritten by a stale profile entity. The dedicated Owner-only Spring upload, validation, Storage call and cache-buster remain unchanged. Trusted existing platform lifecycle and self-onboarding identity contracts were inspected and retained.

## Refresh, fallback and provisioning

All successful branding reads/writes and branding errors use `Cache-Control: no-store`; no palette-revision ETag or conditional 304 is used. Client transport already omits cookies, disables storage caching and checks redirects against the configured origin. Future consumers fetch at launch/foreground, after save/profile/logo success, or on explicit bounded retry, and immediately use a successful saved DTO. Failed saves must leave persisted/visible safe state intact. Refetch and review on 409; automatic write retries are disabled.

Any retained snapshot must be validated for the exact API base URL/environment plus restaurant UUID, discarded when either changes, and revalidated before being treated as current. Failed refresh can retain only that scope's last safe snapshot; otherwise use the same restaurant's reviewed embedded palette, then UXI-01 neutral tokens. Names/slugs, another tenant's palette, and platform deployment colors cannot select fallback. This milestone introduces no persistent client cache. Existing mobile `ThemeProvider` fixed-UUID guards and native identity remain intact.

Initial provisioning remains the existing Auth/Owner/restaurant lifecycle. The new admin POST is a resumable follow-up using its real returned UUID and the same canonical palette transaction, without Auth invitation, Storage writes, Owner impersonation or fake membership. Existing `PlatformAdminAuthorization` gives 401 for anonymous, 403 for a nonallowlisted subject, and 503 if the server allowlist is missing. An initialized palette cannot be reseeded by this route, including after an Owner/Manager has edited it. Full onboarding UI/catalog/media work is deferred to UXI-04.

## Migration, rollout and recovery

New forward-only migration: `supabase/migrations/20261119090000_add_restaurant_runtime_branding.sql`, ordered after the current 20261116 migrations. It creates only the new table/FK/checks/comments, enables RLS and revokes all table grants from PUBLIC, anon, authenticated and service_role; there are no client RLS policies. Spring uses its server database principal after application authorization. No restaurant UUID/settings/history is rewritten and no real palette is seeded, including San Thaw Tar. No hosted migration, database or Storage mutation was performed.

Before hosted rollout: review/approve the SQL and application diff; verify the actual hosted migration ledger, backup/recovery readiness, RLS/default grants and the server database principal's access. Apply the approved additive migration before deploying the API's new entity mapping. Then verify public projection and two-tenant authorization in a reviewed environment. Palette initialization must use approved tenant values through the trusted route; never infer San Thaw Tar's current hosted palette. Future consumers can roll out after API validation without changing native launcher/splash/package/signing identity.

Recovery is application rollback with the additive table and data retained. Do not drop the table to roll back: doing so loses palettes and breaks the new API mapping. Use an approved forward repair migration or authorized revised palette write if correction is required; preserve/increase revisions rather than resetting them. Rolling back the profile security fix restores the old vulnerability, so retain that fix during application recovery. Because branding is uncached, later consumers should discard failed/foreign snapshots and refetch rather than require a global cache purge. Hosted migration application and deployment require separate explicit approval; neither is part of this source-only milestone.

## Verification

| Executed check | Result |
| --- | --- |
| Focused Maven `test` with `RestaurantBrandingHttpTest,RestaurantProfileLogoHttpTest,RestaurantLogoServiceTest,RestaurantManagementServiceTest,RestaurantAuthorizationTest,RestaurantRoleTest,PlatformAdminAuthorizationTest,RuntimeBrandingLocalPostgresTest` | **PASS**, 65 tests, 0 failures/errors/skips. Includes 21 branding HTTP cases, 16 profile/logo HTTP cases and 2 real PostgreSQL branding tests. |
| `mvn --batch-mode -f app/api/pom.xml clean verify`, with the disposable loopback `ACCOUNTING_TEST_DATABASE_URL` | **PASS**, exit 0; 587 discovered, 564 passed, 23 skipped, 0 failures/errors. Built/repackaged the API JAR. Existing order/payment/QR/delivery/accounting/geography/tenant-security suites passed within their coverage. |
| Exact PostgreSQL 17 Testcontainers ordered migration suite | **SKIPPED**, 15 tests: Docker daemon unavailable. The separate Owner-onboarding PostgreSQL suite also **SKIPPED**, 8 tests: its distinct `OWNER_ONBOARDING_TEST_DATABASE_URL` fixture was not configured. These are the 23 aggregate skips. |
| Real local PostgreSQL constraints, RLS/grants, Hibernate mappings, service races and rollback | **PASS**, PostgreSQL 16.4 disposable fixture, all 33 migration files applied with the qualification below. New UXI-02 SQL was applied unchanged. Two initial writes (admin initialization vs member save) and two revision-1 writes each produced exactly one successful save and one stale conflict. A flushed revision-3 transaction rolled back to the exact prior three colors/revision; a second tenant stayed unchanged. |
| Shared-types build/typecheck/lint; API-client build/typecheck/lint | **PASS**. Final API-client build/typecheck/lint rerun after the stricter logo-query projection. |
| Final `npm run test -w @restaurant-platform/api-client` outside sandbox | **PASS**, 162/162 across 14 files, including 51 new branding cases and the existing real-loopback transport test. |
| `npm run verify:frontend` outside sandbox | Typecheck, all lint, 1,302 Vitest tests across 122 files plus 32 Node tests, and both web production builds **PASS**. Aggregate **FAIL**, exit 1, at Operations starter JavaScript export's pre-existing Firebase client/package mismatch. Customer starter export was not reached (**SKIPPED**). The aggregate test stage preceded the final 11 additional logo-query cases; the final complete API-client suite above covers that change. |
| `npm run --silent mobile:build -- validate` | **PASS**, 18 reviewed build configurations validated; no APK/AAB/native rebuild. |
| `git diff --check`; final staged diff/branch/HEAD review | **PASS**; staged diff empty, branch/HEAD unchanged. |
| Hosted migration/data/media inspection or writes; deployment; installed Android/visual accessibility acceptance | **NOT RUN** within this milestone. Hosted migration/deployment remains **BLOCKED pending separate approval**. |

Local environment evidence: sandboxed API-client testing initially passed 150/151, with only the existing loopback transport test failing `ApiNetworkError`; final unsandboxed 162/162 resolves that restriction without weakening tests. Sandboxed Maven self-attachment stalled; final focused/full runs outside the sandbox passed. An initial in-progress focused run used compiled classes before the branding error-header change and failed nine cache-header assertions; the final rebuilt run passed all 65 cases. No repository test-agent configuration was changed.

PostgreSQL qualification: local PostgreSQL 18 `initdb` crashed during post-bootstrap with Windows exception `0xC0000005`. PostgreSQL 16 ran on disposable loopback port 45492. Only temporary fixture copies of historical migrations `20261016051330_remote_schema.sql` and `20261016052430_revoke_unneeded_table_privileges.sql` omitted PostgreSQL-17-only `MAINTAIN` privilege clauses; both original files are untouched. This validates the unchanged new migration, constraints/grants and actual service behavior, but does **not** certify those historical MAINTAIN clauses or the exact unmodified PostgreSQL-17 migration chain. CI/reviewed PostgreSQL 17+ verification remains a rollout gate. No hosted database was involved.

The normal frontend aggregate remains red because `OPERATIONS_GOOGLE_SERVICES_FILE` does not match the existing `dev.restaurantplatform.starter.operations.staging.dev` Firebase Android client in the local project. No `.env`, Firebase JSON, notification setting, app ID or release configuration was changed, and no workaround native export was run. Both web builds and all reached frontend stages completed successfully.

Tenant-isolation evidence is explicit: real membership/JWT HTTP tests permit Owner/Manager on A but reject a write to B even with forged role/restaurant claims and `X-Restaurant-Id`; Staff/Driver and anonymous writes are denied. Public A/B reads use their separate palettes and expose exactly five approved fields. SQL checks enforce one row/FK per tenant, no anon/authenticated/service-role direct grants, invalid/null colors rejected, and A writes/rollback leave B intact. Client fixtures reject foreign UUIDs, independently read separate environment origins without a shared cache, null invalid palettes/unsafe logos and preserve safe caller state on offline/403/409 failures. These are automated contract checks, not installed-device or hosted acceptance.

Evidence logs are local ignored files: `target/uxi-02-maven-focused.log`, `target/uxi-02-maven-verification.log`, `target/uxi-02-frontend-verification.log`, `target/uxi-02-api-client-final.log`, `target/uxi-02-mobile-validation.log`. No local credential values are included in this report.

## Exact changed files

29 application/test/migration/documentation files; the pre-existing Postman files are excluded and untouched.

| File | Change |
| --- | --- |
| `app/api/src/main/java/com/restaurant/platform/common/error/GlobalExceptionHandler.java` | Branding errors explicitly no-store |
| `app/api/src/main/java/com/restaurant/platform/config/SecurityConfig.java` | Permit only the new public branding GET |
| `app/api/src/main/java/com/restaurant/platform/controller/RestaurantBrandingController.java` | Three scoped branding routes |
| `app/api/src/main/java/com/restaurant/platform/dto/restaurant/RestaurantBrandingResponse.java` | Minimal public DTO |
| `app/api/src/main/java/com/restaurant/platform/dto/restaurant/RestaurantPalette.java` | Three validated colors; reject unsupported fields |
| `app/api/src/main/java/com/restaurant/platform/dto/restaurant/UpdateRestaurantBrandingRequest.java` | Expected revision and complete palette only |
| `app/api/src/main/java/com/restaurant/platform/dto/restaurant/UpdateRestaurantRequest.java` | Logo compatibility contract documentation |
| `app/api/src/main/java/com/restaurant/platform/entity/RestaurantRuntimeBranding.java` | Canonical runtime palette row |
| `app/api/src/main/java/com/restaurant/platform/repository/RestaurantRepository.java` | Active parent transaction lock |
| `app/api/src/main/java/com/restaurant/platform/repository/RestaurantRuntimeBrandingRepository.java` | Palette persistence |
| `app/api/src/main/java/com/restaurant/platform/service/RestaurantBrandingService.java` | Authorization, public projection, validation, conflict, initialization and atomic save |
| `app/api/src/main/java/com/restaurant/platform/service/RestaurantManagementService.java` | Close profile logo mutation seam |
| `app/api/src/main/resources/messages.properties` | Myanmar branding/logo error messages |
| `app/api/src/main/resources/messages_en.properties` | English branding/logo error messages |
| `app/api/src/test/java/com/restaurant/platform/controller/RestaurantBrandingHttpTest.java` | HTTP roles, tenant/DTO/cache/validation/conflict/initialization/fallback/logo filtering |
| `app/api/src/test/java/com/restaurant/platform/controller/RestaurantProfileLogoHttpTest.java` | Logo privilege and profile compatibility regression |
| `app/api/src/test/java/com/restaurant/platform/integration/PostgresMigrationSchemaTest.java` | Hook new SQL and real concurrency checks into ordered PostgreSQL migrations |
| `app/api/src/test/java/com/restaurant/platform/integration/RuntimeBrandingDatabaseChecks.java` | SQL constraints/grants/tenant preservation, actual JPA races and rollback |
| `app/api/src/test/java/com/restaurant/platform/integration/RuntimeBrandingLocalPostgresTest.java` | Explicit loopback-only PostgreSQL QA entry point |
| `supabase/migrations/20261119090000_add_restaurant_runtime_branding.sql` | Additive server-only palette table |
| `packages/shared-types/src/branding-api.ts` | Public and write contract types |
| `packages/shared-types/src/index.ts` | Export branding types |
| `packages/api-client/src/branding.ts` | Safe public parser and write projection |
| `packages/api-client/src/branding.test.ts` | 51 branding/refresh/isolation/security contracts |
| `packages/api-client/src/clients.ts` | Extend existing public/member/admin clients |
| `packages/api-client/README.md` | API and scoped refresh/fallback usage |
| `docs/api.md` | Actual branding routes/DTOs/errors/cache/profile compatibility |
| `docs/role-permission-matrix.md` | Existing permission reused for palette management |
| `docs/uxi-02-runtime-branding.md` | This completion, rollout/recovery and evidence record |

## Next milestones and preserved scope

UXI-03 can consume these DTOs/clients and implement Owner/Manager preview/review/save, conflict/error/offline states, foreground refresh and Owner-only logo presentation. It must retain fixed embedded UUID and environment guards and use the existing shared token resolver. UXI-04 can call initialize-once after secure provisioning and add its separate onboarding/catalog/media workflow. No later milestone was started here.

Order/payment/finance/pricing/geography/variant/modifier contracts, native identities/assets, existing deployment configuration and real hosted data were not edited. No commit, push, merge, deploy, signed build or native application rebuild was performed. Work stops at UXI-02 for review.
