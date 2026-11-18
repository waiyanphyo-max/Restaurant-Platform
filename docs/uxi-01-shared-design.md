# UXI-01 — Shared foundations implementation

Date: 18 November 2026 (Asia/Bangkok). Scope: UXI-01 only.

## Workspace and authority

Branch: `uxi/01-shared-design`. Starting HEAD: `ef53c378df2cf1a9f1cc929bf7eb0cf0fe378d65` (`starting`, PR #40). Starting staged and unstaged tracked diffs were empty. The seven pre-existing files under `.postman/` and `postman/` were preserved without reading their private contents. No branch switch, stash, reset, staging, commit, push, merge or deployment was performed.

All four source documents were read completely: `ux-implementation-baseline.md`, `ux-product-decisions.md`, `ux-figma-d0-amendments.md` and `uxi-v2-codex-roadmap.md`. Their historical statements that every D0 Figma amendment was blocked remain historical. The user's latest amendment update supersedes that status. Read-only live inspection also confirmed the changed foundation policy and session-lifetime copy. Several amendments have been applied; complete visual, role, confirmation, disabled/error and accessibility acceptance remains pending. No Figma editing was attempted.

## Changed files

| File | Reason |
| --- | --- |
| `packages/ui-tokens/src/index.ts` | Add semantic tokens, scalable typography/density, safe pure palette resolution, contrast helpers and scoped CSS conversion. Retain existing spacing/radii and strict brand resolver. |
| `packages/ui-tokens/src/index.test.ts` | Preserve original tests; cover red/non-red themes, malformed/missing values, same-tenant fallback, immutable independent results, semantic pairs and contrast across 343 RGB samples. |
| `apps/guest-web/src/app/globals.css` | Replace presentation literals with semantic variables; provide neutral unbranded defaults, reusable control/status classes, readable dark themes, focus, larger targets, wrapping and relative sizing. Preserve screen structures and breakpoints. |
| `apps/guest-web/src/components/GuestShell.tsx` | Apply the complete token set on each existing tenant shell. This small additional touch is necessary because CSS alone cannot calculate arbitrary tenant foreground/focus contrast. |
| `apps/guest-web/src/components/GuestState.tsx` | Extend the existing state primitive with offline/forbidden presentations and explicit live/status semantics. Existing state names and navigation remain supported. |
| `apps/guest-web/src/lib/i18n.ts` | Supply English/Myanmar strings for those two new presentation variants; no new route or workflow. Myanmar linguistic acceptance remains pending. |
| `apps/guest-web/src/components/GuestFoundations.test.tsx` | Check isolated repeated server renders, safe fallback styles including unbranded routes, existing landmarks and bilingual state semantics. |
| `apps/customer-mobile/src/components/ui.tsx` | Consume shared tokens and add reusable badge/status/confirmation primitives, loading/empty/forbidden variants and a tenant-checked presentation provider. Preserve existing caller props and denied behavior. |
| `apps/operations-mobile/src/components/ui.tsx` | Apply the same foundation contract while retaining DataTable, BarChart and existing confirmation/public component interfaces. |
| `apps/operations-mobile/src/components/forms.tsx` | Remove hardcoded form/feedback text colors so dark palettes remain readable; preserve form callbacks and improve toggle target/announcements. |
| `apps/customer-mobile/src/components/ui.test.tsx` | Focused Customer primitive behavior, identity/fallback, contrast pairing, disabled/busy actions, fields, confirmations and scaling/layout contracts. |
| `apps/operations-mobile/src/components/ui.test.tsx` | The equivalent Operations contracts while preserving existing Operations-specific consumers. |
| `docs/uxi-01-shared-design.md` | This completion record, evidence limits and next-milestone prerequisites. |

## Tokens and component behavior

The neutral platform fallback is slate `#334155`, never San Thaw Tar red. Existing reviewed build/registry branding remains in use, including its current green San Thaw Tar fallback; no registry or native asset was recolored. Red `#A51D22` is exercised explicitly as supplied tenant branding in fixtures. The supported branding inputs remain the existing primary, secondary and background colors; this milestone defines no persistent runtime palette schema.

`resolveBrandTokens` retains its strict validated-build behavior and invalid-value error. New `resolveThemeTokens(branding?, fallbackBranding?)` validates six-digit colors per field, uses the caller's same-tenant build fallback where supplied, then neutral defaults. It returns frozen, independent results without global caches, identity lookup, persistence or mutation. Web overrides remain below the document root. Mobile `ThemeProvider` accepts presentation data only when its restaurant ID matches the immutable embedded restaurant; foreign IDs use that build's fallback. It performs no network reads or writes.

Semantic colors cover primary/secondary with paired foregrounds; background/surface/muted surface; foreground/muted foreground; decorative and control borders; accent/focus; distinct success/warning/danger fills, soft surfaces and readable status text; disabled surface/foreground. Text colors meet at least 4.5:1 on their intended surfaces. Focus/control borders meet at least 3:1. Semantic colors remain separate from restaurant primary; status components also carry text, so meaning does not depend on color alone.

Shared rhythm is 4/8/16/24/32, with 2 for small inset use; radii are 6/12/20. Type includes heading 28/36, title 22/30, subtitle 18/26, body 16/24, label 14/22, caption 12/18 and Myanmar specimen 18/30. Web dimensions use rem and unitless line height. Native Text/TextInput preserve font scaling without fixed line counts or height caps; controls have minimum 48-unit targets and growing content. Page/dialog content scrolls; long labels wrap. Inter/Padauk font files were not supplied, downloaded or assumed installed. Existing system fallbacks remain.

Native Action supports primary/secondary, selected, danger, disabled and busy presentations without changing caller-owned operations. Fields retain labels, callbacks and styles, adding theme-aware focus/disabled/error presentation and error hints/announcements. Badge and Status use paired semantic surfaces. ConfirmDialog adds safe cancel-first ordering, a scrollable modal, disabled/busy confirmation, focus-on-show and an optional focus-return ref. Existing calls still work. Keyboard/screen-reader focus confinement and restoration require installed-device acceptance.

Before, most shared surfaces/text/borders/status colors were fixed literals and only primary-button contrast was resolved. Now complete palettes resolve per presentation scope and invalid colors fall back safely. Previously mobile states lacked explicit empty/forbidden kinds; both now exist alongside compatible loading/offline/error/denied kinds. Existing error classification is unchanged: a new forbidden primitive does not reclassify current 401/403 handling. Guest offline/forbidden variants are available for later consumers; no new network classifier or retry workflow is introduced.

## Figma evidence

Read-only design context and screenshots were used for these stable shared references:

- [Tenant brand kit `88:118`](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=88-118): verified tenant-only red, configured modifiers, Owner-curated Featured and runtime/build distinction.
- [Foundation specification `12:76`](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=12-76), [button states `28:67`](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=28-67), [input states `28:85`](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=28-85).
- Semantic badges `12:62`, `12:64`, `12:66`; [confirmation `41:219`](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=41-219); [accessibility specification `28:116`](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=28-116); state panel `28:109`.
- [Forbidden `16:71`](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=16-71), [empty `20:18`](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=20-18), [loading `40:1641`](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=40-1641), [offline `16:27`](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform?node-id=16-27). Offline text `16:33` now limits cart availability to the current session; stale layer names are not current policy.

The amended product/settings/counter/audit nodes supplied by the user (`13:153`, `14:39`, `39:742`, `53:1906`, `27:2`) provide policy context; they were not implemented as screens in UXI-01. No asset imagery was needed for these primitives.

## Verification

Results are recorded after execution below; no historical baseline test totals are reused.

| Command | Actual result |
| --- | --- |
| `npm run test -w @restaurant-platform/ui-tokens` | **PASS**, 12 tests, including the existing strict resolver tests and the new color/contrast/fallback coverage. |
| `npm run typecheck -w @restaurant-platform/ui-tokens`; `npm run lint -w @restaurant-platform/ui-tokens`; `npm run build -w @restaurant-platform/ui-tokens` | **PASS**. The final exact color-length guard was also covered by the test rerun and subsequent root package build. |
| `npm run test -w @restaurant-platform/guest-web -- src/components/GuestFoundations.test.tsx src/components/GuestPage.test.tsx src/components/GuestLayouts.test.tsx` | **PASS**, 3 files / 30 tests after adding the neutral unbranded-route contract check. |
| Focused native `ui.test.tsx` run in both apps | **PASS**, 2 files / 28 tests. |
| `npm run typecheck -w @restaurant-platform/customer-mobile`; `npm run typecheck -w @restaurant-platform/operations-mobile`; corresponding workspace lint commands | **PASS**, including final TypeScript rechecks after optional Action ref support. |
| Initial `npm run verify:frontend` inside the sandbox | **FAIL**, exit 1, at the existing API-client real-loopback transport test. A minimal reproduction proved `connect EACCES 127.0.0.1:<ephemeral port>`; source/tests were unchanged. TypeScript/lint and all other workspace suites passed in that run. The failed test stage prevented later `&&` build stages. |
| `npm run test -w @restaurant-platform/api-client -- src/platform.test.ts` outside the sandbox | **PASS**, 17/17. The same test failed inside the sandbox; this verifies the environmental restriction without weakening or skipping assertions. |
| Full `npm run verify:frontend` rerun outside the sandbox | TypeScript, all workspace lint, all tests and both web production builds **PASS**. Test totals: 1,262 Vitest tests across 121 files plus 32 Node tests, zero failures/skips. Operations has 342 tests / 36 files; Customer has 392 / 32. The aggregate exits **1** at the mobile starter export because the pre-existing local Firebase client does not match `dev.restaurantplatform.starter.operations.staging.dev`. Customer export is not reached by that failed aggregate. |

The mobile failure is an existing private-environment/fixture mismatch, also documented in `location-orders-auth-verification.md`. A command-local continuation ran `npm run build:mobile:starter` with `EXPO_NO_DOTENV=1`, `OPERATIONS_NOTIFICATIONS_ENABLED=false` and `CUSTOMER_NOTIFICATIONS_ENABLED=false`; previous process values were restored in `finally`. It uses the repository's existing offline development starter fixture, not a branded release or a bypass of a production Firebase check. No `.env.local`, Firebase JSON, application ID, notification implementation or release configuration was edited. **PASS**, exit 0: both Operations (4.7 MB) and Customer (3.8 MB) Android Hermes JavaScript bundles exported to their ignored `dist-starter` directories. These are not signed APK/AABs or FCM/device verification.

All frontend stages have therefore been exercised successfully with the documented environment exceptions. The ordinary aggregate command remains **FAIL** in the current local Firebase environment; it is not reported as an unqualified green run. Local evidence logs are `target/uxi-01-frontend-verification.log`, `target/uxi-01-frontend-verification-local.log` and `target/uxi-01-mobile-starter-verification.log`. `git diff --check` passed. Final branch and HEAD match the starting values, staged diff is empty, and changed source paths are limited to the 13 files above. The original seven Postman files remain untouched.

Browser visual acceptance is **BLOCKED** in this session. A local synthetic fixture using the actual GuestShell/GuestState and stylesheet started successfully at loopback port 4191. The in-app browser returned `net::ERR_CONNECTION_TIMED_OUT` opening that loopback URL. Native Chrome selection repeatedly returned `window is minimized; call activate_window, refresh with get_window, then retry get_window_state`; launching the existing Chrome app did not restore a targetable window, and the available wrapper exposes no activation method. The preview was stopped and its temporary script removed. No browser screenshot/reflow pass is claimed.

Installed Android, native keyboard/safe-area behavior, TalkBack/VoiceOver, physical 200% text, font licensing/rendering and full Figma visual acceptance are **NOT RUN**. Automated checks of scaling props, minimum sizes and scrollable structures are not a substitute. Per-screen clamped menu descriptions remain later Guest/Customer presentation work. Maven/database verification is **NOT RUN** because no backend, API, schema or database files changed.

## Preserved behavior and next boundaries

No auth, tenant resolution/binding, API client contract, QR capability/idempotency, geographic hierarchy, modifier/variant pricing/validation, server Accept/Complete/Cancel, delivery/COD/payment, immutable order history, shopping/purchasing or accounting implementation changed. No native launcher/splash/package/signing configuration, production/hosted data, database schema or migration changed. Existing suites provide compatibility evidence within their actual coverage, not a new end-to-end/device certification.

Remaining D0 dependencies include complete confirmation/disabled/error/role/accessibility review, bilingual/font approval, installed-device focus and scaling acceptance, original-media/UUID provenance and separate hosted migration/geography readiness. Partial Figma amendments do not close those gates.

UXI-02 must define the single backend runtime palette authority, safe public/private DTOs, validation and revision/conflict behavior, permissions and same-tenant/environment refresh/fallback rules. It must preserve Owner-only logo upload and explicitly review the existing general-profile logo-URL write seam. The presentation providers here do not implement any of that persistence, fetching, invalidation or native-shell integration. Dark-theme review of screen-specific literal styles belongs to the later app milestones. Any future schema or release action needs its own scoped review.

No additional approval is needed to review these local UXI-01 changes. User review/commit/PR remains the next handoff. No UXI-02 or later work was started; no commit, push, merge or deploy was performed.
