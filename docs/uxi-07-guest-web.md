# UXI-07 — Guest Web UX-01 and runtime branding

Date: 20 November 2026 (Asia/Bangkok). Scope: Guest Web presentation and consumption of accepted public contracts only. **UXI-08 was not started.**

## Baseline and preserved dependencies

- Branch: `uxi/07-guest-web`.
- HEAD: `565d0ffdb79f4569937ccfe0f6824010c304cfdc` (accepted UXI-06, PR #46).
- Initial staged and unstaged tracked diffs were empty. Existing untracked `.postman/` and `postman/` were preserved.
- History and source confirm accepted UXI-01 semantic tokens, UXI-02 canonical branding API/client, UXI-03 Operations theme provider/editor, UXI-04 guarded bootstrap, UXI-05 Featured/media contracts and UXI-06 immutable native identity/runtime boundary. Historical roadmap descriptions of unfinished predecessors were not used as current source truth.
- The eight requested baseline/decision/amendment/roadmap/implementation documents were read completely across the implementation team. Existing M5/M6 Guest security documentation, public branding/menu DTOs, BFF, deployment configuration and regression suites were inspected.
- No branch switch, reset, stash, staging, commit, push, merge, deployment, migration, production record/media/order/payment operation or Figma edit was performed.

## KEEP / ADAPT / ADD assessment, recorded before implementation

| Decision | Scope |
| --- | --- |
| KEEP | Trusted host/slug tenant resolver; canonical public API parsers and no-store transport; UXI-01 semantic tokens; product/variant/modifier/stock validator; private QR/session lifecycle; checkout controller, immutable attempted body/idempotency key, recovery and queue tracking. |
| ADAPT | SSR shell/metadata/landing branding; mobile/desktop menu and product layout; cart estimates/review, receipts and safeguard presentation; English/Burmese feedback. |
| ADD | Request-scoped runtime branding adapter; tenant-local search and actual-category filtering; visible backend-selected Featured labels; stable media failure slots; pricing presentation helper; focused synthetic tests and expanded production HTTP smoke. |

The existing ordering state machines were retained. There is no new endpoint, schema, persistence, checkout route, sales-ranking algorithm, native release identity or offline-cart feature.

## Current Figma inspection and application

Read-only inspection used the actual current [Restaurant Platform file](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform). Current design context and screenshots were obtained for:

| References | Pattern applied or preserved |
| --- | --- |
| G01 `13:116`, G05 `13:228`, G06 `36:45` | Restaurant identity, compact food rows, responsive menu/cart arrangement, browse-first landing and clear QR guidance. |
| G02 `13:153` | Conditional configured choices, required/optional modifiers, actual option amounts, selection total and prominent Add action. |
| G03 `13:179`, G14 `42:97` | Cart choice summaries, quantity/removal, estimate, explicit review and counter-payment distinction. |
| G04 `13:204`, G08 `36:100`, G09 `36:125`, G10 `36:146` | Original server receipt/queue/table identity, current status, session-bounded addition feedback and collection/payment distinction. |
| G07 `36:72`, G13 `36:203`, G16 `71:143` | Common QR takeaway context and readable English/Burmese narrow layouts. |
| G11 `36:169`, G12 `36:187`, G17 `71:160` | Existing safe Customer callback states inspected; authentication and supported destinations preserved. |
| G15 `71:122`, G18 `71:179`, G19 `101:123` | Media slots, semantic no-photo fallback, runtime identity and Owner-curated Featured; preview originals never extracted. |
| `16:3`, `16:15`, `16:27`, `40:1641`, `40:1664`, `40:1679`, `50:700` | Invalid QR, uncertain confirmation, offline, loading, no results, unavailable tenant and access-denied safeguards. |
| Brand Kit `88:118`; Audit `27:2` | Tenant-only red, distinct semantic states, runtime/native separation and limits of visual completion labels. The full audit-page design-context request exceeded its supported scope; metadata plus current child contexts/screenshots `27:217` and `27:425` supplied the relevant evidence. |

Current G02 and several editorial/media/session notes already reflect amendments absent from the historical D0 checklist. Current inspected design and accepted product policy govern this implementation. Figma sample foods, categories, prices, table/queue values, device chrome and preview bitmaps are not application data or assets.

## Layout, localization and accessibility

- Neutral platform defaults remain unchanged; each `.guest-site` receives independent semantic theme variables. San Thaw Tar red `#A51D22` exists only in tenant-provided values and synthetic fixtures.
- Content-sized mobile rows use stable photo slots; tablet menus use two columns, with a desktop cart rail at 1000px. Product images use a 4:3 slot. Descriptions, prices and Burmese text wrap without line-clamping or fixed card heights.
- Search is a labelled local form with current-tenant name/description/category/variant matching. Unicode normalization preserves Burmese marks. Category controls use actual DTO UUIDs and pressed states. Counts and empty results update politely; clear/reset restores input focus.
- Counts and whole-currency labels use deterministic English/Burmese digit grouping and explicit ISO currency codes. Browser QA exposed differing Node/browser Burmese ICU output and a React text-hydration error; formatting no longer depends on ICU locale support. The actual values, currency and server pricing authority are unchanged.
- Product options retain native labels, fieldsets/legends, configured limits, unavailable choices, notes and quantities. Modifier controls reference their rule text. Invalid selection guidance is a polite live status; existing validation disables Add.
- The menu cart link is fixed near the mobile viewport bottom. Product pages suppress that redundant link so it cannot cover the sticky Add summary; the inline Added-to-cart link and actual cart remain available.
- Focus outlines, skip link, keyboard-accessible cart rail, 48px touch targets, reduced-motion and forced-color support are retained. All added interface copy has English/Burmese entries. System Arial/Myanmar Text/Padauk fallbacks are used; no unverified font asset is represented as bundled Inter/Padauk.

## Runtime branding and tenant checks

`loadGuestBranding()` runs only after `resolveGuestTenantContext()`. It calls the existing public client's `getBranding()` for that resolved UUID. The canonical parser checks the returned UUID, public fields, safe logo and palette; the Guest adapter rejects a missing/corrupt persisted palette at revision greater than zero, and inconsistent revision-zero/non-null palette responses.

The fetch omits credentials/referrers, rejects redirects and uses `cache: no-store`. React request memoization is keyed by restaurant UUID and API origin, sharing one read across metadata/layout/page in an SSR request without retaining tenant data across requests. Browser refresh loads current name/logo/palette without redeployment or client polling. The resolved presentation is passed consistently into SSR shell/metadata/landing; hydration receives the same result.

Revision zero with a null palette remains `source: uninitialized`, retaining valid current server name/logo and using that restaurant's reviewed fallback colors. Failed/invalid reads remain `source: fallback`, revision null, using only that same resolved tenant's registry fallback. No foreign snapshot or mutable global cache is retained. Provenance is internal, with no claim that fallback colors are a persisted initialization.

A valid canonical null logo removes stale registry artwork. Canonical `?v=<UUID>` upload cachebusters are preserved separately from the stricter product URL policy; failed logo loads render a monogram beside the restaurant name. Native icons, signing, packages, origins and release assets were not changed.

## Featured, media, prices and configured choices

- Featured is shown only for `AVAILABLE` metadata whose exact product UUID is present and available in the current visible category/search result. NONE, absent legacy metadata, UNAVAILABLE, foreign/invalid association or hidden-by-filter products never cause another product to be promoted. Guest remains read-only.
- Product and variant images use only validated HTTPS backend URLs, lazy browser fetches where appropriate, async decoding and `no-referrer`. Missing/unsafe URLs and failed loads use a stable semantic fallback. A subsequent safe source can load after a previous failure.
- Browser QA also exposed images failing before hydration attached their error handlers. Product/logo refs now detect a completed zero-width failed resource, with regression tests covering completed failure, pending/successful load and source recovery.
- No Figma bitmap, candidate original or generated food image was added. The six actual San Thaw Tar photos appear only if the approved backend publication supplies them; this task did not upload or verify production publication.
- Base/available variant prices and currency come from the current menu DTO. Variant labels distinguish selected-variant pricing. Missing backend currency retains existing plain-number formatting without inventing a currency.
- `selectionEstimate()` reuses `validateCartSelection()` and matches Spring's `(base or selected variant + sum(additional price × option quantity)) × line quantity`, with safe-integer overflow checks. These are labelled estimates; validated server receipt totals/currency are final.
- No variants or modifier groups are fabricated. Required/minimum/maximum, option availability, stock aggregation, quantities and notes retain existing validation. A refreshed invalid/missing/unavailable selection blocks fresh review; uncertain-order recovery remains available independently of the latest menu.
- Read-only variant/modifier reference information is retained in an optional disclosure, including descriptions and unavailable prices; the actual configured form is the primary interaction.

## Cart, checkout, receipts and security evidence

Cart lines show chosen variant/modifier quantities, notes, real-menu estimates, quantity editing and removal. Fresh checkout requires explicit embedded review; cart or current amount changes invalidate that review. Existing duplicate-submit locking and server idempotency remain in the unchanged controller. An uncertain result uses the original exact retry/recovery action without creating a new attempt or imposing new review on that immutable request.

Existing controller tests explicitly cover a lost response, simultaneous clicks, identical retry key/body, recovery after reload with the original scan despite QR rotation, configuration failure during recovery and the bounded retention window. Production HTTP smoke exercises the actual Next BFF against synthetic Spring contracts, including a simulated response loss and one preserved order on replay.

Table QR and Common QR remain distinct. The former displays the verified table association; the latter retains the original daily queue/receipt/status and tracking behavior. Server order numbers/statuses/totals are never replaced by design examples. Confirmation is clearly separate from counter payment: because the public receipt lacks subsequent payment status, the UI does not claim later payment has or has not been recorded.

QR fragment capture/cleanup, private session capability handling, queue tokens, original attempted request persistence, origin/HTTPS/redirect/cookie protections, bounded BFF action allowlist and callback destination/auth protections are unchanged. No capabilities are added to HTML, product attributes, analytics or diagnostics. Tests verify token absence in rendered HTML/logs and the original transport restrictions. Ordinary carts remain memory/session bounded; durable unsent/offline drafts and restored tracking secrets are not promised.

## Verification

| Check | Actual result |
| --- | --- |
| Shared package builds | **PASS**, including shared types, semantic tokens, API client and applicable registry build, in aggregate verification. |
| Full-workspace TypeScript and ESLint | **PASS** in the second aggregate. |
| Aggregate test stage | **PASS:** 1,680 Vitest tests across 144 files, plus 45 Node tests; zero failures/skips. This includes API client 243, Guest 308, Admin 220, Operations 457, Customer 440 and tokens 12. |
| Final complete Guest suite after browser-discovered fixes | **PASS:** 330 tests across 30 files, zero failures/skips. Existing assertions were retained. |
| Final Guest TypeScript and ESLint | **PASS** after deterministic formatting and pre-hydration image fixes. |
| Admin production build | **PASS** in the aggregate. |
| Final Guest production build | **PASS**, after both browser-discovered fixes, including Next's type/lint/static generation stages. |
| Final built-app HTTP smoke | **PASS:** 133 grouped checks, four disposable synthetic orders, ten correctly denied streamed not-found responses. Temporary A/B registries and loopback servers were cleaned up. No real orders were created. |
| Branding transport/identity/freshness | **PASS:** exact resolved UUID, no-store/omit credentials/no redirects, one request-scoped read, refresh/profile changes, revision-zero and unavailable/foreign/corrupt same-tenant fallback. |
| Featured, search, media and legacy parsing | **PASS:** current backend designation only, filtering/no-results/clear/focus, A/B independent prices, safe and failed-image fallback, old menu fixtures. |
| Options, cart and availability | **PASS:** required/optional choices, min/max and unavailable options, quantity/stock aggregation, refreshed invalid selections, exact estimates, explicit review and review invalidation. |
| Table/Common QR and recovery | **PASS:** unchanged controller/BFF/fragment suites and production smoke; distinct contexts, duplicate-submit prevention, immutable body/key after simulated lost response, original scan recovery and original queue/order identifiers/status. |
| Privacy/security | **PASS:** unknown/mismatched hosts fail closed; no foreign catalog/theme fallback, rendered capabilities or unsafe public request headers/redirects; existing cookie/origin/queue/callback assertions retained. |
| Localization/accessibility/contrast | **PASS** for bilingual dictionaries, deterministic digits, semantic tokens/contrasting tenant fixtures, field associations/live feedback and keyboard focus tests; browser AX/Tab/clear-search checks also performed. This is not installed screen-reader certification. |
| Browser visual/reflow checks | **PASS within the scope below:** actual built app, 320px Burmese menu, 390px product, 768px contrasting tenant menu, 1440px menu/landing. No page-wide horizontal overflow was observed. |
| 200% text zoom, installed screen reader and physical-device acceptance | **NOT RUN**; direct narrow-viewport/keyboard/AX checks do not substitute for these. |
| Normal `npm run verify:frontend` | **FAIL**, exit 1, only at the known Operations starter export Firebase client/project/package mismatch after all second-run tests/type/lint/web stages passed. Expected package: `dev.restaurantplatform.starter.operations.staging.dev`. No provider credential or application ID was modified to force success. |
| Normal Customer starter export | **SKIPPED:** not reached after that Operations failure. No native work was required by UXI-07. |
| Backend Maven/database tests | **SKIPPED by scope:** no backend source, API contract or schema changes. |
| Hosted schema/API/media, live orders/payments and release/device validation | **NOT RUN**; production publication/provider/release readiness remains **BLOCKED** on its independent external gates. |
| Final Git/whitespace/scope checks | **PASS:** branch/HEAD unchanged, staged diff empty, no out-of-scope source changes or leftover synthetic registry fixtures; preserved user Postman directories. |

The first sandboxed aggregate failed the API client's existing real-loopback HTTP test (`ApiNetworkError`, 242/243 API tests); subsequent web/native stages were not reached. The second aggregate with loopback access passed all 243 API tests and every frontend test stage, then reached the separate known Firebase failure. No assertion was weakened or skipped to obtain a pass. Later changes affected Guest presentation/formatting only, so its complete 330-test suite, type/lint, production build, HTTP smoke and browser checks were rerun rather than repeating unrelated native work.

Ignored execution evidence: `target/uxi-07-frontend-verification.log` (initial sandbox), `target/uxi-07-frontend-final.log` (full aggregate), `target/uxi-07-guest-complete.log`, `target/uxi-07-guest-build-complete.log`, `target/uxi-07-production-smoke-complete.log`. Earlier intermediate Guest/smoke logs also remain under `target/`. These are local evidence, not production or committed artifacts.

### Browser evidence and acceptance limits

Actual Figma screenshots were used as pattern references while inspecting the built app; **pixel-perfect or complete Figma acceptance is not claimed**. Local synthetic previews contain fictional UUIDs/catalog/amounts and unavailable example media URLs, allowing honest media failure states without publishing food assets.

Local JPEG evidence in `target/uxi-07-visual/`:

- `a-desktop-1440.jpg` — red runtime brand, menu/search/Featured and desktop order rail.
- `a-landing-1440.jpg` — current server identity, browse guidance and conditional restaurant pick.
- `a-burmese-320.jpg` and `a-burmese-320-viewport.jpg` — narrow Burmese wrapping, Myanmar digits and visible keyboard focus.
- `a-product-390.jpg` — product/required choices with honest browse-only disabled ordering before QR validation.
- `b-tablet-768.jpg` — independent blue brand/catalog, no fabricated Featured selection.
- `a-no-results-320.jpg` — empty-search recovery captured during the initial browser pass; English presentation is unchanged by the later deterministic-number fix.

Browser measurements included `scrollWidth <= innerWidth` at 320, 390, 768 and 1440px. Clear-search returned focus to `menu-search`; Tab moved to the category control with a visible outline. The final Burmese reload displayed `၁` and `MMK ၃,၀၀၀`, with no console warnings/errors or text-hydration failure. Settled failed media produced no broken images and showed the named fallback/monogram.

Screenshot coverage is browsing/product presentation. Full QR-to-cart/checkout/receipt interaction was verified with component/controller/HTTP tests, not a physical QR scan or complete browser screenshot journey. Published real-media success paths, all menu-density/text-zoom combinations, final typeface/artwork approval and every requested receipt/safeguard visual remain part of later complete design/device acceptance. Browser viewport overrides and disposable tabs were reset/closed.

## Known limits and next dependencies

Hosted branding/Featured migration rollout, deployed API behavior, production photo publication and release-provider/domain/artwork approval remain external gates. No hosted claim follows from synthetic tests or bootstrap manifest approval. Backend Maven tests are omitted because no backend code, API contract or schema was changed.

Full final Figma/device acceptance remains pending. Callbacks were inspected and preserved, rather than expanded into new auth flows. No persisted crop/alt metadata, fake opening hours, computed bestseller, new payment behavior or unsupported cart retention was introduced.

UXI-08 is a separate Customer-app milestone requiring its own authorization and current runtime-branding/catalog dependencies. Customer native/device accessibility, original-media UUID mapping/publication, hosted schema/API rollout and remaining complete visual sign-off are dependencies, not work started here.

## Exact changed files

32 UXI-07 files, excluding preserved user Postman files and ignored generated output:

```text
apps/guest-web/scripts/smoke-production.mjs
apps/guest-web/src/app/(restaurant)/layout.tsx
apps/guest-web/src/app/globals.css
apps/guest-web/src/app/layout.tsx
apps/guest-web/src/app/not-found.tsx
apps/guest-web/src/app/r/[slug]/layout.tsx
apps/guest-web/src/components/GuestFoundations.test.tsx
apps/guest-web/src/components/GuestLayouts.test.tsx
apps/guest-web/src/components/GuestLogo.test.tsx
apps/guest-web/src/components/GuestLogo.tsx
apps/guest-web/src/components/GuestOrdering.interaction.test.tsx
apps/guest-web/src/components/GuestOrdering.tsx
apps/guest-web/src/components/GuestPage.tsx
apps/guest-web/src/components/GuestShell.tsx
apps/guest-web/src/components/MenuContent.test.tsx
apps/guest-web/src/components/MenuContent.tsx
apps/guest-web/src/components/ProductConfigurator.tsx
apps/guest-web/src/components/ProductMedia.test.tsx
apps/guest-web/src/components/ProductMedia.tsx
apps/guest-web/src/components/TenantFrame.tsx
apps/guest-web/src/lib/branding-server.test.ts
apps/guest-web/src/lib/branding-server.ts
apps/guest-web/src/lib/guest-format.test.ts
apps/guest-web/src/lib/guest-format.ts
apps/guest-web/src/lib/guest-pricing.test.ts
apps/guest-web/src/lib/guest-pricing.ts
apps/guest-web/src/lib/i18n.ts
apps/guest-web/src/lib/menu-presentation.test.ts
apps/guest-web/src/lib/menu-presentation.ts
apps/guest-web/src/lib/menu.ts
apps/guest-web/src/lib/ordering-i18n.ts
docs/uxi-07-guest-web.md
```
