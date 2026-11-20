# UXI-06 — Per-restaurant Android identity and safe runtime branding

Date: 20 November 2026 (Asia/Bangkok). Source-only UXI-06 implementation; no production operations authorized or performed. Stop before UXI-07/08.

## Baseline and KEEP / ADAPT / ADD

Branch and starting/final HEAD: `uxi/06-branded-builds`, `daa55cff10b6f8fa748580d5e32bfa526aaea7ef` (accepted UXI-05). Starting staged and unstaged tracked diffs were empty. Existing seven untracked Postman files under `.postman/` and `postman/` were preserved without opening private contents. No applicable `AGENTS.md` was found in the repository or inspected ancestors. No branch switch, reset, stash, stage, commit, push, merge or deploy occurred.

The implementation team read all ten requested baseline/decisions/D0/roadmap/UXI-02/03/04/05/M13/registry documents completely, inspected current source/configuration/tests and accepted UXI-05 contracts and migration, and inspected all six requested current Figma nodes before implementation. Historical roadmap statements do not supersede the accepted source. The short assessment was delivered before code changes:

| Assessment | Result |
| --- | --- |
| KEEP | One schema-v2 registry, shared app source trees, existing six package IDs per restaurant, tenant/API/profile selection, guest routing, Expo generation, EAS projects/profiles, native links, artifact verifier, fingerprint and provider validation. Keep UXI-01 tokens, UXI-02 canonical public branding API, UXI-03 Operations provider/editor, UXI-04 bootstrap, UXI-05 Featured/media/migration and all variant/modifier/order contracts. |
| ADAPT | Close HTTPS private-host release-origin and enabled-but-invalid Firebase fallback gaps; bind local native configuration implementations and EAS files in fingerprints; cross-check embedded release identity at installed startup. |
| ADD | Deterministic stdout-only onboarding proposal with independent external identity-history review; minimal read-only Customer runtime-brand consumer; synthetic onboarding, release-input and runtime isolation checks; this handoff. |

No backend, shared API schema, migration, existing restaurant JSON, native artwork, signing/EAS profile, private environment or Firebase client file was changed.

## Reused infrastructure and operator workflow

The implementation extends `configs/restaurants/index.cjs` with its existing ESM/TypeScript surfaces, `expo.cjs`, `mobile-runtime.ts`, `firebase-android.cjs`, and the existing `scripts/mobile-build.cjs` CLI. No competing registry, tenant source clone, or second Operations theme integration was introduced. The existing fixture A/B assets, public branding parser/client/transport, semantic token resolver, App Link router, artifact verification and starter JavaScript export wrapper remain in use.

Repeatable procedure: **trusted provisioning → complete schema-v2 candidate outside the active registry → reviewed proposal/history → uniqueness + approved assets/deployed UUID/domains/version/signing/provider review → explicit operator approval to save → separate Operations and Customer release plans.** Exact safe commands and the separately authorized future release procedure are in [M13](m13-android-branding.md) and the [registry README](../configs/restaurants/README.md).

New command:

```powershell
npm run --silent mobile:build -- propose 'target/mobile-onboarding/approved-restaurant.candidate.json'
npm run --silent mobile:build -- propose 'target/mobile-onboarding/approved-restaurant.candidate.json' --identity-history 'target/mobile-onboarding/approved-restaurant.identity-history.json'
```

These paths are operator-supplied existing input files, not files created by this task. The command validates the existing schema and current registry/fixture conflicts, derives all six app/profile identities and links, records actual Git HEAD and a normalized configuration digest, and emits only JSON to stdout. It does not create/overwrite an active registry entry, copy assets, modify app source or run a release. Repeated equal inputs at the same revision produce equal proposals. Missing/incomplete configuration fails; missing history remains `PENDING_EXTERNAL_IDENTITY_REVIEW`. Every output remains `REVIEW_REQUIRED_NOT_A_RELEASE_PLAN`, even with recorded evidence.

History uses `schemaVersion:1`, `reviewedBy`, real calendar `reviewedAt`, `evidence`, and `applications` containing `{applicationId,restaurantId,appKind,environment,status}` (`reserved` or `distributed`). All six proposed identities must match independently reviewed history; foreign reuse, omitted bindings, duplicate IDs and changed historical bindings fail. Existing registry UUIDs and application IDs cannot be changed by this helper. Review evidence is an attestation, not automatic proof of historical completeness. The helper does not decide that a currently unique ID has never shipped elsewhere.

## Synthetic two-restaurant / two-app / three-environment matrix

Fixture A UUID: `00000000-0000-4000-8000-000000000101`; fixture B UUID: `00000000-0000-4000-8000-000000000102`. Both are fictional, have no real Owner credentials and never enter Guest host routing. A palette is `#8A3C25 / #EDAE49 / #FFF6E7`; B is `#195954 / #60C8B7 / #EDF8F7`. Their distinct embedded logos and app-specific icons/splashes come from `assets/restaurant-a/` and `assets/restaurant-b/`. All native versions are `0.1.0`, code `1`.

| Tenant | App | Environment | Android application ID | Spring API origin | Result |
| --- | --- | --- | --- | --- | --- |
| A | Operations | development | `dev.restaurantplatform.fixturea.operations.dev` | `http://10.0.2.2:8080` | PASS |
| A | Customer | development | `dev.restaurantplatform.fixturea.customer.dev` | `http://10.0.2.2:8080` | PASS |
| A | Operations | staging | `dev.restaurantplatform.fixturea.operations.staging` | `https://api.restaurant-a.staging.test` | PASS |
| A | Customer | staging | `dev.restaurantplatform.fixturea.customer.staging` | `https://api.restaurant-a.staging.test` | PASS |
| A | Operations | production | `dev.restaurantplatform.fixturea.operations` | `https://api.restaurant-a.test` | PASS, offline inspection only |
| A | Customer | production | `dev.restaurantplatform.fixturea.customer` | `https://api.restaurant-a.test` | PASS, offline inspection only |
| B | Operations | development | `dev.restaurantplatform.fixtureb.operations.dev` | `http://10.0.2.2:8080` | PASS |
| B | Customer | development | `dev.restaurantplatform.fixtureb.customer.dev` | `http://10.0.2.2:8080` | PASS |
| B | Operations | staging | `dev.restaurantplatform.fixtureb.operations.staging` | `https://api.restaurant-b.staging.test` | PASS |
| B | Customer | staging | `dev.restaurantplatform.fixtureb.customer.staging` | `https://api.restaurant-b.staging.test` | PASS |
| B | Operations | production | `dev.restaurantplatform.fixtureb.operations` | `https://api.restaurant-b.test` | PASS, offline inspection only |
| B | Customer | production | `dev.restaurantplatform.fixtureb.customer` | `https://api.restaurant-b.test` | PASS, offline inspection only |

All twelve `mobile:build -- resolve ... --fixture` CLI calls passed, with `MOBILE_SOURCE_REVISION` set to the actual HEAD. Plans are ignored local evidence under `target/uxi-06-fixtures/`. The same Operations and Customer source trees serve every selection; no per-tenant source copies or edits occur during selection. Native base labels are Demo A Counter/Kitchen and Demo B Crew/Table, with environment suffixes outside production. Guest origins are tenant-specific `http://restaurant-{a|b}.localhost:3000` for development, `https://restaurant-{a|b}.staging.test` for staging and `https://restaurant-{a|b}.test` for production.

Schemes are `rp-restaurant-{a|b}-{operations|customer}` in production, with `-development` or `-staging` elsewhere: twelve distinct schemes. The eight HTTPS associations use each tenant/environment canonical guest host plus `/app/operations/` or `/app/customer/`; development has none. Fixture staging is also inspection-only. Reserved `.test` hosts establish syntax/isolation, not reachable deployments or verified Android associations.

## Immutable identity and environment protections

Existing registry validation rejects duplicate slugs, UUIDs, guest domains, all app/environment package IDs and supplied Expo project IDs. No application identity was regenerated or renamed. A changed Android package denotes a different installed application, requiring historical reservation/distribution and signing review.

Both app entrypoints retain `readEmbeddedTenant()` capture-once immutable configuration and actual installed-package validation. Startup now additionally compares the embedded release's restaurant UUID, slug, app kind, environment, API origin, guest origin, scheme and fingerprint shape with the parsed tenant configuration. A valid foreign UUID or origin inserted into one manifest component fails rather than silently selecting another tenant. This consistency guard is not a replacement for signing or native artifact verification.

Staging/production origins deny HTTP, IP/loopback/private addresses even over HTTPS, single-label hosts, localhost/local/internal suffixes, trailing-dot bypasses, credentials and URL paths/queries/fragments. Explicit development private-LAN HTTP remains possible only through the existing opt-in; it cannot enable production exceptions. Schema-v2 API environments come from the selected registry record, ignoring unrelated public environment-origin overrides.

Real EAS staging/production evaluation additionally rejects known reserved/example/invalid/test and temporary tunnel hosts. Local syntax-only inspection remains available for existing incomplete records and fixtures. Host syntax cannot verify DNS ownership, deployed tenant mapping or production approval. Existing EAS commit/project/profile/public Auth/expected fingerprint checks remain fail-closed. Fixtures cannot become EAS releases.

Deep-link queries/fragments cannot override UUID or API environment. Existing allowlisted destinations, app-kind paths, QR, checkout, email confirmation and order semantics are unchanged. Legacy parser support for old explicit schemes remains; newly generated schema-v2 schemes are environment-specific. Spring still independently authorizes verified JWTs, membership, roles and resource ownership.

## Runtime branding and native authority

Operations retains its accepted UXI-03 provider and settings editor unchanged. Owner/Manager colors and supported catalog edits, Owner-only logo upload and Owner-only Featured selection retain existing Spring authorization. None can edit native application IDs, labels, launcher icons, splash, signing or release metadata through Operations.

Customer now mounts a read-only `RuntimeBrandingProvider` below its existing auth provider. It uses only `getCustomerPublicApi()` bound to the embedded UUID and selected API environment, and canonical `GET /api/v1/public/restaurants/{restaurantId}/branding`. Existing public transport enforces origin/redirect safety, no bearer/cookies/storage cache and a bounded timeout. The controller validates UUID, display name, safe revision and complete palette; it rejects malformed persisted palettes and revision rollback. An uninitialized null palette at revision 0 uses the reviewed same-tenant fallback. Same-revision name/logo refresh is supported because palette revision does not version identity.

Scope includes exact UUID, API origin/environment and auth status/user. The provider filters old snapshots during render before effects run, then aborts/invalidates obsolete requests. Reads occur once after auth settles, once on active foreground resumption and on explicit refresh; concurrent refreshes coalesce. A 10-second timeout, cancellation/generation guards, background suspension, unmount disposal and StrictMode effect replay are tested. There is no polling, persistent branding cache or cross-scope last-known snapshot. Failed initial reads use embedded same-tenant branding and semantic fallback; failed refreshes retain only that scope's last valid snapshot.

Only existing Customer sign-in/header/Home identity and semantic shell colors consume the result; existing menu pull-to-refresh also refreshes branding. Screen structure, catalog, navigation, checkout and account behavior were preserved. UXI-07 Guest and UXI-08 Customer visual work was not started. Backend current menu/prices/media/Featured remain authoritative through their existing APIs; no catalog field was added here and no native rebuild is needed for supported runtime changes.

## San Thaw Tar discrepancies and reviewed alignment plan

The existing record remains unchanged: UUID `2c62c49f-2310-4999-961f-81f79b868b0c`, green primary `#234D3C`, secondary `#E8EEDB`, background `#FFFFFF`. Current Figma approves tenant-only primary `#A51D22` with gold/cream supporting colors. Red was not made a platform default and no real runtime palette was written.

Prepare a separate candidate retaining UUID and all six IDs, compare current deployed/runtime identity and externally reserved/distributed builds, review the full three-color fallback and splash background, and explicitly approve the resulting diff before saving it. Review production/staging domains, version codes, artwork, project/signing and provider inputs independently; no auto-alignment or production release is authorized.

Current native logo candidate `C:\RestaurantManagementSystem\San Thaw Tar Photos\logo\Burmese Red and Gold Food Emblem.png` is 1254×1254 `Format24bppRgb`, opaque, SHA-256 `780758f968cde0a6d83ca8dc100f804efd1eb9b94f46f4a3eb27d2b413b90fd1`. It remains an unresolved transparent-logo approval gate. No background removal, generated replacement or preview-as-release-asset substitution occurred. Registry artwork was not claimed to be the approved original. All six food JPEGs were rechecked against their UXI-05 dimensions and SHA-256 records and matched; neither originals nor records were changed. Food photos remain catalog media, not launcher/splash assets.

`example.com`, `staging-api.example.invalid`, `api.example.invalid` and the configured `trycloudflare.com` guest tunnel are not approved real release endpoints. The UUID's actual deployed mapping, original logo/icon/splash provenance/transparency/crop/dimensions, historical/reserved IDs, monotonic distributed versions, EAS project and signing/recovery metadata remain independently reviewed gates. No San Thaw Tar app is certified release-ready.

## Providers, fingerprints and App Links

Enabled notifications now require a valid client JSON matching the selected package and explicit `MOBILE_FIREBASE_PROJECT_ID` in every environment. Missing/malformed/wrong-package/wrong-project/service-account files throw; they no longer silently disable requested notifications. Disabled notifications remain an explicit configuration choice, including the existing labelled development fixture. No provider JSON, signing certificate, private `.env`, real Firebase project or secret was changed or fabricated. Synthetic client JSON exists only in disposable tests and provides no real provider-readiness evidence.

The ordinary Operations starter export's known local Firebase client mismatch for `dev.restaurantplatform.starter.operations.staging.dev` remains a separate environment blocker. The isolated check disables dotenv and notifications only in a child development-fixture process, using the existing wrapper; it does not alter or establish release readiness. Customer Maps remains optional with manual addresses; a key's syntax/plugin inclusion does not prove package/signature restrictions, provider authorization or device functionality. Those need release-owner evidence. Service-role/database/signing secrets remain excluded from public metadata.

Fingerprints retain source revision/EAS commit binding, package/version, UUID/environment/project, public Auth/API/features, lockfile, branding/logo/icon/splash, Firebase client bytes, Maps/plugin options and routing. They now additionally hash normalized validated registry content, shared registry/Expo/runtime/Firebase/native-plugin code, the selected app config and EAS profile/toolchain file. CRLF normalization keeps equivalent Windows/EAS text inputs aligned. Changed inputs reject a previously expected fingerprint. Disposable copied fixtures test source/Auth/API/features/providers/assets/lockfile/plugin/app/EAS/registry changes without mutating reviewed files. Existing native artifact verifier checks still cover package/version/label/fingerprint/links/embedded identity/provider resources; no real artifact was produced or verified.

App Link syntax and tenant/app/environment isolation passed synthetic checks. Real HTTPS ownership, assetlinks JSON hosting, signing certificate association and installed-device `pm verify-app-links` were **NOT RUN** and remain deployment gates. No DNS or hosted Digital Asset Links file was changed.

## Acceptance coverage

| Requested acceptance | Evidence and result |
| --- | --- |
| 1. Different UUID bindings | PASS: existing generated A/B matrix and new installed release-binding checks. |
| 2. Unique application IDs | PASS: twelve distinct matrix IDs plus registry/proposal duplicate rejection. |
| 3. Shared sources | PASS: same app config factories/source trees selected throughout; proposal CLI leaves input/active registry unchanged and performs no source writes/copies. |
| 4. Palette/logo isolation | PASS: distinct embedded A/B colors and logo bytes; provider same-scope fallback tests. |
| 5. A cannot replace B runtime branding | PASS: foreign response rejection and controller/provider scope-change tests. |
| 6. Wrong embedded/response UUID | PASS: valid-but-inconsistent embedded UUID rejected at installed boundary; canonical client/controller reject foreign response UUID. |
| 7. Wrong origin/environment | PASS: release-vs-runtime binding, selected registry profile, foreign-origin/redirect rejection and provider stale-scope tests. |
| 8. Missing/malformed data | PASS: existing parser/config tests plus proposal/release/fingerprint/palette negative cases. |
| 9. Duplicate packages/domains | PASS: registry and proposal tests, including cross-app/environment conflicts. |
| 10. Wrong app/package | PASS: both kinds/all environments reject incorrect installed package or app kind. |
| 11. Unsafe staging/production origins | PASS: registry/runtime deny HTTP, private HTTPS, local suffixes, single-label/trailing-dot hosts; EAS reserved/tunnel gate. |
| 12. Changed reviewed inputs | PASS: copied-fixture source/Auth/API/features/lockfile/assets/plugin/Firebase/Maps/EAS/registry fingerprint mutations. |
| 13. Development exceptions | PASS: existing explicit development LAN/USB checks and production denial despite development flags. |
| 14. Provider readiness | PASS for fail-closed synthetic validation and truthful unavailable-Maps state; real Firebase/Maps authorization/device acceptance BLOCKED pending independent review. |
| 15. Runtime changes without forks/rebuild | PASS: controller refresh updates name/palette/revision in memory through the canonical API; existing shared semantic consumers update without touching native metadata. Device/hosted behavior NOT RUN. |

These are source/configuration/automated checks; they do not certify installed native behavior or deployed tenant authorization beyond the preserved Spring contracts.

## Verification and limitations

| Check | Actual result |
| --- | --- |
| Registry validation, `npm run --silent mobile:build -- validate` | PASS: 18 existing schema-v2 build combinations (San Thaw Tar plus fictional A/B); syntax/config inspection only. |
| All 12 CLI fixture resolves | PASS; immutable distinct packages/UUIDs/schemes, selected API environment, same-tenant palettes/logos and eight distinct HTTPS associations. |
| Both Expo public config CLI evaluations | PASS: isolated `restaurant-a`, development, `EXPO_NO_DOTENV=1`, offline, notifications explicitly disabled for this fixture only. No native prebuild. |
| `npm run build:packages` | PASS: shared types, tokens, API client and applicable registry build. |
| Focused runtime boundary suites | PASS: 12 Vitest tests across generated matrix and new build-safety cases. |
| Registry/helper/fingerprint tests | PASS: 21/21 Node tests, including 7 new proposal and 3 fingerprint/matrix/EAS-input tests. |
| Customer TypeScript / ESLint / complete test workspace | PASS: 440 Vitest tests across 35 files plus 8 Node config tests; zero failures/skips. |
| Full workspace TypeScript and ESLint | PASS in final `npm run verify:frontend`, including both mobile apps and shared packages. |
| Final complete test stage | PASS: 1,608 Vitest tests across 137 files plus 45 Node tests, zero failures/skips. Includes Operations 457 Vitest + 6 Node, Customer 440 + 8, API client 243, registry 21 Node, artifact/build/geography script tests 10 Node. |
| Admin and Guest web production builds | PASS in final aggregate, including type/lint and static generation. |
| Normal `npm run verify:frontend` | FAIL, exit 1, only at ordinary Operations starter export after all preceding checks above passed: existing Firebase client/project/package mismatch for `dev.restaurantplatform.starter.operations.staging.dev`. No identity/provider setting was changed to force a pass. |
| Normal aggregate Customer starter export | SKIPPED: not reached after the Operations Firebase failure; separate isolated fixture result below covers JavaScript export only. |
| Isolated offline starter JavaScript exports | PASS: both existing starter wrappers exported Android JavaScript successfully (Operations 1,714 modules; Customer 1,384), with dotenv disabled and notification flags false only in this development-fixture process. No signed/native artifact. |
| Backend Maven/database regressions | NOT RUN: no backend/API/migration change; accepted UXI-05 contract/migration source inspected and preserved. |
| Hosted data/migrations/media/invitations/deployment | NOT RUN; no production operations authorized. |
| Cloud EAS / signed APK/AAB / installed-device / live provider/App Link acceptance | NOT RUN; release remains BLOCKED pending external metadata/artwork/domain/provider/signing approvals. |
| Final whitespace, preserved-source and Git checks | PASS: `git diff --check`; staged diff empty; branch/HEAD unchanged; Operations source, backend, shared packages, migrations, real San Thaw Tar JSON/assets and UXI-05 report unchanged. Documentation fences/local links checked. |

The initial sandboxed aggregate failed only the existing API-client real-loopback HTTP integration (`ApiNetworkError`; API client 242/243). That caused its web/native stages not to run. The final aggregate was rerun with loopback access: all 243 API-client tests and the full test/type/lint/web stages passed, then the separate known Firebase mismatch stopped the normal starter stage. Tests were not weakened or skipped to obtain the final result.

Ignored evidence: `target/uxi-06-frontend-verification.log` (initial sandbox), `target/uxi-06-frontend-final.log` (final aggregate), `target/uxi-06-offline-fixture-export.log`, `target/uxi-06-runtime-boundary.log`, `target/uxi-06-mobile-validation.json`, `target/uxi-06-expo-{operations|customer}.json` and `target/uxi-06-fixtures/`. No private credential values are included in this report. Skipped checks and environment failures are not counted as passes.

## Exact changed files

The 29 UXI-06 files below exclude the seven preserved user Postman files and ignored generated logs/JavaScript output:

```text
apps/customer-mobile/app/(store)/_layout.tsx
apps/customer-mobile/app/_layout.tsx
apps/customer-mobile/app/index.tsx
apps/customer-mobile/src/api.test.ts
apps/customer-mobile/src/branding/RuntimeBrandingProvider.test.tsx
apps/customer-mobile/src/branding/RuntimeBrandingProvider.tsx
apps/customer-mobile/src/branding/runtime.test.ts
apps/customer-mobile/src/branding/runtime.ts
apps/customer-mobile/src/components/ui.tsx
apps/customer-mobile/src/config/build-safety.test.mjs
apps/customer-mobile/src/features/storefront/Storefront.test.tsx
apps/customer-mobile/src/features/storefront/Storefront.tsx
apps/customer-mobile/src/navigation/routes.test.tsx
apps/customer-mobile/tests/app-config.test.cjs
configs/restaurants/README.md
configs/restaurants/expo.cjs
configs/restaurants/firebase-android.cjs
configs/restaurants/index.cjs
configs/restaurants/index.d.ts
configs/restaurants/index.mjs
configs/restaurants/mobile-runtime.ts
configs/restaurants/package.json
configs/restaurants/scripts/propose-build.cjs
configs/restaurants/tests/fingerprint-inputs.test.cjs
configs/restaurants/tests/proposal.test.cjs
configs/restaurants/tests/registry.test.cjs
docs/m13-android-branding.md
docs/uxi-06-branded-builds.md
scripts/mobile-build.cjs
```

## Figma evidence and next prerequisites

Current read-only inspection succeeded for [Brand Kit 88:118](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=88-118), [O18 39:742](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=39-742), [C01 14:3](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=14-3), [O69 101:3127](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=101-3127), [O05 15:137](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=15-137) and [audit 27:2](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=27-2). The current text confirms tenant identity, runtime colors, Owner/Manager palette management, Owner-only logo, semantic states and release-managed native identity. It supplies no verified native package IDs/signing/domains or approved full-resolution release assets. Residual older “Best seller” copy remains in O05 and a small O69 subtitle; accepted Owner-curated Featured semantics and modifier contracts were preserved, with no Figma edits.

Figma completion labels describe visual specifications, not source/runtime/device acceptance. No pixel-perfect Customer redesign, installed-device theme/accessibility/native splash validation, real provider or production-launch acceptance is claimed. UXI-07/08 require their own authorization and existing hosted API/migration/media rollout and original asset/UUID mapping gates. Real release preparation additionally requires all independent identity/artwork/deployed-domain/version/signing/provider reviews above. This task stops after UXI-06.
