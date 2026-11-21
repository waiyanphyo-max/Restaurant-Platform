# UXI-09 — Customer Android address, checkout and order lifecycle

Date: 21 November 2026 (Asia/Bangkok). Scope: UXI-09 only. Local implementation and synthetic verification do not establish hosted or native release readiness.

## Integrated baseline and boundaries

Branch: `uxi/09-customer-checkout`. HEAD: `af8185d2bf3df35f6c8bfc63ab3f6bd6dc77eca9`, the integrated UXI-08 PR #48. Initial staged and unstaged tracked diffs were empty; `.postman/` and `postman/` were already untracked and remain untouched. No reset, stash, branch switch, staging, commit, push, merge or deployment was performed.

The baseline, product decisions, D0 amendment checklist, v2 roadmap, UXI-06/07/08 reports, API documentation and relevant geography/auth/address/checkout/order documentation were read. Current implementations and contracts were audited before editing. Figma was read only. No backend, API schema, migration, native identity, signing, icon, splash, Firebase or provider configuration was changed.

## KEEP / ADAPT / ADD

| Decision | Implementation |
| --- | --- |
| KEEP | Fixed embedded restaurant/environment/API origin; Supabase session and Spring ownership; RuntimeBrandingProvider, shared CustomerMenuProvider and account cart; canonical geography APIs; optional maps/GPS; server quote and validation; exact checkout body/token/key, SecureStore scope, recovery and settlement; customer order routes, pagination and existing active-screen refresh; current-catalog reorder. |
| ADAPT | Address hierarchy and grouped text-first form; selected-address/contact summaries; distinct destination and quote reviews; semantic themed feedback; owned history/detail, immutable item/payment/destination summaries and timeline; English/Burmese copy. |
| ADD | Explicit legacy hierarchy acknowledgement; owned-list reconciliation after ambiguous address writes; active-hierarchy validity feedback; stale quote response/submit protection; cancellation reconciliation barrier and review; explicit cart-replacement confirmation; targeted regression coverage and lifecycle preview fixtures. |

The assessment was provided before implementation. No second cart provider, location authority, checkout controller or order state machine was introduced. `CheckoutProvider.tsx` remains unchanged.

## Live Figma evidence

Original file: [Restaurant Platform](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform). The following live nodes returned full design context and screenshots and were visually inspected before their corresponding code changes:

| Area | Nodes |
| --- | --- |
| Address/geography | C06 `14:151`, C07 `38:255`, C08 `38:323`, C09 `38:367`, C10 `38:420`, C20 `38:794`, C22 `38:887`, C25 `42:861`, C30 `72:917` |
| Destination/quote | C04 `14:88`, C21 `38:838`, C26 `42:906`, C27 `42:965`, S14 `40:1762`, S15 `40:1812` |
| Orders/recovery | C05 `14:120`, C11 `38:478`, C12 `38:532`, C23 `38:931`, C24 `38:979`, S24 `40:2197`, S25 `40:2252` |
| Geography safeguards | S22 `40:2093`, S23 `40:2149`, S29 `40:2414` |
| Shared safeguards/brand | S03 `16:27`, S08 `20:30`, S36 `50:715`, Brand Kit `88:118` |
| Audit Coverage | Page `27:2` metadata and Customer findings `27:46` full context/screenshot. Page-level design context cannot render a canvas directly; its actual child frame was inspected. |

The approved hierarchy uses existing semantic tokens, cards, headings, form fields, feedback and confirmation primitives. Existing exact Figma navigation icon exports remain in their original 24px shared-shell slots; no sample address, price, order number or image preview became application data. No Figma edit was attempted. Coverage/completion labels are design specifications, not runtime or device acceptance.

## Address, geography and legacy review

Region / State → District → Township remains based on backend IDs and active lists. Changing Region clears District/Township in one update; changing District clears Township. Child requests are limited to verified parents, responses are filtered by parent IDs, obsolete requests are aborted and obsolete responses are ignored. Selection validity is reported separately from labels. Loading, offline/error, retry, empty search, inactive selection, breadcrumbs and parent reset feedback are explicit.

The saved form groups label, contact, hierarchy, original street/building/ward and instructions before optional map controls. Existing request fields and maximum lengths remain unchanged. Review and explicit Save/Cancel remain required. Incomplete/unverified canonical locations cannot save. Legacy addresses retain their original contact, building, street, ward, township/city and note for review; old text never silently supplies an ID. The customer must explicitly acknowledge the replacement hierarchy. No ward/village master records were added.

An ambiguous network/timeout/server result does not show a successful save. Another mutation remains blocked while the owned address list is refreshed and reviewed. A matching returned address directs the customer to their saved list; a failed refresh offers read retry. No address save rewrites historical order destinations.

## Optional map and GPS

Manual canonical text addresses work without map configuration or location permission. Map/GPS coordinates use the existing `selectPin`, `confirmPin` and `suggestCurrentLocation` paths; suggestions require explicit confirmation, and invalid/partial coordinates are rejected. GPS denial/low accuracy and map timeout preserve return to text entry. The initial approximate Yangon camera remains a visual fallback, never a selected customer location or inferred township. No background tracking, geocoder or new key was introduced.

Maps/GPS behavior is covered by synthetic component/helper tests only. Real native permission/provider operation remains unverified.

## Saved and temporary destinations

Saved selection retains the actual owned address ID and canonical hierarchy. Its recipient/contact/address/instructions are visible before quoting. Temporary destinations use only existing DTO fields and apply to the current checkout; they never call address mutation APIs or change the default. Text-only and confirmed pin paths share canonical validation.

Destination, saved-address refresh, recipient, instructions, coordinates, hierarchy and cart changes invalidate screen-local destination/quote reviews. A captured pre-change submit callback cannot submit a stale review. Relevant in-flight quote responses are aborted/discarded. Runtime palette refresh does not alter order data or invalidate an otherwise current quote. Unresolved durable attempts remain independent of these local reviews.

## Server quote, confirmation and recovery

The screen distinguishes selection → destination review → server quote → item/price/fee/discount/total/payment review → explicit submission → confirmed receipt or unresolved result. Existing `getDeliveryZones`, `quoteDelivery`, `checkoutDelivery`, `getCheckoutReceipt` and `abandonCheckout` contracts remain authoritative.

The quote DTO supplies no minimum-amount field. The UI explains that the server checked current restaurant/zone minimums; it does not fabricate a minimum value or final client-side fee. Quote validation failures support retry and clearly say no order has been confirmed. Address/coordinate/contact/product/modifier/minimum/stale/session errors retain server validation and identifiable fields have associated feedback.

The durable provider was not rewritten: its environment/restaurant/account SecureStore key, original idempotency key, confirmation token and request body, duplicate lock, lost-response receipt recovery, uncertain/recovery_pending/unrecorded states, settlement-before-fresh-attempt and session cleanup remain intact. Screen/cart/address changes and navigation do not delete unresolved attempts. Provider regressions exercise exact replay, editing/reset during uncertainty, account/environment/tenant isolation and sign-out during a pending operation.

## Historical receipt, tracking, cancellation and reorder

The immediate create response exposes only its supported confirmation fields and safe tracking/history navigation. The owned detail endpoint supplies the full historical receipt: real ID/number/created time, order and delivery states, original item/variant/modifier quantities/prices/instructions, totals, payment records and destination snapshot. Neither current menu prices nor runtime branding reconstruct historical data. Timelines use only returned status histories and timestamps.

Payment labels use actual method/status records. COD pending means cash is due, even when delivery is DELIVERED. Paid non-cash methods do not claim cash collection. Kitchen completion, physical delivery and payment remain distinct. No collector, payment time or unsupported collection detail is invented.

History retains pagination, explicit empty/error/offline/expired/forbidden states and refresh. Detail retains the existing focused-screen foreground/20-second refresh lifecycle without adding a second poller. Manual refresh shows a busy indicator until its owned read settles; background refresh keeps the existing cadence. Foreign/missing/unauthorized deep links expose no order detail and offer safe history recovery.

Cancellation is offered only from server `canCancel`, reviewed in a confirmation dialog and protected against duplicate presses. Unknown responses require a fresh owned-order read before another action is enabled; failed reads remain blocked with read retry. Confirmed cancellation refreshes the order, and stale eligibility is reconciled without creating a new endpoint or changing payment/stock rules.

Reorder uses the current tenant catalog, current IDs/options/availability/prices and existing `rebuildCart`. A nonempty cart requires explicit replacement confirmation. Unavailable items are reported through the existing cart result; zero restorable items leave the cart intact. Reorder only populates the cart; destination, server quote and explicit checkout are still required.

## Localization, accessibility and preview limits

English/Burmese copy uses existing account language preferences. Whole-currency formatting uses real response amounts. Forms and summaries wrap long text; semantic colors follow the dynamic tenant theme. Existing safe-area/keyboard shell, scalable text, form labels/errors, accessible selection feedback, live loading/error announcements and scrollable confirmation dialogs are reused.

`node scripts/customer-preview.cjs --lifecycle` renders 64 actual-TSX static DOM approximations: A red/English and B teal/Burmese, 360/720px, 100/200% text, address/legacy/checkout/quote/uncertain/receipt/history/detail. The fixture intentionally distinguishes a delivered order with COD pending from a recorded paid response. All API ports are mocked, Maps disabled and controls static. Generated files are ignored under `target/uxi-09-preview/`. The original 40-page UXI-08 preview mode also still generates successfully.

Headless Chrome rendered eight representative cases: A checkout, quote, legacy, uncertain and detail at 360px/100%; B checkout/detail at 360px/200%; B address at 720px/200%. Screenshots, lower-section captures and `layout-evidence.json` are in that ignored directory. All eight document widths match their viewport widths; the only out-of-viewport children are inside the existing horizontal tab scroller at 200%. Checked quote/payment actions, historical pending-COD text, long headings/addresses, original legacy text, tenant colors and navigation remained reachable in the approximation. The preview harness itself was corrected to account for its variable-height disclaimer and remove browser-default button chrome. These approximations cannot establish Android layout, Burmese font shaping, TalkBack, permission-dialog, keyboard or final Figma acceptance.

## Synthetic acceptance coverage

Coverage is local/disposable; it does not claim two hosted restaurants or real orders.

| Requested cases | Evidence scope |
| --- | --- |
| 1–6 hierarchy, resets, stale responses, inactive/empty/offline and legacy preservation | LocationSelector, address helpers and AddressScreen component tests; original master-data audit script tests. |
| 7–8 ownership and temporary isolation | Existing auth/API/account-scope regressions and temporary quote tests; Spring enforcement is unchanged, not newly exercised against a hosted service. |
| 9–12 Maps disabled/manual confirmation/GPS denied-low accuracy/invalid coordinates | Existing and extended AddressScreen, AddressMap, location and app-config tests; device operation not claimed. |
| 13–17 quote retry, zone/minimum, invalidation and quote-versus-order | CheckoutScreen and destination tests with synthetic API responses. |
| 18–21 duplicate/lost-response/settlement/sign-out | CheckoutProvider and navigation/auth regressions; original provider source preserved. |
| 22–27 owned history/pagination/foreign-ID safety/snapshots/COD/cancellation | Order route/presentation/component regressions and existing client/ownership tests; no hosted mutation. |
| 28–29 current catalog and cart replacement | Existing cart rebuild tests and new order UI confirmation tests. |
| 30 runtime branding and tenant/account isolation | Existing RuntimeBrandingProvider/runtime, generated A/B config, API, session/cart/provider tests; lifecycle preview fixtures. |

## Verification results

| Check actually run | Final result |
| --- | --- |
| `npm run build:packages` and root `npm run typecheck` | PASS — all shared and application workspaces, including Customer. |
| Root `npm run lint` | PASS — scripts and all configured workspaces, including Customer. |
| Root `npm test` | PASS — 1,793 Vitest tests across 152 files plus 45 Node tests; zero failures/skips. Loopback synthetic fixtures required an allowed execution outside the sandbox. |
| Customer suite within that root run, then final targeted recheck | PASS — root run: 531 Vitest tests across 42 files plus 8 Node tests. After the final manual-refresh feedback regression was added: all 532 Customer Vitest tests across 42 files PASS with `npx vitest run src --maxWorkers=4`; Customer TypeScript/ESLint rechecked. Includes address/geography, CheckoutScreen/Provider, route/auth/account/tenant and new order lifecycle/presentation coverage. |
| API-client / UI tokens / registry | PASS — 243 API-client, 12 token and 21 registry tests. |
| Admin / Guest / Operations regressions | PASS — 220 / 330 / 457 Vitest tests respectively; Operations also 6 Node tests. |
| Root script geography/build regression tests | PASS — 10 Node tests. |
| `npm run build:web` | PASS — Admin and Guest production builds. |
| `npm run --silent mobile:build -- validate` | PASS — registry/build identity validation; not release endpoint approval. |
| Isolated Customer Android JavaScript export | PASS — final source, starter-fixture, 1,394 modules, 32 assets, approximately 3.9 MB Hermes bundle: `index-825c0aedc694eb1eec117a6573cd6dd1.hbc`. |
| Synthetic preview generation and browser review | PASS within DOM-approximation scope — 64 lifecycle plus 40 original previews, eight checked layouts and screenshots. |
| Whitespace / staged diff / protected provider source | PASS — `git diff --check`; staged diff empty; CheckoutProvider, CartProvider and CustomerMenuProvider source unchanged. |

**FAIL (intermediate, corrected):** first in-progress Customer runs caught missing `Text`, temporary nullability/union typing and a new fixture type error; the final runs above pass. The first concurrent root test run stalled workers during the browser-tool timeout and failed. Browser automation itself timed out, and sandboxed headless rendering did not start; allowed headless Chrome with generated local files succeeded. A preview fixture initially lacked the modifier snapshot ID and triggered a key warning; its fixture was corrected and final generation is clean. No final required code check remains failing.

**BLOCKED:** installed-device/emulator, real Maps/GPS, TalkBack, native Burmese/keyboard/200% acceptance, final Figma signoff and hosted readiness evidence.

**SKIPPED:** destructive Expo prebuild, signed APK/AAB/cloud EAS, hosted SQL/data/media/order/payment/notification writes and deployment, under the explicit task exclusions.

**NOT RUN:** backend Maven/database tests because no backend/API/schema code changed; ordinary Operations starter export and monolithic `verify:frontend`. Its applicable frontend component checks were run separately. The pre-existing Operations Firebase starter mismatch was neither changed nor claimed resolved.

The isolated export sets `EXPO_NO_DOTENV=1`, disables Customer notification/phone inputs and clears Maps/Firebase paths in process environment only. The existing starter wrapper selects the fixed development fixture/API and offline Expo mode. No provider file, notification policy, app ID or native configuration was edited.

## Exact changed files

Modified:

```text
apps/customer-mobile/app/(store)/order/[orderId].tsx
apps/customer-mobile/app/(store)/orders.tsx
apps/customer-mobile/src/components/LocationSelector.test.tsx
apps/customer-mobile/src/components/LocationSelector.tsx
apps/customer-mobile/src/components/ui.test.tsx
apps/customer-mobile/src/components/ui.tsx
apps/customer-mobile/src/features/addresses/AddressMap.test.tsx
apps/customer-mobile/src/features/addresses/AddressMap.tsx
apps/customer-mobile/src/features/addresses/AddressScreen.test.tsx
apps/customer-mobile/src/features/addresses/AddressScreen.tsx
apps/customer-mobile/src/features/checkout/CheckoutProvider.test.tsx
apps/customer-mobile/src/features/checkout/CheckoutScreen.test.tsx
apps/customer-mobile/src/features/checkout/CheckoutScreen.tsx
apps/customer-mobile/src/features/checkout/destination.test.ts
apps/customer-mobile/src/features/checkout/destination.ts
apps/customer-mobile/src/features/orders/presentation.ts
apps/customer-mobile/src/navigation/routes.test.tsx
scripts/customer-preview.cjs
```

Added:

```text
apps/customer-mobile/src/features/orders/Orders.test.tsx
apps/customer-mobile/src/features/orders/presentation.test.ts
docs/uxi-09-customer-checkout.md
```

`Action` gained an optional radio role so geography/label choices announce checked state correctly while existing action defaults remain unchanged. Navigation regression coverage now spans Address, Cart, Checkout and Orders for all recoverable statuses. The pure existing quote-review component has a named export for static preview; it is not another checkout controller. Generated preview/browser/export artifacts are ignored evidence, not production source or release artifacts. Pre-existing `.postman/` and `postman/` are not part of this list.

## Hosted and native readiness gates

| Gate | Status |
| --- | --- |
| Hosted migration ledger/schema parity | BLOCKED for release — not inspected or changed. |
| Canonical geography master-data coverage/active state/provenance | BLOCKED for release — local source tests do not prove hosted coverage. |
| Real restaurant delivery-zone configuration | NOT RUN — no real tenant writes or order attempts. |
| Hosted Spring database role/RLS grants | NOT RUN — no hosted database access. |
| Real Owner/Customer tenant data and production media publication | NOT RUN — no real data/media changes. |
| Native Maps/GPS/provider configuration and operation | BLOCKED — device/provider acceptance outstanding. |
| Operations Firebase starter client/project/package mismatch | Outstanding prior gate — no Firebase file/identity/notification policy changed. |
| Installed Android emulator/device, TalkBack, Burmese fonts, keyboard, 200% text | BLOCKED — native acceptance evidence unavailable. |
| Final Figma visual approval | BLOCKED — live designs inspected; final reviewer acceptance not claimed. |
| Signed native release | NOT RUN — no APK/AAB, signing or cloud EAS build. |

## UXI-10 prerequisites and stop boundary

Review this UXI-09 diff and evidence before accepting it. UXI-10 requires a separate request and its Operations role/action/payment audit; no Operations redesign has begun. Hosted geography/schema/data/provider and native accessibility/release acceptance remain separate approvals and evidence gates. None of those gates authorizes a hosted mutation here.

Stop after UXI-09. No commit, push or deployment.
