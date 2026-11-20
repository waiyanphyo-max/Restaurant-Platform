# UXI-04 — Secure operator bootstrap

Implementation: 19 November 2026. Resumed final verification: 20 November 2026 (Asia/Bangkok). Scope: UXI-04 only.

## Baseline and capability audit

Starting branch: `uxi/04-operator-bootstrap`. Starting HEAD: `ddd31153d2f9a4ebd9830b1e47682a04beb71ae0` (UXI-03, PR #43). Staged and unstaged tracked changes were empty; only the existing `.postman/` and `postman/` files were untracked. They were preserved without reading private environment contents. No applicable repository/ancestor `AGENTS.md` was found.

The resumed run recovered that same branch/HEAD and all existing UXI-04 changes; it did not restart implementation. The staged diff remained empty. Final source scope is the 46 files listed below, with the existing Postman files preserved.

The implementation team read all seven requested baseline, product-policy, Figma-amendment, roadmap and UXI-01/02/03 documents completely. The accepted implementations are present: shared semantic tokens and tenant-checked providers, canonical runtime-brand persistence/API/client, Owner-only logo protection and the Operations Owner/Manager palette editor/runtime provider. Their source presence does not establish hosted migration or runtime parity.

| Decision | Existing capability / change |
| --- | --- |
| KEEP | Trusted provisioning, exact Auth UUID/email verification, returned Owner membership, invitation delivery/recovery and server-recorded account completion. No replacement Auth system or email-based ownership assignment. |
| KEEP | UXI-02 branding initialization with the actual returned restaurant UUID and revision zero; no second runtime palette. |
| KEEP | Existing category/product/variant/modifier persistence and validation, stock contracts, public menus, Owner/Manager APIs and Spring media safeguards. |
| ADAPT | Extract package-private validated catalog/settings operations behind unchanged member authorization. An explicitly allowlisted bootstrap service calls these bodies within its own authorized transaction. |
| ADAPT | Admin Stage A removes deployment colors labelled as runtime branding; existing deployment settings are labelled accordingly. Uncertain creation requires exact-slug reconciliation before another explicit action. |
| ADD | Private tenant-scoped setup snapshot, durable reviewed step receipts, initial catalog/settings workflow, pending media mapping review and explicit Operations handoff. |

## Operator workflow

1. **Restaurant and Owner:** use the existing provisioning page, validate identity/location/contact/timezone/currency and review before creation. Existing accounts require their exact verified Auth UUID. A returned `INVITED` state is never called complete account setup. A timeout does not trigger another creation or invitation. A slug-only unresolved-attempt marker is written before dispatch in session storage scoped to API origin and verified Admin UUID; reload cannot silently invite again in that tab. Unavailable/corrupt recovery storage blocks dispatch. Check the exact slug in the trusted registry, resume the returned existing restaurant, or verify the Auth UUID before another reviewed creation attempt when no restaurant exists. No Owner email, token or draft is stored in that marker.
2. **Runtime palette:** open initial setup from the successful result or restaurant details. Review the three approved colors, then call the existing `POST /platform/restaurants/{id}/branding` with `expectedRevision: 0`. No tenant's colors are preseeded into another restaurant. A nonzero palette is read-only here; Owner/Manager retain their existing editor. On uncertain/stale initialization, reload the canonical snapshot before continuing.
3. **Catalog and ordering:** create one reviewed category, product, variant, modifier group, option or association at a time, selecting actual returned UUIDs. Enter exact whole-currency prices and stock values. Review only supported ordering fields: accepts orders, QR/delivery/takeaway flags, minimum order and default delivery fee. Provisioned currency/timezone remain fixed during bootstrap. Review the complete catalog after required/optional modifier rules and availability have been checked.
4. **Media mapping:** record original filename, restaurant UUID, product/variant UUID when known, intended association, mapping review status and SHA-256 when available. Unknown originals or UUIDs stay `PENDING`. Approval means the mapping was reviewed, not that bytes were uploaded or verified. All upload/result statuses remain `PENDING`; no Storage operation is offered.
5. **Operations handoff:** refresh current Owner invitation and server-recorded setup status, palette/catalog/ordering review and blockers, then explicitly confirm handoff. Handoff permanently closes new bootstrap mutations. Owner/Manager continue editing their own catalog/palette through existing Operations APIs. Photos and native build/release readiness remain separate pending publication tasks.

Original approved logo references can use the existing trusted provisioning contract. This milestone adds no logo upload path and changes no Owner-only upload grant. No Featured selection or sales-derived popularity is introduced.

## API, persistence and security

Existing APIs are reused for provisioning, invitation status/resend and canonical branding. New endpoints are only:

| Method/path | Contract |
| --- | --- |
| `GET /api/v1/platform/restaurants/{restaurantId}/bootstrap` | Private current catalog/settings, branding, actual Owner states, receipt history, manifest and handoff blockers |
| `POST /api/v1/platform/restaurants/{restaurantId}/bootstrap/steps` | One reviewed operation with stable `operationKey` and selected payload |

Kinds: `CATEGORY`, `PRODUCT`, `VARIANT`, `MODIFIER_GROUP`, `MODIFIER_OPTION`, `ATTACH_MODIFIER_GROUP`, `ORDERING_SETTINGS`, `MEDIA_MANIFEST`, `COMPLETE_CATALOG`, `HANDOFF`. See [API reference](api.md#initial-operator-bootstrap-uxi-04) and shared `bootstrap-api.ts` for exact fields.

Both routes require the real server Platform Admin UUID allowlist; actor identity comes from the verified JWT subject. Missing/malformed configuration fails closed. No fabricated restaurant membership, client role or supplied Auth UUID authorizes a write. The backend checks every reference against the selected restaurant. New operations are denied after handoff or once orders exist; exact prior receipt replay remains safe.

The strict bootstrap JSON decoder rejects unknown/irrelevant fields and fractional or coerced numeric values before Java Long conversion. Amounts are nonnegative whole integers bounded by `9007199254740991`, with the exact restaurant currency. Existing category/product/variant/modifier and settings validation remains authoritative. Initial image URLs are rejected rather than bypassing upload safeguards. The manifest cannot claim an uploaded/verified result. Public menu/branding DTOs gain no private setup, Owner, actor, financial, QR or invitation data.

New forward-only source migration: `supabase/migrations/20261119100000_add_restaurant_bootstrap_steps.sql`. It creates only a server-owned receipt ledger with tenant FK, unique tenant/key and per-tenant step ordinal, request hash, returned resource ID, result, actor and completion time. RLS is enabled, with no client policy and no PUBLIC/anon/authenticated/service-role table grants. It seeds no restaurant/catalog/theme. The existing canonical palette table is unchanged.

## Retry and partial failure behavior

The same restaurant-row lock serializes initial bootstrap and palette transactions. Domain writes and their receipt commit together; a failed database transaction creates neither a success receipt nor a partial catalog row. Replaying the exact key/payload returns the original generated ID. Changing payload under the same key conflicts; duplicate named records under another key also conflict. A persisted step ordinal orders reviews independently of timestamps or application-host clock skew. A later catalog addition invalidates the completed-catalog checkpoint; fingerprints also detect catalog/settings edits through existing Owner/Manager APIs before handoff.

After a lost response, reload the snapshot and check receipts before explicitly replaying the unchanged operation. There is no automatic POST retry. If a step already succeeded, resume from its trusted returned IDs. Refresh/read failures do not become successful saves. A new restaurant is never automatically recreated after an ambiguous response.

Manifest replacement additionally carries `expectedMediaOperationKey`, the last manifest receipt key (null initially). Comparison occurs under the existing tenant lock, so stale concurrent tabs cannot erase another operator's approved entries. `409 BOOTSTRAP_MEDIA_MANIFEST_STALE` requires refresh, cancellation of the stale review and a newly built/reviewed proposal. The UI preserves the old payload/checkpoint and disables confirming it once stale; it never rebases approval automatically. Exact prior-key replay is resolved before checking the current manifest, preserving both recovery and later updates. The nullable checkpoint is omitted from request hashing when null, retaining legacy receipt compatibility; no second migration is needed.

An uncertain provisioning attempt retains its original marker even after confirmed slug absence. Only that original slug plus a reviewed Auth UUID can use the recovery path; Spring must verify the UUID and confirmed email. Removing that UUID or changing the slug cannot restore invite-by-email retry. Successful creation or recovery of an existing trusted restaurant clears the marker so a later visit can provision another restaurant. Fresh definite 400/422 validation rejections and the two known pre-dispatch 503 configuration codes (`PLATFORM_PUBLIC_ORIGIN_NOT_CONFIGURED`, `PLATFORM_OWNER_INVITATION_NOT_CONFIGURED`) permit repair without a phantom pending invitation. Unknown/provider 5xx and timeouts remain uncertain. A definite local error during an already uncertain recovery does not erase the original uncertainty.

Provisioning still crosses external Auth and PostgreSQL boundaries. Auth invitations cannot be rolled back with a database transaction; the UI explicitly preserves this uncertainty and requires reconciliation. Existing provider failures do not report successful provisioning. Bootstrap catalog/settings/media-review steps themselves make no Auth invitation or Storage write. The snapshot uses the existing lifecycle Auth lookup for truthful invitation state; unavailable provider/account setup remains pending/blocked.

Provisioning retains the existing server slug uniqueness and provider/verified-identity recovery; it is not a new global cross-browser invitation reservation system. Operators must reconcile unresolved provisioning before moving to another tab/device. The marker protects the current tab across reloads, not arbitrary browsers or deliberate storage deletion. Catalog preparation uses existing live catalog records, not a new unpublished draft authority. Use reviewed unavailable products/order-acceptance settings while preparing when appropriate; there is no claim that restaurant creation publishes Android apps.

## Design and acceptance boundaries

The supplied Operations references remain compatibility constraints: O05 `15:137`, O14 `39:554`, O15 `39:605`, O18 `39:742`, O57 `72:2944`, O58 `72:2964`, O69 `101:3127`. The user supplied the current Figma findings and explicitly excluded Figma edits. No design tool mutation or production asset extraction was performed.

There is no complete approved Platform Admin onboarding specimen. Proposed patterns for separate visual review are the compact staged setup panel, UUID-backed catalog selectors, step review/receipt history, pending manifest table and handoff checklist. They compose existing Admin panels, fields, tables, notices and explicit review controls. No full Admin redesign or pixel-perfect Figma acceptance is claimed. Browser/device accessibility and visual acceptance must be reported separately from automated renders.

## Verification

The implementation checks on 19 November and resumed final checks on 20 November are distinguished below. No prior milestone totals are reused.

| Executed check | Actual result |
| --- | --- |
| `npm run build:packages` | **PASS**, shared types, tokens and API-client compile |
| API-client typecheck/lint | **PASS** |
| Final focused bootstrap API-client suite, 20 November | **PASS**, 52 tests, including manifest checkpoint projection and no automatic rebase/retry |
| Final API-client full suite, within resumed frontend verification | **PASS**, 214 tests in 15 files; no failures/skips |
| Final Admin Web tests, typecheck and lint | **PASS**, 214 tests in 22 files; includes marker cleanup, definite-error repair, original-marker retention, exact replay and stale-manifest rebuild |
| Resumed targeted Admin routes/recovery/server-actions/builder suite before the final concurrency fixes | **PASS**, 62 tests in 7 files; all updated cases reran in the final complete Admin suite |
| Focused Maven bootstrap HTTP/service, existing catalog/settings and PostgreSQL checks, 19 November | **PASS**, 43 tests, zero failures/errors/skips; superseded for new fixes by the final full run |
| Full offline Maven `clean verify`, 19 November | **PASS**, 623 discovered, 605 passed, 18 skipped, zero failures/errors; API JAR built |
| Initial resumed sandboxed Maven `clean verify`, 20 November | **FAIL**, 616 discovered, 0 assertion failures, 48 errors, 18 skipped; local JDBC `Permission denied: getsockopt`. Retried with approved loopback access; no test was weakened. |
| Final resumed Maven `clean verify`, 20 November, approved loopback fixture access | **PASS**, 627 discovered, 608 passed, 19 Docker-only skipped, zero failures/errors; API JAR built/repackaged |
| Final full frontend test stage | **PASS**, 1,495 Vitest tests in 132 files plus 32 Node tests, zero failures/skips; all workspace typechecks/lint also passed |
| Final Admin Web production build | **PASS**, including the protected dynamic `/restaurant-setup` route |
| Final Guest Web production build | **PASS**, all existing public/tenant routes built |
| Final `npm run verify:frontend` aggregate | **FAIL**, exit 1 only at the existing Operations Firebase starter mismatch, after all typecheck/lint/test and both web build stages passed |
| Customer starter export in that aggregate | **SKIPPED / NOT REACHED**, because the preceding Operations export failed |
| `npm run --silent mobile:build -- validate`, rerun 20 November | **PASS**, 18 existing build configuration combinations; no native build/release |
| Final `git diff --check`, exact changed-file inventory and branch/HEAD/staged review | **PASS**, 46 scoped files match this report; same branch/HEAD, staged diff empty, Postman paths preserved |

The exact PostgreSQL 17 Testcontainers migration suite requires Docker, which is unavailable. The final suite has 19 skipped cases after adding the manifest-concurrency hook; the 19 November suite had 18. The separate local PostgreSQL 16.4 suites ran, including all 4 bootstrap checks, 2 runtime-branding checks and all 8 Owner-onboarding checks. The new migration ran unchanged in a fresh loopback-only fixture and the stopped fixture was safely restored for resumed verification. Only temporary fixture copies of historical `20261016051330_remote_schema.sql` and `20261016052430_revoke_unneeded_table_privileges.sql` omitted PostgreSQL-17-only `MAINTAIN` clauses; source migrations were untouched. This verifies the new schema, grants, actual JPA/service transactions and concurrency, while exact unmodified PostgreSQL 17 migration-chain verification remains a rollout gate.

Maven used the installed JDK 21/Maven 3.9.9 and an explicit existing Byte Buddy test JVM agent to avoid the environment's restricted Mockito self-attachment. No repository dependency or test assertion was weakened. Initial focused fixture failures (schema created before the final step ordinal, fixture JWT authentication flag, test bean naming and a nonexistent-route assertion) were corrected; the final focused and full Maven verification passed. The nonexistent-route assertion was replaced by stronger real product/variant upload authorization checks with no Storage interaction.

The resumed review corrected confirmed defects only: concurrent manifest replacement could discard another operator's mapping; known pre-request configuration failures could leave a phantom pending invitation; and clearing an uncertain marker before successful verified-UUID recovery could re-enable an email retry after editing. Added tests cover each path. The full frontend run before these fixes passed its reached stages and ended at the existing Firebase mismatch; the final run above reruns the changed source. The earlier 19 November frontend attempt's stale `Initial branding` route assertion was updated to test the actual approved-logo/runtime-palette separation, then rerun successfully.

Evidence files are ignored local logs under `target/`: `uxi-04-maven-resume-final.log`, `uxi-04-maven-resume-verification.log`, `uxi-04-resume-final-frontend.log`, `uxi-04-resume-frontend.log`, `uxi-04-resume-admin-focused.log`, `uxi-04-resume-client-focused.log`, `uxi-04-resume-packages.log`, and `uxi-04-resume-mobile-validation.log`. The disposable PostgreSQL fixture was stopped cleanly after final Maven verification; data/logs were retained without deletion. Hosted Auth/Storage acceptance, hosted schema application, real invitations/media, browser visual/device accessibility acceptance and signed Android builds were **NOT RUN**. Hosted readiness remains **BLOCKED/PENDING** those separately authorized rollout inputs; source test success is not a deployment certification.

### Pre-existing Firebase starter mismatch

The ordinary Operations starter export still fails before bundling: `OPERATIONS_GOOGLE_SERVICES_FILE` does not provide the Android client for `dev.restaurantplatform.starter.operations.staging.dev` in `MOBILE_FIREBASE_PROJECT_ID`. This is the same private-environment mismatch recorded in UXI-01/02/03; the final resumed run reproduced it. No private Firebase JSON, `.env`, notification setting or application identity was changed to force a pass. The aggregate remains red, and Customer starter export was not reached. There was no notification-disabled workaround export in this milestone, signed APK/AAB or application publication.

## Synthetic Restaurant A/B evidence

`PlatformBootstrapDatabaseChecks` uses actual local PostgreSQL persistence, real catalog/branding/authorization/lifecycle services and Owner-onboarding records. Only external Auth identity reads are mocked; no invitation or Storage write occurs. Product and variant UUIDs are generated and returned by persistence, not borrowed production IDs.

| Fixture | Actual checks |
| --- | --- |
| A: synthetic San Thaw Tar example | Tenant-only primary `#A51D22`, MMK, separate Owner/Manager, six named synthetic dishes: Mala Xiang Guo, Ah-Sein-Kyaw, Fried Noodle, Fried Rice, Kan-Sone-Plain, Kyay-Oh-Se-Chat. Prices/descriptions are explicitly test-only. Variant plus required spice group/minimum/option and attachment survive public-menu reads. |
| B: synthetic Blue Lotus Kitchen | Different Owner/Manager, blue `#123B70`, THB, independent pumpkin bowl/catalog. No A products, prices, media or identity copied into B. |
| Isolation and handoff | Accepted Auth contact alone blocks handoff; a real local server-recorded account completion changes readiness. Actual Owner catalog/settings edits invalidate review fingerprints without affecting B. Re-review permits explicit handoff; later Admin catalog writes are denied. Existing Owner/Manager APIs still edit own product/variant/palette; B's Owner cannot edit A. Public menu and canonical brand reads return each restaurant's own values. |
| Retry/database behavior | Concurrent identical keys return one persisted category UUID/receipt; changed intent conflicts. Forced transaction rollback removes both category and receipt; a subsequent exact retry succeeds. Direct client/service-role table access is denied. No synthetic product has a published image URL. |
| Concurrent media review | Two different operations based on the same empty manifest produce one commit and one stale conflict. Correct-head replacement preserves all reviewed mappings. Replaying the original historical operation after a later update returns its receipt without reverting the manifest; B stays unchanged. Legacy category and initial-manifest receipt hashes remain replayable. |

## Candidate originals and pending publication mapping

Read-only discovery found local candidate assets under `C:\RestaurantManagementSystem\San Thaw Tar Photos`; they were not copied into the repository or uploaded. Their filenames, dimensions and SHA-256 values were inspected. **Provenance, owner approval, quality/crop suitability, authoritative original status and actual production restaurant/product/variant UUID mappings remain PENDING.** These files are larger than the Figma previews, but dimensions alone do not establish production suitability.

| Candidate filename | Dimensions | Observed SHA-256 |
| --- | --- | --- |
| `Ah-Sein-Kyaw.jpg` | 736×920 | `7a98eb6878f199d253197fb4106e343123309c494027dfab76d6ad59f030b01b` |
| `Fried-Noodle.jpg` | 736×736 | `6f250770ed028360e7adf608702b45f8200e1154b5f13aed9cd12b9375846f11` |
| `Fried-Rice.jpg` | 736×1104 | `999133ea6750e318a02ccb551fceac8a8acc980f4304e2a3ae424cd2378472b7` |
| `Kan-Sone-Plain.jpg` | 676×1200 | `87d9ecf522ccb64e05f1f764f1b804ade188eea684533ea9e608d9040db26203` |
| `Kyay-Oh-Se-Chat.jpg` | 736×861 | `e068f030300e97846aaf2e28bfe7d89dd65c481585e798a43a486e022d70b293` |
| `Malar-Xiang-Guo.jpg` | 736×981 | `0e10f91ce19af367a2999decfae332bacefc2ee6f4652bd11de4afc2cf3deadd` |
| `logo/Burmese Red and Gold Food Emblem.png` | 1254×1254 | `780758f968cde0a6d83ca8dc100f804efd1eb9b94f46f4a3eb27d2b413b90fd1` |

The initial media manifest requires the reviewed filename, actual restaurant UUID, product/variant UUID when verified, intended association, review status, optional original hash and pending upload result. Mapping review cannot certify published bytes. No production IDs or URLs were fabricated from names, array positions or Figma previews. UXI-05 still requires explicit media/publication approval and Owner-curated Featured policy/selection; it was not started.

## Exact changed files

46 source, test, migration and documentation files. Existing untracked Postman files are excluded and untouched.

```text
app/api/src/main/java/com/restaurant/platform/controller/PlatformRestaurantBootstrapController.java
app/api/src/main/java/com/restaurant/platform/dto/platform/BootstrapStepRequest.java
app/api/src/main/java/com/restaurant/platform/dto/platform/BootstrapStepResponse.java
app/api/src/main/java/com/restaurant/platform/dto/platform/RestaurantBootstrapResponse.java
app/api/src/main/java/com/restaurant/platform/entity/RestaurantBootstrapStep.java
app/api/src/main/java/com/restaurant/platform/repository/RestaurantBootstrapStepRepository.java
app/api/src/main/java/com/restaurant/platform/service/CatalogManagementService.java
app/api/src/main/java/com/restaurant/platform/service/PlatformRestaurantBootstrapService.java
app/api/src/main/java/com/restaurant/platform/service/RestaurantBrandingService.java
app/api/src/main/java/com/restaurant/platform/service/RestaurantSettingsService.java
app/api/src/main/resources/messages.properties
app/api/src/main/resources/messages_en.properties
app/api/src/test/java/com/restaurant/platform/controller/PlatformRestaurantBootstrapHttpTest.java
app/api/src/test/java/com/restaurant/platform/integration/PlatformBootstrapDatabaseChecks.java
app/api/src/test/java/com/restaurant/platform/integration/PlatformBootstrapLocalPostgresTest.java
app/api/src/test/java/com/restaurant/platform/integration/PostgresMigrationSchemaTest.java
app/api/src/test/java/com/restaurant/platform/service/PlatformRestaurantBootstrapServiceTest.java
apps/admin-web/src/app/(admin)/actions.ts
apps/admin-web/src/app/(admin)/provisioning/page.tsx
apps/admin-web/src/app/(admin)/restaurant-details/page.tsx
apps/admin-web/src/app/(admin)/restaurant-setup/page.tsx
apps/admin-web/src/app/bootstrap-actions.test.ts
apps/admin-web/src/app/globals.css
apps/admin-web/src/app/routes.test.tsx
apps/admin-web/src/components/ProvisioningForm.interaction.test.tsx
apps/admin-web/src/components/ProvisioningForm.test.ts
apps/admin-web/src/components/ProvisioningForm.tsx
apps/admin-web/src/components/RestaurantBootstrap.test.tsx
apps/admin-web/src/components/RestaurantBootstrap.tsx
apps/admin-web/src/components/RestaurantConfiguration.tsx
apps/admin-web/src/lib/auth/route-policy.test.ts
apps/admin-web/src/lib/auth/route-policy.ts
apps/admin-web/src/lib/bootstrap.test.ts
apps/admin-web/src/lib/bootstrap.ts
apps/admin-web/src/lib/provisioning-attempt.test.ts
apps/admin-web/src/lib/provisioning-attempt.ts
docs/api.md
docs/role-permission-matrix.md
docs/uxi-04-operator-bootstrap.md
packages/api-client/README.md
packages/api-client/src/bootstrap.test.ts
packages/api-client/src/bootstrap.ts
packages/api-client/src/clients.ts
packages/shared-types/src/bootstrap-api.ts
packages/shared-types/src/index.ts
supabase/migrations/20261119100000_add_restaurant_bootstrap_steps.sql
```

## Rollout, recovery and remaining gates

Review the new SQL and implementation before any release. Apply the approved additive migration using the trusted server database principal before deploying the new API, then release Admin Web. No hosted migration, deploy or production initialization is authorized here. Existing restaurant data and native application identities are unchanged.

Before an authorized hosted rollout, verify the actual migration ledger, backups/recovery, RLS/default grants and the Spring database principal's access to the two server-owned runtime-branding/bootstrap tables. Local superuser fixture success does not certify a hosted principal or hosted schema/API parity.

If the application is rolled back, retain the ledger and generated catalog records. Do not drop receipts or reset operation keys: that destroys retry protection. Use an approved forward repair for schema/data problems. Resume using the existing restaurant UUID and recorded resources; never automatically provision a replacement or replay an external invitation. No generalized import/orchestration engine is introduced.

Production originals/provenance, verified actual production UUID mapping, hosted migration/geography parity, visual/accessibility acceptance and separately managed native builds/releases remain review gates. Guest and Customer runtime-brand UI consumption belongs to later milestones; their existing public menu API and the canonical branding API already support isolated future consumers. Runtime catalog/price/palette changes require refresh, not a native rebuild. No signed/installed app or app-store publication is asserted.

UXI-05 prerequisites are a separately requested milestone, review of its minimal Owner-only editorial contract, approved originals and exact production media mappings. Actual hosted migration application, real invitation/media publication, deployment and native release each require separate explicit user authorization. None is requested as a follow-on action here.

No UXI-05 work, Figma edit, hosted write, real Owner invitation, Storage upload, real order/payment/finance action, native package/icon/splash/signing change, branch change, staging, commit, push, merge or deployment was performed.

Final branch/HEAD: `uxi/04-operator-bootstrap` / `ddd31153d2f9a4ebd9830b1e47682a04beb71ae0`. UXI-04 source implementation and verification are complete for review, with the explicitly reported Docker/Firebase and hosted/visual acceptance gates. Work stops here.
