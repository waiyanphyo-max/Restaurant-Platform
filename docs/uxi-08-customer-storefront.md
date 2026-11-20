# UXI-08 — Customer Android storefront, cart and account

Implemented and verified locally on 20 November 2026 (Asia/Bangkok). Scope ends at UXI-08. This is implementation evidence, not final Figma or native release acceptance.

## Baseline and assessment

- Branch: `uxi/08-customer-storefront`.
- HEAD: `155d5434d9f3967723fb117f53ff68e9743d8f99` — `uxi-07: Guest Web Figma UX-01 Redesign and Backend-Authoritative Tenant Branding (#47)`. UXI-07 is the current baseline, with UXI-01–06 in its ancestry.
- Initial staged and unstaged tracked diffs were empty. The seven pre-existing untracked files under `.postman/` and `postman/` were preserved. They were not used as fixtures or edited.
- No branch switch, reset, stash, staging, commit, push, merge or deployment was performed.

The complete baseline, product decisions, D0 amendments, v2 roadmap, UXI-05, UXI-06 and UXI-07 documents were read, alongside current Customer architecture/auth/profile/checkout/API documentation and implementation. Current source takes precedence over historical route/geography descriptions.

| Disposition | Decision before implementation |
| --- | --- |
| KEEP | Embedded tenant/environment/origin/native identity, RuntimeBrandingProvider, Supabase adapters, account ownership, validated session-memory cart, address/geography, quote/order/payment/idempotency and recovery contracts. |
| ADAPT | Existing Home/Menu/Product/Cart/Account routes, navigation, typography, food-card hierarchy, account/auth feedback, language and notification capability presentation. |
| ADD | Shared scoped menu query, safe native photo slots, backend-only Featured eligibility, Unicode search/filter recovery, explicit unavailable selection feedback, safe whole-currency estimates, sign-out review and focused regressions. |

## Original Figma inspection

Read-only inspection used the original [Restaurant Platform file](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform). No Figma content was changed.

High-fidelity design contexts and returned screenshots were inspected for:

| Reference | Node IDs |
| --- | --- |
| C01 Home/menu; C02 Product; C03 Cart | `14:3`, `14:39`, `14:60` |
| C12 History and C24 deep-link recovery, compatibility only | `38:532`, `38:979` |
| C14–C19 Account/email/signup/confirmation/conditional phone/reset | `38:629`, `38:679`, `38:702`, `38:725`, `38:743`, `38:767` |
| C28 Sign-out | `42:1011` |
| C29 image-first; C31 notification reference; C32 accessibility; C33 media/unavailability; C34 food gallery | `72:897`, `72:937`, `72:958`, `72:978`, `101:1078` |
| Brand Kit | `88:118` |
| S08 session expired; S12 session loading; S13 empty cart; S15 unavailable cart; S36 offline | `20:30`, `40:1694`, `40:1713`, `40:1812`, `50:715` |

Audit Coverage `27:2` was inspected as page metadata; the design-context request for this page returned a selection error. Its Customer inventory is a coverage reference, not an implemented screen.

Rounded semantic surfaces, clear heading/body hierarchy, food media slots, labeled five-destination navigation, configured-choice feedback and separate estimate/fee disclosures informed the native implementation. Historical “Best seller” sample text was not adopted. San Thaw Tar colors, products, identities, prices, photos and locations were not copied as production defaults.

Six generic icon components (`28:13`, `28:16`, `28:19`, `28:22`, `28:25`, `28:52`) were exported as PNG UI assets. Each is non-empty and renders in a 24 × 24 slot with semantic tint. Food fills and restaurant logos were not extracted. Provenance is recorded beside the assets.

## Screen behavior

### Shared navigation and Home/Menu

The existing Expo Router shell retains Home, Menu, Cart, Orders and `/profile`, presented as Account. It shows the current runtime restaurant name and failure-safe logo, localized accessible tab labels, selected state and current cart quantity. Product detail stays associated with Menu; existing `/order/` detail stays associated with Orders. Address/notification routes stay associated with Account.

The checkout review indicator remains outside the routed content for `uncertain`, `created`, `recovery_pending` and `unrecorded`; ordinary cart edits and empty carts cannot hide it. The existing provider nesting and authenticated-user key remain in place. The shell adds keyboard avoidance, uses safe areas, wraps long names and allows navigation to scroll horizontally at larger text sizes.

Home welcomes the customer using runtime identity, shows the default saved delivery address with Home fallback, links through existing address management, and offers the existing Menu route. It presents backend Featured only when eligible, followed by a bounded six-item menu preview.

Home, Menu, Product and Cart share one `CustomerMenuProvider` query, scoped by embedded UUID, environment, API origin and the existing authenticated query owner. Navigation no longer fetches the same menu separately for each of those screens. No global menu cache or lifecycle listener was introduced. Pull-to-refresh reloads the menu; Home/Menu also invoke the existing branding refresh. Ready menu data stays mounted during a pending refresh so product choices can be revalidated when fresh data arrives. Failed queries show explicit offline/error/retry states; no persistent/offline catalog is promised.

Menu uses a virtualized SectionList, real category/product UUIDs, available variant price ranges, sold-out/unavailable feedback, Unicode NFKC/case/whitespace normalization retaining Myanmar combining marks, multi-term name/category/variant search and clear-search recovery. A vanished category resets to All Categories. At larger text sizes the extra Cart action scrolls with the list, leaving the existing bottom Cart tab accessible.

### Featured and photos

Only `featuredProduct.status === AVAILABLE` with a matching currently eligible product is promoted. `NONE`, `UNAVAILABLE`, absent legacy metadata, a missing UUID, sold-out stock or unavailable required choices do not produce an alternative Featured item. Search/category filters also constrain the Featured presentation.

FoodMedia accepts backend public HTTPS image URLs under the existing no-credentials/query/fragment media contract, rejecting active/local schemes, raw control/whitespace/backslash coercion and excessive URL length. It supports loading, no-image and failed-image slots. URL-keyed slots recover when a safe URL changes and isolate late callbacks from the previous image. Product detail prefers selected-variant media, with product media when no variant image is supplied. Names, price and availability remain outside the image slot. Runtime logos continue to come from the validated branding/build provider, with a failure-safe presentation wrapper.

No food originals were published, candidate manifest approval was not treated as publication, and no crop/alt storage was added.

### Product and Cart

Product retains `prepareCartLine`, stock aggregation and all existing line, quantity, modifier-count, modifier-quantity and instruction limits. It shows real variant prices/descriptions, required/optional groups, configured min/max and selected counts, disabled unavailable options, quantity, kitchen instructions and selected-item estimate. Add/Save remains disabled for invalid choices. A selected variant or option that disappears becomes an explicit review state; the customer chooses a replacement or explicitly removes unavailable options. No variant or required option is silently substituted. Valid additions/edits use the existing cart operation and return to Cart.

Cart shows product/variant/modifier quantities, kitchen notes, line quantities, current-menu estimates when available, Edit/Remove, subtotal, Menu and Checkout. New checkout entry performs a fresh tenant-bound menu read and validates the original selection IDs and shared product stock. Unavailable choices require editing/removal. Concurrent clicks are bounded; unmount, changed cart lines and a newer refresh suppress obsolete responses. A deferred-response regression verifies refresh aborts an older checkout-entry read. Pending receipt recovery opens the existing checkout route independently of catalog validation.

Whole-currency values require nonnegative safe integers. Modifier intermediate arithmetic, line totals and aggregate subtotal reject overflow; mixed-currency previews are rejected. Missing server currency renders an amount without inventing a currency. The price-range calculation avoids argument spreading. The server quote remains authority for actual prices, delivery eligibility and fees; no Figma fee/total is hardcoded.

The cart remains account-bound memory only. It is not promised to survive restart/logout. No second cart provider or persistence system was introduced.

### Account and authentication

Account presents identity/contact details, language summary and selected language controls, existing saved-address summaries/actions, order history, notification history and capability-gated native notification permission/cleanup. Contact phone remains separate from verified sign-in identity. Sign-out now uses the existing accessible ConfirmDialog, including account-loading/error cases, before calling the original logout operation.

Auth forms use semantic typography/colors, explicit flow headings and feedback, with English/Burmese confirmation/error/recovery copy. Conditional verified-phone and reset flows retain their original capability gates and adapters. No fake OTP verification, new session restoration/refresh logic, notification preference endpoint or persisted preference toggle was added. C31 category preferences remain a documented design dependency.

## Tenant, session and UXI-09 boundaries

`readEmbeddedTenant`, fixed API factories, RuntimeBrandingProvider and its controller are unchanged. Branding UUID/revision validation, same-scope fallback, abort/generation guards and bounded foreground refresh remain authoritative. User/route/deep-link/API data cannot reselect the installed tenant or mutate native identity. Synthetic A/B tests exercise separate names, origins, palettes and products; wrong-tenant branding/menu responses are rejected.

AuthProvider, AccountProvider and CartProvider implementations are unchanged. Existing account-keyed remounts, query ownership checks, notification cleanup and storage/logout barriers continue to dispose of account data. New menu state lives under that same account boundary.

CheckoutProvider, delivery quote/order APIs, durable attempt/key/recovery handling, geography/address validation, history/tracking/cancel/reorder and COD/payment/accounting implementation are unchanged. Existing regressions verify original idempotency/recovery behavior and route reachability. Cart revalidation is a presentation entry check, not a replacement order state machine. No second order or paid state is inferred from successful checkout.

## Localization, accessibility and visual evidence

New interface copy uses the existing English/Burmese localization approach. Existing UXI-01 native controls retain at least 48px targets, semantic selected/disabled states, scaling, field labels/hints, live error/loading regions and dialog focus restoration. New shell targets and the checkout banner have minimum 48px targets. Food titles/descriptions/options have natural height. Currency tests include Burmese digits. System fonts are used; licensed Inter/Padauk assets are not bundled or claimed.

`node scripts/customer-preview.cjs` generates 40 static DOM approximations from the actual screen/shell TSX with synthetic providers: five screens × two tenants × 360/720px widths × 100/200% text. It loads no live auth/API/native data. Controls are static and media fixtures use actual no-image fallbacks; component tests cover loading/failure/recovery separately. The adapter is a layout aid, not React Native Web or an Android renderer.

Actual browser inspection compared the Figma hierarchy with A/Home 360/100%, B/Menu 360/200%, A/Product 360/100%, B/Cart 360/200% and A/Account 720/100%. Wrapped text, semantic palette differences, fallback media, disabled choices and persistent recovery/navigation were visible. The large-text Menu Cart action was moved into scrolling content after this inspection. Approximate browser button styling, font metrics, keyboard and safe-area geometry differ from Android. Final Figma acceptance is **not claimed**.

Local generated evidence (ignored `target/`, reproducible by the script):

- [Preview index](../target/uxi-08-preview/index.html).
- [A Home screenshot, 360px/100%](../target/uxi-08-preview/screenshots/a-home-360-100.jpg).
- [B Menu screenshot, 360px/200%](../target/uxi-08-preview/screenshots/b-menu-360-200.jpg).

Android SDK tools exist, but ADB reports no connected devices and no configured AVD is available. Real Android text scaling, keyboard, TalkBack, font shaping, image network rendering and release behavior remain **BLOCKED for acceptance** pending a device/emulator.

## Synthetic regression matrix

| Case | Evidence / result |
| --- | --- |
| Embedded identity/API origin; independent A/B catalogs; foreign menu/branding rejection | `api.test.ts`, existing tenant/branding runtime suites — PASS |
| Branding success, safe same-tenant fallback, generation/scope changes | Existing branding/runtime/provider tests — PASS |
| Featured AVAILABLE/NONE/UNAVAILABLE/legacy/foreign/ineligible | `presentation.test.ts` — PASS |
| English/Burmese search, multi-term/variant search, disappearing category, no-results recovery | Presentation and Storefront tests — PASS |
| Native image loading, failure, missing URL, changed URL/late callbacks; logo failure | `FoodMedia.test.tsx` — PASS |
| Sold-out stock/variants; required/optional/min/max; unavailable selected choices | Existing cart/Storefront plus `ProductScreen.test.tsx` — PASS |
| Invalid additions, validated edit/remove, modifier quantities and limits | Existing cart tests plus `CartProvider.test.tsx` — PASS |
| Safe whole-currency arithmetic, missing currency and subtotal/overflow | Cart and presentation tests — PASS |
| Fresh-menu unavailable recovery, duplicate clicks, late/aborted refresh response | Storefront cart-entry tests — PASS |
| Session-memory cart and checkout independence | Existing provider/navigation/checkout suites and source inspection — PASS; restart durability not claimed |
| Sign-in/loading/expired sessions, signup/phone/reset gating, confirmation | Existing auth plus new focused assertions — PASS |
| Profile/language, sign-out review/cancel/confirm, identity disposal | Profile/Account/Auth session tests — PASS |
| Notification availability/cleanup; existing address/history/checkout routes and receipt indicator | Notification, Profile and navigation suites — PASS |
| Original checkout keys, lost-response/recovery/idempotency | Unchanged existing checkout suites — PASS |
| Red and contrasting non-red palettes; text scaling/long labels | Existing semantic-token contrast tests PASS; DOM inspection only for rendered layouts |

## Actual verification outcomes

Fresh executions are reported below; historical totals are not reused.

| Check | Outcome |
| --- | --- |
| Shared package builds | PASS |
| Customer Android TypeScript | PASS |
| Customer Android ESLint | PASS |
| Full Customer Node + Vitest | PASS — 8 Node + 481 Vitest, 40 Vitest files |
| API-client | PASS — 243 tests; typecheck/ESLint PASS |
| Restaurant registry | PASS — 21 tests; typecheck/ESLint PASS |
| UI tokens | PASS — 12 tests; typecheck/ESLint PASS |
| Root script tests and lint | PASS — 10 tests; ESLint PASS |
| Admin web tests/build | PASS — 220 tests; production build PASS |
| Guest web tests/build | PASS — 330 tests; production build PASS |
| Operations regressions | PASS — 6 Node + 457 Vitest |
| Root typecheck/lint/test aggregate | PASS — `npm run typecheck`, `npm run lint`, allowed `npm test`: 1,743 Vitest across 150 files + 45 Node; zero failures/skips |
| Explicitly isolated Customer Android JavaScript export | PASS — 1,394 modules, 32 assets, 3.8 MB Hermes bundle; no native prebuild or signed build |
| Actual-TSX synthetic DOM preview generation + harness ESLint | PASS — 40 pages generated |
| Git whitespace / staged-change preservation | PASS |

The export set `EXPO_NO_DOTENV=1`, disabled Customer notification/phone feature inputs and cleared Maps/Firebase input paths in process environment only. The existing starter wrapper fixed `RESTAURANT_SLUG=starter-fixture`, `MOBILE_ENV=development` and the approved development API. No private provider file or application identity configuration was changed. Final bundle: `index-8b27b6d0166b2a9b56189444b47d0b54.hbc`.

**FAIL:** Initial sandbox API-client/root loopback fixtures failed with ApiNetworkError; allowed reruns passed, including the complete root test command. An initial sandbox Admin build hit EPERM writing generated `.next` output; the allowed rerun passed. Interim implementation TypeScript errors were corrected, including SectionList footer optionality. No final required code check remains failing.

**BLOCKED:** Device/emulator/TalkBack/native acceptance; live push/phone/email-provider delivery acceptance; production media/hosted tenant data and final Figma review lack acceptance evidence.

**SKIPPED:** Destructive Expo prebuild, signed APK/AAB/cloud EAS, hosted migration/media/catalog/branding changes and deployment, under this milestone's explicit boundaries.

**NOT RUN:** Backend/Maven/database tests (no backend change), ordinary Operations starter export, and monolithic `verify:frontend`. Its component checks were run separately; ordinary Operations Firebase starter/package mismatch was not changed or bypassed and is not claimed newly resolved. No private provider JSON or notification policy was edited to obtain a pass.

## Exact changed files

Modified:

```text
apps/customer-mobile/app/(store)/_layout.tsx
apps/customer-mobile/app/email-confirmation.tsx
apps/customer-mobile/app/index.tsx
apps/customer-mobile/src/api.test.ts
apps/customer-mobile/src/auth/AuthPanel.test.tsx
apps/customer-mobile/src/auth/AuthPanel.tsx
apps/customer-mobile/src/auth/confirmation-screen.test.tsx
apps/customer-mobile/src/components/ui.tsx
apps/customer-mobile/src/features/cart/CartScreen.tsx
apps/customer-mobile/src/features/cart/cart.test.ts
apps/customer-mobile/src/features/cart/cart.ts
apps/customer-mobile/src/features/profile/ProfileScreen.test.tsx
apps/customer-mobile/src/features/profile/ProfileScreen.tsx
apps/customer-mobile/src/features/storefront/ProductScreen.tsx
apps/customer-mobile/src/features/storefront/Storefront.test.tsx
apps/customer-mobile/src/features/storefront/Storefront.tsx
apps/customer-mobile/src/navigation/checkout.test.tsx
apps/customer-mobile/src/navigation/routes.test.tsx
```

Added:

```text
apps/customer-mobile/assets/uxi/README.md
apps/customer-mobile/assets/uxi/account.png
apps/customer-mobile/assets/uxi/cart.png
apps/customer-mobile/assets/uxi/food.png
apps/customer-mobile/assets/uxi/home.png
apps/customer-mobile/assets/uxi/menu.png
apps/customer-mobile/assets/uxi/orders.png
apps/customer-mobile/src/assets.d.ts
apps/customer-mobile/src/components/FoodMedia.test.tsx
apps/customer-mobile/src/components/FoodMedia.tsx
apps/customer-mobile/src/components/media.ts
apps/customer-mobile/src/features/cart/CartProvider.test.tsx
apps/customer-mobile/src/features/storefront/MenuProvider.test.tsx
apps/customer-mobile/src/features/storefront/MenuProvider.tsx
apps/customer-mobile/src/features/storefront/ProductScreen.test.tsx
apps/customer-mobile/src/features/storefront/presentation.test.ts
apps/customer-mobile/src/features/storefront/presentation.ts
docs/uxi-08-customer-storefront.md
scripts/customer-preview.cjs
```

Generated, ignored evidence is under `target/uxi-08-preview/` and `apps/customer-mobile/dist-starter/`; these are not production source additions. Pre-existing Postman files remain outside this change list.

## Remaining dependencies and UXI-09 handoff

UXI-09 requires its own authorization for the full Address/Geography/Checkout/Order Lifecycle visual redesign. Existing contracts, original checkout-attempt recovery keys, canonical hierarchy, delivery quotes, status/payment independence and route regressions are the prerequisites preserved here. No UXI-09 implementation was started.

Pending acceptance inputs are an Android device/emulator with Burmese fonts and TalkBack, keyboard/200% text review, approved tenant originals and exact publication UUIDs, real Firebase/provider acceptance, hosted schema/data release evidence and final Figma/native design approval. Unsupported persisted notification categories remain deferred until their API/product contract exists. None of these dependencies was fabricated or treated as permission to modify live systems.

Stop after UXI-08. No commit, push, deploy or subsequent milestone is included.
