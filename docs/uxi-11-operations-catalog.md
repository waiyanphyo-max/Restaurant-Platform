# UXI-11 — Operations catalog, runtime settings, zones, team and QR

Date: 22 November 2026, Asia/Bangkok. Scope: UXI-11 only. Implementation and local verification are complete subject to the explicit visual, native and hosted acceptance gates below. UXI-12 has not started.

## 1. Baseline and preserved work

- Branch: `uxi/11-operations-catalog`.
- HEAD: `fce75fe40c096508e49448c67926b88efb9cbbe0`, the UXI-10 PR #50 merge. The ancestry check passed and HEAD itself is that accepted baseline.
- Initial tracked/staged tree was clean. Existing untracked `.postman/` and `postman/` remain preserved and excluded from this work.
- No reset, stash, branch switch, staging, commit, push, merge, deployment, hosted SQL, production API mutation, native prebuild or signed build was performed.
- The team read the implementation baseline, product decisions, D0 amendments, v2 roadmap, UXI-03/04/05/06/10 reports, API documentation and role matrix completely, then inspected current frontend/backend source and relevant tests before implementation. Historical roadmap assumptions about absent branding/Featured contracts were treated as superseded.

## 2. KEEP / ADAPT / ADD assessment

| Decision | Assessment communicated before implementation |
|---|---|
| KEEP | Shared Spring APIs and DTOs; verified membership and immutable embedded tenant; exact whole-currency amounts; variants and required/optional modifiers; editorial Featured revisions; Spring media/picker recovery; canonical runtime palette; one-time QR and export cleanup; UXI-10 order, queue, delivery, assignment and COD behavior. |
| ADAPT | Catalog photo/status hierarchy, product/category/options editing, grouped profile/ordering settings, canonical/legacy zone presentation, invitation/member reviews and table edit confirmation to the live Figma patterns. |
| ADD | Shared open-form navigation/discard protection, validated catalog reviews, stale-product/settings/zone checks, uncertain invitation session recovery, operation-specific confirmed feedback, active location feedback, and focused synthetic interaction/tenant-scope regressions. |

No new backend endpoint, schema, migration, permission, currency conversion, branding authority, native identity or media publication path was needed.

## 3. Exact changed files

All paths are repository-relative. Generated build/preview outputs under ignored directories are not source changes.

```text
apps/operations-mobile/app/(workspace)/_layout.tsx
apps/operations-mobile/src/api.test.ts
apps/operations-mobile/src/components/LocationSelector.tsx
apps/operations-mobile/src/components/LocationSelector.test.tsx
apps/operations-mobile/src/features/management/InvitationRecoveryProvider.tsx
apps/operations-mobile/src/features/management/RuntimePaletteEditor.tsx
apps/operations-mobile/src/features/management/SettingsScreen.tsx
apps/operations-mobile/src/features/management/TablesScreen.tsx
apps/operations-mobile/src/features/management/TeamScreen.tsx
apps/operations-mobile/src/features/management/controls.tsx
apps/operations-mobile/src/features/management/invitation-recovery.test.tsx
apps/operations-mobile/src/features/management/management-interactions.test.tsx
apps/operations-mobile/src/features/management/runtime-palette-editor.test.tsx
apps/operations-mobile/src/features/management/screens.test.tsx
apps/operations-mobile/src/features/menu/CatalogEditorActions.tsx
apps/operations-mobile/src/features/menu/CatalogImageControl.tsx
apps/operations-mobile/src/features/menu/FeaturedProductPanel.tsx
apps/operations-mobile/src/features/menu/MenuScreen.tsx
apps/operations-mobile/src/features/menu/catalog-interactions.test.tsx
apps/operations-mobile/src/features/menu/featured-media.test.tsx
apps/operations-mobile/src/features/operations/DeliveriesScreen.tsx
apps/operations-mobile/src/features/operations/DeliveryConfiguration.tsx
apps/operations-mobile/src/features/operations/counter-delivery-interactions.test.tsx
apps/operations-mobile/src/features/operations/delivery-configuration.ts
apps/operations-mobile/src/features/operations/delivery-configuration.test.ts
apps/operations-mobile/src/features/operations/delivery-configuration-interactions.test.tsx
apps/operations-mobile/src/hooks/useUnsavedChanges.ts
apps/operations-mobile/src/navigation/DraftNavigationProvider.tsx
apps/operations-mobile/src/navigation/DraftNavigationProvider.test.tsx
apps/operations-mobile/src/navigation/RouteAction.tsx
apps/operations-mobile/src/navigation/RouteAction.test.tsx
apps/operations-mobile/src/navigation/ScreenGuard.tsx
scripts/operations-preview.cjs
docs/uxi-11-operations-catalog.md
```

## 4. Live Figma inspection

Read the original [Restaurant Platform file](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform) directly through the Figma connector before coding. Design context and screenshots were inspected for these supplied frames; Audit Coverage was additionally read through a read-only hierarchy/text traversal. Figma was not modified.

| Family | Inspected references |
|---|---|
| Catalog and settings | O05 `15:137`, O11 `39:384`, O12 `39:440`, O14 `39:554`, O15 `39:605`, O18 `39:742`, O57 `72:2944`, O58 `72:2964`, O62 `72:3041`, O69 `101:3127` |
| Team and QR | O16 `39:657`, O17 `39:705`, O19 `39:785`, O20 `39:832`, O59 `72:2985`, O60 `72:3004`, O61 `72:3023` |
| Safeguards | S03 `16:27`, S06 `16:71`, S08 `20:30`, S26 `40:2293`, S27 `40:2334`, S30 `40:2455`, S32 `50:607`, S34 `50:660`, S37 `72:3831`, S38 `72:3848`, S40 `72:3884` |
| Foundation/coverage | Brand Kit `88:118`, Audit Coverage `27:2` |

Used the existing semantic components, wrapping forms, 12px card radii, 12px gaps, 16px card padding, 28/36 heading and 16/24 body hierarchy, distinct destructive actions and review/cancel patterns. Existing generic navigation icons are reused. Logos and food photos remain dynamic tenant data; no sample food photo, example UUID, contact, price or credential was installed as production data.

The live file contains corrected Featured/modifier wording in several frames but still has “Best seller” copy in O05 and an O69 menu row, plus a stale reusable food-row description excluding modifiers. Approved editorial Featured and retained variants/modifiers take precedence. S38's “No access was changed” specimen is not used as a claim after an uncertain provider response.

## 5. Catalog/category/product editing

The menu keeps category navigation, search, availability/category filtering and pagination. Product rows now include a compact 72px safe image/fallback, wrapping name/description/category, price, availability and stock badges. Colors use current semantic tenant tokens; no San Thaw Tar product or price is hardcoded.

`CatalogEditorActions` supplies one validated review/save/cancel/discard flow for category, product, variant, group and option forms. Reviews capture the validated request, detect draft changes before confirmation, explain effects on future Guest/Customer/Counter ordering and retain historical snapshots. Category/product deactivation keeps the existing update model. Required-field, amount, stock and relationship validation continues through the existing model and Spring rules.

Product drafts remain mounted through same-scope refresh. A changed current product blocks overwrite and offers explicit reviewed loading of current values. Close-after-uncertainty refreshes the list/details for reconciliation instead of automatically repeating a creation. Catalog writes use the expected current subject/role access guard and fixed embedded restaurant API client.

## 6. Variants and modifiers

Variant names, optional multiline descriptions, exact prices, availability and images remain available. Required/optional group rules, min/max selections, option price/availability, and existing attach/detach endpoints remain intact. Attachment now reviews the group's rules and effect on new checkouts; removal and option/group changes explain historical-snapshot preservation and required-choice impact. Confirmed saves refresh relevant details/menu.

No variants-only simplification, automatic historical repricing, destructive product deletion or invented duplicate-name policy was introduced. Current Spring catalog validation does not establish a universal duplicate-name prohibition; adding one would exceed the actual contract.

## 7. Owner-curated Featured

The accepted `FeaturedProductPanel` remains the single editorial selector. Only Owner sees mutation controls; Manager/Staff retain permitted read status and Driver is denied before catalog requests. Persisted product UUID, NONE/UNAVAILABLE status, expected revision, review, confirmed save and conflict/uncertain refresh behavior remain unchanged. Its draft now participates in route-leave protection. Availability changes do not silently choose a replacement.

## 8. Media preview/upload/recovery

Retained `CatalogImageControl`, `useImageUpload`, picker validation and authenticated Spring multipart endpoints. Published pictures require credential-free HTTPS without fragments, with a readable failure fallback. A separate local-preview component renders the validated native picker URI, including `file://`; published URL restrictions are not relaxed for local files.

Product/variant UUID checks, PNG/JPEG/WebP support, maximum 5 MiB, explicit upload, returned ID/URL validation, old-image retention, uncertain read reconciliation and membership revalidation after picker interruption remain. New tests specifically catch unsafe published URLs and the native local-preview regression. No direct Supabase Storage client, crop-byte editor or persistent alt-text field was added.

Known San Thaw Tar originals still require approved provenance, hashes, real production UUID mapping and publication authorization. No food photo or logo was uploaded.

## 9. Runtime branding and profile permissions

Retained the UXI-03 canonical three-color revision editor, nested preview, conflict/uncertain refresh, contrast derivation and same-tenant fallback. Only its dirty-state registration changed. Colors update at runtime without rebuilding Android; native package IDs, launcher/splash, signing, origins and release profiles remain unchanged.

Profile fields retain current supported limits. Public edits now review before PUT, preserve drafts through refresh, detect changed server values, confirm discard and require a successful server read after uncertain writes. Profile requests omit `logoUrl`. Owner alone retains the existing Spring logo upload; Manager sees the current logo as read-only. The upload feedback appears only when the existing uploader confirms a successful publication.

## 10. Ordering configuration

Continues using `getSettings()`/`updateSettings()` with exactly `currency`, `timezone`, `minimumOrder`, `defaultDeliveryFee`, `acceptsOrders`, `allowQrOrder`, `allowDelivery` and `allowTakeaway`.

The review shows before/after values, exact amounts and effects on new orders/pending checkouts. It explicitly states that existing orders are not cancelled, payments are not collected, QR credentials are not rotated and historical amounts are not converted. Existing currency/IANA-timezone validation remains. Drafts survive refresh, known stale values block save, discard loads current fields, and an uncertain write requires successful read reconciliation before another review.

## 11. Canonical/legacy zones and default driver

Extracted configuration into `DeliveryConfiguration` and its existing-contract draft model. `DeliveriesScreen` only replaces the configuration import/removes its old configuration tail; task, assignment, pickup, status and COD implementation is unchanged.

Zone rows use stable IDs, retain drafts across refresh and display original labels, fees, minimums and enabled state. Existing coverage can be explicitly preserved by omitting coverage fields, as the existing Spring update contract supports. Legacy ambiguity remains visible; no text-to-ID inference occurs. New/replacement coverage and reactivation require reviewed active canonical selections. Parent changes clear descendants atomically; the selector reports inactive/missing listed IDs and blocks authorization of new coverage.

Zone reviews show before/after configuration, capture a draft fingerprint, recheck current records before writing, validate returned tenant/record/values and show confirmed feedback only after matching server response. Uncertain saves require a current zones read and explicit reconciliation; no creation is replayed automatically.

Default-driver controls expose only eligible Delivery Driver members, review future automatic-selection impact, recheck membership/default before writing and reconcile uncertain results. Manual task assignment retains its broader eligible-role policy. Township coverage is described as preliminary eligibility, not GPS/distance accuracy. No polygon matching or new persistent zone field was added.

## 12. Team and ownership safeguards

Team access is Owner-only before private queries begin. Invitations review normalized email and a supported non-OWNER role before the external call. Backend identity remains authoritative; email labels are not Auth identity proof. Confirmed feedback distinguishes provider acceptance/membership creation from unverified delivery or activation.

`InvitationRecoveryProvider`, mounted outside the retained membership context, records an attempt before dispatch and preserves uncertainty across route remounts in the current session. Duplicate/conflicting/uncertain addresses cannot be sent again automatically. Successful member-list reconciliation can identify a current matching email label; absence does not prove provider failure and does not authorize resending. Account, tenant, role, signout or revocation scope changes replace recovery memory. No persistent invitation storage or replacement Auth system was added.

Role changes review current/proposed role; ordinary controls exclude OWNER. Removal uses the existing member endpoint and explains historical-record retention. Ownership transfer targets an actual current member through the dedicated endpoint. Confirmed transfer immediately replaces Owner forms with a membership recheck; uncertain transfer pauses administration and requires explicit verified access recovery without replay.

## 13. Tables, Common QR and secrets

Direct table access is Owner/Manager-only before reads. Table creation retains the existing create-and-return-once behavior. Edits now review rename/availability, including deactivation through Save table; a known stale refreshed table blocks overwrite. Rotation reviews the invalidation of old printed codes and historical-record preservation.

Raw Table/Common QR secrets remain ephemeral and appear only in the QR component or explicit share/export operation. Existing fragment semantics, approved guest origin checks, one-time display, focus/background/generation guards, identity/role unmount and temporary export cleanup remain. Ordinary list reads cannot recover an old secret and View QR never causes silent rotation.

A lost/uncertain rotation response blocks blind repeat until current table reconciliation and a new explicit rotation review. A confirmed response after the one-time display was cleared says so honestly; it does not pretend the credential can be retrieved. Native share/export failure retains the existing honest fallback. No real QR was created or rotated.

## 14. Synthetic security/role evidence

Tests and fixtures are disposable in-memory data/transport responses; no production records or provider calls are used. Two distinct synthetic restaurant UUIDs have separate subjects, catalog records, palettes, members, zones and table configurations.

| Requested cases | Fresh local evidence and limits |
|---|---|
| 1–4: Owner/Manager writes, Staff read-only, Driver denial, tenant boundary | Catalog/management/configuration interactions plus `src/api.test.ts`: separate A/B Owner/Manager request paths and subjects; immutable client tenant after fixture changes; foreign settings/member/zone/Common-QR response rejection. Spring permission enforcement is unchanged and was inspected, not re-executed against a live server. |
| 5–9: availability, category, price/stock, groups/links/history | Catalog model and interaction suites exercise reviewed exact amount/stock writes, category/product availability, variant description, required/optional validation, option availability and attach/detach. Frozen synthetic B/history objects remain unchanged; this is client-side evidence, not a new database snapshot-integrity test. |
| 10–14: Featured and media | Existing Featured revision/conflict and Owner-only suites, media permission/type/size/returned-ID/uncertainty/picker-scope suites, plus new safe URL and native preview assertions. |
| 15–17: palette, logo, settings | Runtime branding/provider/editor and new management interactions: revision behavior, Manager logo controls/profile omission, exact supported fields, review before write, retained stale drafts and uncertain read gate. |
| 18–20: geography, legacy/default driver | Selector/model/configuration interactions: parent resets, inactive chain, original-label preservation, active re-enable, current/default preflight, distinct default-driver and manual-assignment rules. |
| 21–24: team/transfer | Owner-only query/control gate, review, duplicate/conflict/forbidden/timeout, remount/absent-list resend block, non-OWNER choices, dedicated transfer/revalidation and immediate Owner-control removal. |
| 25–27: QR safety | Table/QR interactions, validation and export-cache suites cover review, one-time component data, no token text metadata, blur/background cleanup, late result suppression, fragment-safe origin and no blind rotation retry. Historical storage code is unchanged. |
| 28–30: expiry/scope/refresh and UXI-10 regression | Auth/query/mutation scope suites, navigation scope/rearm tests and API token-acquisition revocation test; full Operations order/queue/counter/delivery/COD tests remain passing. |

Backend tests inspected include catalog/image/Featured/settings/zone/table/member services, restaurant authorization and branding/Featured HTTP tests. Maven/database tests were omitted because no Java/API/schema/migration changed, as permitted by this task. This report does not claim fresh server, hosted multi-tenant or database acceptance from frontend mocks.

## 15. Accessibility and localization evidence

Reused scalable semantic `Body`, `FormField`, `Action`, `Status`, `ConfirmDialog` and existing safe-area/keyboard workspace. Labels and long/multiline text wrap. Controls retain at least 48px appropriate targets; shared management Toggle now has a 48px row and tenant-aware label/color. Feedback uses semantic status colors instead of fixed red/green. Reviews use existing modal accessibility semantics/focus return where supplied.

The shared draft guard uses the existing English/Burmese presentation pattern. New unsaved/discard/review notices include Burmese text; fixtures include long Burmese/English names and descriptions and maximum safe amounts. Full Burmese translation/linguistic review is not claimed.

Navigation tests cover multiple dirty registrations, native-hook blocked-action callbacks, local action rearming, nested route prevention attachment, membership checking, signout and A/B/role transitions. Route boundaries attach prevention inside the actual child route as well as the workspace. Tests do not establish Android hardware-back, keyboard, font shaping, TalkBack, focus order or 200% device acceptance.

## 16. Verification outcomes

| Check | Actual result |
|---|---|
| Shared package builds | PASS: shared-types, ui-tokens and api-client through `npm run build:packages`; also included in root typecheck. |
| Root typecheck | PASS across all configured workspaces. Final Operations check rerun after integration. |
| Root ESLint | PASS across scripts and workspaces. Final Operations/preview lint rerun after integration. |
| Root tests | PASS: 1,986 Vitest tests at that snapshot (167 files) plus 45 Node tests. Source changes after that run were rechecked in the final full Operations run below. |
| Final full Operations tests | PASS: 653 Vitest tests in 56 files, plus 6 Node tests. Includes final catalog, management, zones and navigation integration. |
| API-client regressions | PASS within root tests: 243 tests in 16 files. |
| Other root suites | ui-tokens 12; admin 220; Guest 330; Customer 532 Vitest tests; restaurant-config 21, Customer 8 and root scripts 10 Node tests. |
| Focused domain checks | Catalog 55/4 files; management 75/5 files; zones/selector/delivery 48/4 files. These overlap the full Operations count and must not be added to it. |
| Admin production build | PASS. |
| Guest production build | PASS. |
| Ordinary Operations starter | FAIL: pre-existing Firebase Android client/project/package mismatch for `dev.restaurantplatform.starter.operations.staging.dev`. Credentials/app identities were not changed. |
| Isolated Operations Android JS export | PASS: 1,735 modules, 32 assets, 4.9 MB Hermes bundle `index-d7979462f187bf91cce3024a92f395fa.hbc`. Disposable starter fixture only, no native prebuild or signing. |
| Static TSX previews | PASS: 160 UXI-11 fixtures; UXI-10 168-fixture regression generation also checked. |
| Browser/native visual acceptance | BLOCKED / NOT RUN as described below. |
| Whitespace/scope checks | `git diff --check` PASS; no backend/schema/identity/Guest/Customer implementation edits. |

Logs are generated under ignored `target/uxi-11-root-test.log`, `target/uxi-11-operations-test.log`, `target/uxi-11-root-typecheck.log` and `target/uxi-11-root-lint.log`. Initial typechecks during parallel editing exposed incomplete intermediate code; the integrated checks above supersede them. Tests were not weakened to obtain a pass; existing harnesses were adapted to the new context hook and profile review while retaining their assertions.

The isolated export sets `EXPO_NO_DOTENV=1`, disables phone/notifications and removes Firebase paths/project only from its disposable child-process environment. It uses the existing starter wrapper. No checked-in or private provider configuration is changed, and it does not close the ordinary Firebase acceptance gate.

## 17. Preview artifacts and visual limitations

`node scripts/operations-preview.cjs --catalog` generates ignored `target/uxi-11-preview/index.html` and 160 actual-TSX DOM approximations for synthetic A/B, red/teal, four roles, 320/720px and 100/200% text. It covers menu, settings, team, tables and zone summaries, including forbidden states. API/auth/upload/storage/share/QR provider ports are mocked or blocked. `node scripts/operations-preview.cjs` retains the prior 168 UXI-10 fixtures.

Rendered UXI-11 browser screenshots: **BLOCKED**. The selected browser could read the existing UXI-10 preview at port 4179, but navigation to the task's separate loopback port 4181 timed out (`ERR_CONNECTION_TIMED_OUT`); a shell localhost probe also timed out despite the preview process reporting it had started. The task-owned server was stopped. No UXI-11 screenshot or pixel-accuracy approval is claimed.

SSR controls do not execute interactions. Product/variant/group/zone expanded editors, review dialogs and default-driver expansion are tested through component interactions; they are not visually accepted by the closed SSR specimens. Native rendering, keyboard/safe-area behavior, device image picker, share/print/export and TalkBack remain **NOT RUN**. Figma screenshots are design references, not screenshots of this implementation.

## 18. Existing hosted/native/Firebase acceptance gates

- Resolve the existing ordinary starter Firebase project/client/package mismatch through the operator's reviewed provider workflow.
- Hosted API/schema/migration parity, actual JWT principals, Auth/Storage, geography provenance and legacy data review remain release gates from accepted milestones.
- Approved full-resolution logo/food provenance, exact production UUID mapping and publication authorization remain pending.
- Device installation, native accessibility, real keyboard/image picker/share, provider delivery and signed-release acceptance are not established by JS export or mocks.
- No production price, setting, zone, invitation, ownership or QR credential was changed.

## 19. UXI-12 prerequisites and stop boundary

Review the UXI-11 diff and close applicable visual/native/hosted release gates with authorized operators. A separately authorized UXI-12 task may then inspect the existing finance contracts and its own Figma scope. This task makes no financial screen, accounting engine, provider payment or reporting-schema change and does not start UXI-12.

## 20. Remaining Figma/backend-contract gaps

- Catalog, profile/settings, table, zone and default-driver writes lack the revision contract available to palette/Featured. Retained drafts, observed stale checks and zone/default preflights protect known changes; they cannot provide atomic compare-and-set between read and write. No competing revision schema/API was invented.
- `RestaurantMemberService` makes an external invitation call before profile/membership persistence. `RestaurantMemberResponse` has no provider delivery, activation, outstanding-invitation or orphan-attempt recovery status. Absent membership cannot establish a failed invitation. Same-address uncertainty therefore stays blocked for the current session and needs the existing verified-account/operator support flow.
- Table/Common QR APIs do not return old raw credentials. Cleared/lost one-time results require an intentional reviewed replacement; a design View QR label cannot authorize silent rotation.
- Persistent crop/alt text, computed popularity, production media mapping, phone onboarding beyond verified supported flows and full native accessibility remain deferred/gated.
- Stale Figma sample wording and design coverage labels do not override accepted functionality or establish visual/native completion.

Stop after UXI-11. No commit, push, merge or deployment was made.
