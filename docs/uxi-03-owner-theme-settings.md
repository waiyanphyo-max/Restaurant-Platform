# UXI-03 — Owner/Manager runtime theme settings

Date: 19 November 2026 (Asia/Bangkok). Scope: UXI-03 only.

## Baseline and verified dependencies

Branch: `uxi/03-owner-theme-settings`. Starting HEAD: `91e7fb41cb227a70cd5706360874968200883275`. Starting staged and unstaged tracked diffs were empty. The existing untracked `.postman/` and `postman/` directories were preserved without reading their private contents. No applicable `AGENTS.md` was found in the repository or its ancestors.

The six requested baseline, product-policy, Figma-amendment, roadmap and UXI-01/02 completion documents were read, along with relevant current API documentation, shared contracts, transport/auth/workspace/lifecycle code and tests. The current source contains UXI-02's `RestaurantBrandingController`, `RestaurantBrandingService`, shared DTOs/client methods, profile logo security fix and `20261119090000_add_restaurant_runtime_branding.sql`. Presence in source does **not** establish that hosted Supabase has applied that migration. No backend, API contract, schema or migration was changed or applied here.

## Read-only Figma evidence and design boundary

Inspected the existing [Restaurant Platform file](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform) using the Figma design-to-code skill and read-only tools:

| Node | Evidence used |
| --- | --- |
| `88:118` | Tenant-specific San Thaw Tar palette; runtime/native distinction; semantic danger separation |
| `39:742` | O18 context and screenshot, including runtime panel `168:2`: Preview → Review → Save, failure/stale guidance, Owner/Manager colors, Owner-only logo |
| `39:1815` | Owner tools and Owner-only brand controls |
| `53:1817`, `53:1827`, `53:1836` | Manager runtime palette; Owner-only logo and restricted team/ownership |
| `72:3041` | Only actual supported ordering settings; review and release-managed native identity |
| `41:219` | Reusable review confirmation pattern |
| `16:71` | Forbidden state and role explanation |
| `28:116` | 48-unit controls, text scaling, linked errors, announcements, dialog focus and outstanding device checks |
| `27:2`, descendants `27:361`, `27:425`, `56:2` | Audit structure, runtime settings policy, historical coverage labels and remaining acceptance gates |

The page-level `27:2` design-context request returned a selection diagnostic. Metadata successfully located its relevant descendants, whose design contexts were then read. No Figma mutation was attempted. The approved palette policy/preview is implemented by composing existing native components. A dedicated complete editor, every role/error/disabled state and final visual layout are not approved Figma specimens; **no pixel-level Figma acceptance is claimed**. No Figma sample logo/photo/icon was copied into the app; identity imagery remains dynamic or the existing same-tenant embedded fallback.

## Editor behavior

Only the existing Owner/Manager Settings route exposes the editor. Staff/Delivery Driver also receive a forbidden presentation if the screen/editor is rendered directly. Spring remains the permission authority.

The screen displays the persisted three colors and palette revision. `palette: null, revision: 0` explicitly means nothing has been saved; embedded fallback values are never labelled persisted. Edit opens a local three-field draft using exactly `primaryColor`, `secondaryColor`, `backgroundColor`. Values must be seven-character `#RRGGBB`; accepted values normalize uppercase. Invalid fields show associated guidance, focus the first invalid input and announce the problem.

Preview is confined to a nested UXI-01 `ThemeProvider`; the shell and other screens retain persisted colors. Shared `resolveThemeTokens` computes readable foregrounds, surfaces and status colors. No contrast algorithm or editable derived token set is added. The unsaved preview is explicitly labelled, and its sample controls have preview-only accessibility hints.

Review lists the expected revision and old/proposed values for all three fields. Only the explicit confirmation calls the existing `updateBranding` API. Cancel review preserves the proposal; Cancel palette edits discards it without writing. A remotely changed revision disables saving until the latest palette is explicitly loaded and reviewed again. Drafts live only while this screen/session remains mounted; no durable offline draft is promised.

## Runtime integration, refresh and fallback

`RuntimeBrandingProvider` wraps the workspace boundary so it observes real auth state rather than the boundary's retained ready presentation. It supplies runtime identity and palette to the existing tenant-checked `ThemeProvider`; workspace header, navigation and shared controls consume semantic tokens. It uses the embedded restaurant UUID, exact API base URL, environment, verified user and role as the in-memory scope. There is no global mutable branding cache or tenant selector.

The public branding GET starts when the workspace becomes authorized. During the request, only that build's embedded fallback is displayed. Backend name and safe logo take precedence when available; null logo falls back to the same tenant's existing embedded asset/URL. The raw general-profile logo URL is not rendered as an alternate source. Failed refresh retains the last validated same-scope branding; a missing first response uses only the embedded fallback. Wrong UUIDs, malformed/nonzero-null palettes and revision rollback cannot replace a previously validated theme.

The existing AuthProvider AppState listener suspends/revalidates access across background/foreground. The branding provider reuses those transitions, pauses obsolete work during membership checking, and refreshes on ready resumption. No additional AppState listener, polling loop or persistent cache is introduced. Refreshes coalesce; GET uses a 10-second per-attempt timeout and the shared transport's single bounded retry. Explicit retry/pull-to-refresh is available. Successful palette PUT immediately applies its validated response and fetches current branding; successful profile/logo changes also refresh branding.

Scope changes, sign-out, revoked access and unmount abort pending reads/writes and invalidate response generations. Same-user revalidation preserves the last safe visual theme while preventing stale requests from becoming authoritative. No theme transfers to another restaurant/API environment/account/role.

## Permissions, logos and preserved workflows

Owner/Manager can save palette colors through `PUT /api/v1/restaurants/{embeddedUuid}/branding` with only `{expectedRevision, palette}`. The public read is `GET /api/v1/public/restaurants/{embeddedUuid}/branding`. Shared types/client validation and request projection are reused unchanged.

Only Owners see Choose and upload logo. The existing picker, membership revalidation, scoped token and Spring upload remain in use. Managers see the current safe logo plus explicit read-only guidance. Profile updates omit `logoUrl` for both roles; neither profile nor palette UI can inject a replacement URL. Failed upload keeps the displayed previous image, and successful upload refreshes branding. Native launcher icon, splash and installed identity changes are explained as a separately reviewed release.

Restaurant Profile and the existing Ordering Settings fields, validation and review remain available. Catalog/options/pricing, geography, checkout, QR, order actions, delivery/payment and accounting code is untouched. Immutable tenant/application IDs, release assets, signing and API/deployment origins are unchanged. Guest Web and Customer Android runtime consumers are not implemented here.

## Save, conflict and failure handling

The existing mutation gate prevents rapid duplicate taps; the controller independently gates palette writes and never automatically retries PUT. Cancellation/generation checks prevent late results or success announcements after losing access. Refresh failure after a confirmed PUT retains the confirmed same-tenant palette and shows refresh guidance.

- `401`/missing token uses existing sign-out/session expiry behavior.
- `403` displays forbidden guidance and does not report a failed write as successful.
- `409 RESTAURANT_BRANDING_STALE` refreshes the persisted DTO and blocks another save until explicit Load latest palette → edit → review. The old proposal never silently overwrites the newer server palette.
- Offline/timeout or another uncertain write result preserves the previous validated theme and requires a successful read plus another review before another write. No new revision is silently substituted.
- Invalid client colors receive field-level errors; unknown server failures do not report success.

## Changed files

13 source/test/documentation files; existing Postman files are excluded and untouched.

| File | Purpose |
| --- | --- |
| `apps/operations-mobile/app/(workspace)/_layout.tsx` | Mount runtime branding outside the workspace boundary; consume runtime name/logo and semantic colors |
| `apps/operations-mobile/src/api.ts` | Expose the existing public `getBranding` client method |
| `apps/operations-mobile/src/api.test.ts` | Actual client adapter/transport projection, environment/tenant isolation, bounded retries and scoped token checks |
| `apps/operations-mobile/src/branding/runtime.ts` | Component-owned request controller, generation/abort guards, monotonic revision checks, refresh/save sequencing |
| `apps/operations-mobile/src/branding/runtime.test.ts` | Controller authorization, identity, race, cancellation, fallback and failure tests |
| `apps/operations-mobile/src/branding/RuntimeBrandingProvider.tsx` | Bind controller lifetime to embedded tenant/environment and real workspace lifecycle; supply existing ThemeProvider |
| `apps/operations-mobile/src/branding/RuntimeBrandingProvider.test.tsx` | Provider, auth transition, first-load, foreground, fallback and unmount integration checks |
| `apps/operations-mobile/src/components/ui.tsx` | Optional input ref for focusing invalid fields; clarify presentation-provider responsibility |
| `apps/operations-mobile/src/components/ui.test.tsx` | Verify field focus ref forwarding while preserving existing accessibility assertions |
| `apps/operations-mobile/src/features/management/SettingsScreen.tsx` | Role-gated palette integration, safe read-only logo, omit profile logo field, refresh after profile/upload success |
| `apps/operations-mobile/src/features/management/RuntimePaletteEditor.tsx` | Three-color draft/preview/review/save, field errors, conflict/uncertain-state recovery and accessibility |
| `apps/operations-mobile/src/features/management/runtime-palette-editor.test.tsx` | Interactive editor and existing profile/ordering/logo compatibility checks |
| `docs/uxi-03-owner-theme-settings.md` | This completion and acceptance record |

## Verification

| Actually executed check | Result |
| --- | --- |
| `npm run build:packages` | **PASS**, shared-types/ui-tokens/API-client builds |
| Operations `typecheck` and `lint` | **PASS**, including the integrated runtime/editor files |
| Operations `test` | **PASS**, 429 Vitest tests in 40 files plus 6 Node configuration tests; no failures/skips |
| Focused runtime controller/provider tests | **PASS**, 48 tests (38 controller, 10 provider) |
| Focused editor tests | **PASS**, 26 tests |
| Focused actual Operations API adapter tests | **PASS**, 13 tests |
| Focused shared native UI tests | **PASS**, 14 tests, including optional input-ref forwarding |
| API-client full suite outside sandbox | **PASS**, 162 tests in 14 files |
| `npm run --silent mobile:build -- validate` | **PASS**, 18 reviewed configuration combinations; no signed build |
| Normal Operations Android `build:starter` | **FAIL**, before bundling, due to the existing local Firebase starter/client mismatch described below |
| Full `npm run verify:frontend` outside sandbox | Typecheck, all workspace lint, **1,400 Vitest tests in 126 files plus 32 Node tests**, and both web production builds **PASS**. Aggregate **FAIL**, exit 1, at the existing Operations Firebase starter mismatch. Customer export was not reached by this aggregate. |
| Command-local offline `npm run build:mobile:starter` | **PASS**, exit 0: Operations 4.7 MB and Customer 3.8 MB Android Hermes JavaScript bundles exported; qualifications below |
| Final editor tests and focused ESLint after copy review | **PASS**, 26/26 tests and lint; verified truthful revision-zero fallback and generic failed-request wording |
| Final Git/whitespace/changed-path check | **PASS**, same branch/HEAD, staged diff empty, 13 scoped changed files; existing Postman paths untouched |

The API-client sandbox attempt passed 161/162; only the existing real-loopback HTTP transport test failed with `ApiNetworkError`. The complete identical suite outside the sandbox passed 162/162; no assertion was weakened or skipped.

The normal Operations export still reports that `OPERATIONS_GOOGLE_SERVICES_FILE` does not contain the Android client for `dev.restaurantplatform.starter.operations.staging.dev` in the configured Firebase project. This is the same pre-existing private-environment mismatch as UXI-01/02. No `.env`, Firebase JSON, app ID, notification implementation or release configuration was edited.

The separate offline export used the existing `export-starter.cjs` development fixture with process-local `EXPO_NO_DOTENV=1`, `OPERATIONS_NOTIFICATIONS_ENABLED=false` and `CUSTOMER_NOTIFICATIONS_ENABLED=false`; previous process values were restored in `finally`. This exercises JavaScript bundling without requiring the mismatched private Firebase client. It does **not** verify FCM or a branded/signed native build, and does not turn the normal aggregate green. Outputs are ignored `dist-starter` files. The frontend test stage preceded the final two copy corrections; the 26 editor tests and focused lint were rerun after those corrections.

Automated coverage includes Owner/Manager save; Staff/Driver denial; A/B/environment isolation and foreign UUID rejection; missing palette/revision 0; invalid client/server field values; local preview/cancel; immediate save response and refresh; bounded GET retry and no write retry; stale/uncertain recovery including cancel/reopen; 401/403; Owner upload and Manager read-only; foreground transitions; pending fetch/write invalidation; rapid duplicate taps; profile/ordering compatibility; and foundation labels, focus, announcements, targets and scaling props. These fixture tests make no request to a live restaurant.

Logs are local ignored files under `target/uxi-03-*`; no private credentials are included in this report. Backend/Maven/PostgreSQL checks were **NOT RUN** because backend, contracts and persistence are unchanged. Hosted migration/provider/production-data actions were **NOT RUN**.

## Acceptance limitations and next gates

Automated native renders/hook tests inspect labels, minimum targets, scaling props, errors, announcements and focus requests. They do not certify TalkBack behavior, actual focus confinement/return, keyboard/safe-area behavior, 200% physical font scaling, narrow-device reflow, English/Myanmar language quality or installed Android rendering. No browser/device visual acceptance, signed APK/AAB, FCM/provider acceptance or production rollout is claimed.

Before release, separately verify the hosted UXI-02 migration ledger/API parity, approve remaining Figma editor states and perform device/accessibility acceptance. Original media provenance and tenant/product UUID mapping remain separate publication gates. UXI-04 depends on the accepted single UXI-02 runtime authority and must use its trusted initialization path plus reviewed provisioning/catalog/media contracts. No UXI-04 work was started here.

Final branch/HEAD remain `uxi/03-owner-theme-settings` / `91e7fb41cb227a70cd5706360874968200883275`, and the staged diff remains empty. No branch switch, staging, commit, push, merge, deployment, hosted migration, production branding/media change or native identity change was performed. Work stops at UXI-03 for review.
