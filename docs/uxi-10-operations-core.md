# UXI-10 — Operations Android core UX alignment

Completed: 22 November 2026 (Asia/Bangkok); audit and implementation began 21 November. Source-only UXI-10. This report does not certify Android device, TalkBack or final Figma acceptance. UXI-11 and later work was not started.

## 1. Verified baseline and scope

- Branch: `uxi/10-operations-core`.
- HEAD: `10753e6d747b65abeea3ad11137ff55847e34623`, the integrated UXI-09 / PR #49 merge. The supplied baseline is HEAD and is therefore in local ancestry (`git merge-base --is-ancestor` passed).
- Recent history was inspected through UXI-04, including UXI-05/06/07/08/09. Initially there were no tracked changes; only the user's `.postman/` and `postman/` directories were untracked. Those directories were left untouched.
- No reset, stash, branch change, staging, commit, push, merge, deployment, migration, real order/payment, invitation, notification or media upload was performed.
- No applicable `AGENTS.md` was found in repository/ancestor checks. All ten requested documents were read completely across the audit team: baseline, product decisions, D0 amendments, v2 roadmap, UXI-03/06/08/09, API and role matrix. Current Operations, shared clients/DTOs and relevant Spring services/security were inspected before coding.
- No backend, API schema/client, Customer/Guest implementation, native identity, signing, provider credentials, QR credentials or accounting implementation changed.

## 2. KEEP / ADAPT / ADD assessment, delivered before coding

| Decision | Evidence and implementation scope |
| --- | --- |
| KEEP | Existing Spring order-actions/status, queue, staff-order, delivery, assignment and payment services; shared DTO/client calls; server prices, snapshots, actor/history; verified membership and fixed installed restaurant; UXI-03 runtime branding; Guest/Customer checkout behavior. |
| ADAPT | Role-specific primary navigation and complete workspace tools; operational attention dashboard; order triage/detail hierarchy; cancellation review; counter catalog/basket/review/receipt; physical pickup and delivery/COD explanations; semantic components and bilingual critical copy. |
| ADD | Isolated dashboard section failures; local review/reconciliation safeguards; cancellation validation; counter discard and successful-read prerequisite for manual uncertain-submission reconciliation; mutation scope revocation; focused synthetic interaction tests and reproducible DOM previews. |

The audit found existing functionality, not a need for a second fulfillment/accounting state machine. Unsupported sample financial measures and Figma-only filters were not implemented.

## 3. Live Figma inspection

Read-only file: [Restaurant Platform](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform). Full design contexts and accompanying screenshots were reviewed for all 34 requested frames. No Figma writes were made.

| Family | Frames and exact node IDs reviewed |
| --- | --- |
| Dashboard, role workspaces and sign-in compatibility | O01 `15:3`; O04 `15:104`; O37 `39:1649`; O39 `39:1815`; O53 `53:1773`; O54 `53:1817`; O55 `53:1862` |
| Orders, filters, kitchen/handoff and queue | O02 `15:40`; O03 `15:82`; O07 `39:193`; O08 `39:239`; O09 `39:282`; O38 `39:1670`; O48 `42:2441`; O49 `42:2484`; O50 `42:2525` |
| Counter and delivery | O10 `39:328`; O13 `39:491`; O40 `39:1860`; O51 `42:2565`; O52 `42:2610`; O56 `53:1906` |
| Safeguards | S03 `16:27`; S05 `16:51`; S06 `16:71`; S07 `20:18`; S08 `20:30`; S16 `40:1865`; S17 `40:1908`; S18 `40:1944`; S19 `40:1979`; S20 `40:2015`; S21 `40:2052`; S30 `40:2455` |

Design hierarchy was translated into the existing React Native semantic Page/Card/Action/Badge/Status/FormField/ConfirmDialog primitives. Layouts remain responsive, scrollable and dynamically branded. The San Thaw Tar logo, food, prices, customers, order numbers and financial figures are illustrative and were not copied into runtime data. The original team sign-in/auth flow is retained.

Six local generic icon PNGs have recorded node provenance in `apps/operations-mobile/assets/uxi/README.md`. Home/Orders/Account/Food reuse exact existing Customer exports from the same Figma nodes; Delivery/More were exported live. All files are nonempty. Icons use 24×24 slots; the counter photo/fallback slot is 72×72. Runtime logos and catalog photos remain dynamic; unsafe/missing/failed images fall back without using tenant sample imagery. No temporary Figma asset URL is used at runtime.

## 4. Role-specific navigation and identity

`getNavigationItems()`, `canAccessScreen()`, ScreenGuard and WorkspaceBoundary remain the access policy. The new presentation helpers partition only their already-authorized routes; they grant no permissions.

| Role | Primary navigation and retained access |
| --- | --- |
| Owner | Today, Orders, Delivery, More. All 15 prior workspace routes remain reachable, including Team, Tables/QR, Menu, Restaurant settings, Shopping, Purchasing, Accounting, Sales History, Reports, Queue, Updates and Account. |
| Manager | Same primary navigation; all 14 previously authorized routes retained. Team administration remains Owner-only. |
| Staff | Today, Orders, Delivery, More; Queue, Counter Order through existing Orders, read-only permitted Menu, Updates and Account remain reachable. No accounting/reporting/team/settings grant. |
| Delivery Driver | Tasks, Today, Updates, Account: all four existing authorized routes remain explicit. Delivery status filters provide available task history. No unrelated orders, menu, finance or management screens. |

The More panel shows grouped operational, management, finance and account tools, with only permitted items. Existing public/deep-link URLs are unchanged. Selected state includes nested order/delivery routes. Touch targets, semantic tab labels, wrapping and horizontally scrollable large-text tabs avoid fixed-height clipped labels. Opening More hides underlying content from pointer and accessibility traversal and provides a close control.

The shell uses the existing RuntimeBrandingProvider's current safe logo/name and semantic colors. Failed logos fall back to the same-tenant text identity. The dashboard no longer independently requests restaurant branding. Installed UUID/environment binding, launcher/package assets and native identity are unchanged. Theme refresh does not change order/query identity or financial evidence.

## 5. Dashboard data semantics and partial results

Owner/Manager receive server counts for Pending, Accepted, Preparing, Ready and Out for delivery; queue attention; delivery records and Waiting Assignment count; notifications; and the existing daily operational report. Staff receive operational tasks without daily financial reporting. Driver reads use only `listMyDeliveries()` plus addressed notifications; no general order/report calls.

Each auxiliary source has independent ready/offline/denied/error state, including individual order status counts. A failed source is unavailable, never silently zero. A 401 propagates to existing query/session-expiration handling. Summaries project delivery records to ID/order number/status so private destinations are not retained in dashboard results. The duplicate `getRestaurant()` request was removed; assignment attention uses a supported filtered count request.

The daily amount is labelled **Value of orders created today, excluding cancellations**, with backend report date/timezone. It is not cash received, recognized sales or net sales. The ambiguous `paidAmount` presentation and all sample collection/receivable figures were omitted. Owner/Manager can open their existing authorized financial modules; those modules were not redesigned.

## 6. Orders and detail presentation

New/Active/History/All groups select the existing single server status filter and reset pagination. Active initially selects Accepted and exposes its supported individual statuses; History initially selects Completed and permits Cancelled. Copy shows the exact selected status rather than claiming an aggregate group query. Actual server page number/total/first/last drive pagination. Search and channel filtering explicitly apply to the loaded page only. No all-record local search claim is made.

Cards show actual order number/timestamp, bilingual status and service/channel, item/quantity/variant/modifier summaries, kitchen notes and server amounts. Detail puts item snapshots before reviewed actions, separates payments, and preserves actual status timestamps, actor IDs and notes. Sensitive addresses are rendered only from the existing authorized DTO response. No new per-row detail requests or recipient data fabrication were added.

The list DTO lacks a table label and queue display code; the existing detail table ID/queue link is retained. No guessed table or queue number is displayed. The existing API client PageQuery exposes status/page/size; Spring's default newest-first sorting remains. Figma date/payment/sort controls were omitted rather than sent as unsupported client fields. Accounting filters remain in authorized financial records.

## 7. Accept / Complete / Cancel and Staff cancellation

All kitchen actions still use `executeOrderAction(orderId, { action, expectedStatus, reason })`, the existing `POST /orders/{orderId}/actions`. No alternate endpoint or frontend state machine was added. Server `availableActions`, including an empty array, is primary presentation authority. Existing fallback compatibility is retained and Spring revalidates every request.

The actual Java `RestaurantRole` grants Staff `ORDER_CANCEL_EARLY_UNPAID`; Owner/Manager have that plus `ORDER_CANCEL`. This takes precedence over the stale documentation sentence requiring broad cancellation for every role. Staff's server-offered early unpaid cancellation is retained without broadening Staff rights. Paid/settled evidence remains blocked by OrderCancellationService for all roles; `REFUND_REQUIRED` explains that cancellation does not return money.

Every action opens confirmation, carries the displayed expected status and uses the synchronous mutation gate. Cancellation has a dedicated multiline reason inside review, trimmed 10–500 characters with meaningful letter/number content; invalid reasons cannot dispatch. The existing ConfirmDialog gained only optional children, preserving other callsites. Kitchen Complete is explained as ready for delivery handoff or queue pickup where applicable; cash and physical handoff remain separate.

Page-owned attempt locks survive local search/channel filtering and card unmount/remount, including an in-flight request. Their settlement triggers a read-only authoritative page reload; locks clear only after a ready page response. Failed/uncertain actions require authoritative reload and a fresh confirmation. Conflicts are not replayed. Error copy distinguishes stale order, stale delivery, paid cancellation and explicit COD cash requirement without exposing raw server details. Order/payment/history evidence remains server-owned.

## 8. Counter ordering and uncertain recovery

The existing `getStaffOrderOptions()`, `getPublicMenu()`, `counterOrderLine()`, `counterOrderRequest()` and `createStaffOrder()` are reused. Only Owner/Manager/Staff can enter the panel. Drafts are keyed to restaurant/user/role. Dine-in requires an actual active table; Takeaway requires current eligibility. Search covers current product/variant names. Variants, required/optional modifiers, option quantities/additional prices, stock, quantity and multiline kitchen notes remain validated.

Current-menu line/basket amounts are explicitly **estimates** calculated from server catalog prices; the receipt's final amount comes from the service. Review includes actual chosen table/service, lines/options/notes and pending-payment semantics. Receipt appears only after server confirmation and local validation of the existing receipt shape, identity, request-matching type, pending payment/order state, amounts and internally consistent queue fields. A malformed successful JSON response enters uncertain reconciliation with the basket intact; it never shows success or clears the draft. Receipt shows `queueDisplayCode` only if returned. Current OrderService staff creation returns null queue fields; no code is invented. Cash-at-counter remains pending until the separate authorized collection action.

Lost response, timeout, protocol error, 408 or 5xx sets an uncertain latch and blocks resubmission/discard. Explicit reconciliation requests the latest 20 Orders and shows actual returned records plus a full Orders link. A successful authoritative read is required before manual acknowledgement permits another reviewed submission. The page explicitly says absence from these records does not prove non-creation. This is manual reconciliation, not exactly-once/idempotent staff import. There is no automatic repeat or false receipt. Discarding an unsubmitted draft/item requires confirmation.

## 9. Queue and physical pickup

`listQueue()` retains the restaurant-local queue day and Waiting/Ready/Called/Completed/Cancelled filters. Actual display codes, linked orders and timestamps are shown. Workflow is kitchen ready → call Ready ticket with `callQueueTicket()` → explicitly confirm physical pickup of a Called ticket.

Physical pickup re-reads the linked authorized order, checks the queue link, Takeaway type and Ready state, then uses the existing `updateOrderStatus(... COMPLETED ...)` path. This legacy path has no expectedStatus field; Spring locks and validates its transition. No new contract was invented. Failure pauses actions until queue reload and fresh review. Calling and physical pickup never invoke `collectPayment()` or imply cash receipt. Queue notifications remain through the existing server mechanism; no tracking token is displayed.

## 10. Delivery assignment, privacy and maps

Management uses restaurant-wide `listDeliveries()` / `getDelivery()`; Staff/Driver use `listMyDeliveries()` / `getMyDelivery()`. Assigned summaries filter to the current user and omit private recipient fields. Sensitive detail mounts by restaurant/user/role/task and validates returned task ID and assignee before displaying contact/address/notes.

Assignment still uses server-approved `listDeliveryAssignmentOptions()` and `assignDriver()` with fresh revision validation. Manual assignment permits eligible active Owner/Manager/Staff/Driver members returned by Spring. Existing default-driver configuration filters to Delivery Driver role only; these rules were not collapsed.

Status writes retain existing valid transitions and `expectedUpdatedAt`. Pickup requires actual prepared-order collection; Delivered remains distinct. Reassignment or failed authorization clears private details through authorized reload. Before external maps or assigned status changes, the current assignment and revision are rechecked. Existing periodic recheck has an in-flight/abort guard to avoid overlapping requests; no foreground listeners were added. After a failed write, cash confirmation is reset even if the reloaded revision is unchanged, and the action is never automatically replayed.

Existing delivery-maps helpers and immutable snapshots remain. Pickup address and authorized destination/contact/instructions are shown; text-only or invalid-coordinate destinations have no fabricated map pin. Coordinates are never inferred from free text/township. Safe external map URLs and no private-data logging remain. No geocoder, provider or live-map integration was added. Active-screen revocation detection still depends on authorized refresh/recheck; this is not a new real-time push revocation contract.

## 11. COD and counter cash

Assigned delivery checks authoritative `cashCollectionRequired` and requires explicit physical cash confirmation before Delivered; `assignedDeliveryUpdate()` sends the existing `cashCollected` field. Management cash review reads existing payment DTOs, sums actual pending COD amounts, rechecks that amount before completion, and performs only the single delivery status write. It does not also call a payment endpoint. Spring handles delivery/order/COD atomically and still rejects `409 CASH_COLLECTION_REQUIRED`.

**Assigned amount contract limitation:** AssignedDeliveryDetailDto exposes `task.totalAmount` and `cashCollectionRequired`, not an independent pending-payment amount. The assigned UI truthfully labels this as **Order total**, not a separately measured outstanding balance. Current OrderService creates one pending COD payment at `plan.totalAmount` (lines 560–562), and the existing PaymentService offers no partial COD collection. A separate Driver pending-amount field was not invented and Driver was not given PAYMENT_READ. Independent historical/mixed-payment due reconciliation remains a management payment-review dependency; exact separate amount presentation is an implementation gap, not a new backend contract in UXI-10.

Counter cash uses only existing `collectPayment(orderId, paymentId)` after current method/status eligibility and explicit physical-cash confirmation. Cancelled or settled records are not offered as new collections. Failed/unknown results reload authorized order/payment state before another review. No fulfillment action triggers a second payment write, refund, journal entry or accounting posting.

## 12. Synthetic regression evidence

All tests use disposable/mocked ports, storage/providers and synthetic data; no real restaurant order/payment was created. Existing backend permission/state tests were inspected; the frontend suites do not establish new hosted Spring/RLS acceptance.

| Required coverage | Evidence |
| --- | --- |
| Four roles, two restaurants, every prior route, forbidden finance | `policy.test.ts`, new `presentation.test.ts`, `WorkspaceTools.test.tsx`, existing workspace/access tests; active/mismatched/inactive membership denies visibility/deep links. |
| Tenant/membership changes and stale callbacks | Existing query/access/branding tests plus new mutation-scope tests cover user, role, tenant, signed-out and A→B→A; old 401 callbacks cannot sign out a new identity. |
| Server action authority, Staff early cancellation, paid/broader restrictions, reason bounds | Existing/expanded workflows tests and new `order-interactions.test.tsx`; empty server actions hide actions, invalid/whitespace/punctuation-only/overlong reasons do not dispatch. Existing Spring cancellation source remains authority for settled evidence. |
| Expected status, conflict/unknown outcome, duplicate taps | Actual mutation gate in interaction tests; no automatic replay, reviewed expected status, reload requirement and separate action/payment calls. |
| Queue ready/called/physical collection | Interaction tests verify Ready calls only, Called pickup, linked-order preflight and rejection after changed order; no money request. |
| Counter variants/modifiers/stock/table/type/pending receipt | Existing/expanded counter validation tests and new counter interactions for three creator roles, Driver denial, two-tenant drafts, actual/null queue codes and unpaid server receipt. |
| Counter unknown outcome and discard | Interaction tests cover one unresolved create on rapid taps, no false success, failed/successful reconciliation reads and manual acknowledgement/discard guards. |
| Management assignment vs default driver | Existing delivery screen/default-role tests and new manual Staff-assignee interaction; eligible options from the server, revision preflight preserved. |
| Own assignments, revocation, stale revisions, safe maps | Existing assigned-delivery/map/screen tests and new interactions verify summary privacy, revoked navigation preflight, changed revision, text-only/invalid coordinates and permitted pickup/delivered transitions. |
| COD confirmation, exact management pending amount, no double payment | Existing assigned helper tests plus new management interaction verifies payment amount distinct from order total and one delivery mutation; counter cash interaction calls only collectPayment. |
| Offline/401/403, no forbidden retry, A/B branding | Existing hook/auth/runtime tests plus expanded error and QueryResult assertions; denied reads have no retry while offline/error states retain one. |
| Guest/Customer checkout, accounting/history unchanged | Full existing frontend/API-client suites and Admin/Guest production builds; four accounting/management test assertions updated solely for the shared forbidden-no-retry rule. Accounting implementations/DTOs were untouched. |

## 13. Localization, accessibility and visual evidence

Explicit RouteAction navigation preserves router behavior on Android and web without dropping Link-injected events; WorkspaceLink retains normal Link behavior with semantic styles and 48px minimum targets. The shell, workspace tools and dashboard have an in-session English/Myanmar toggle; core order, queue, counter and delivery safeguards use bilingual labels/copy. This is not a claim that unchanged catalog, finance, team and every legacy sentence are fully translated. No new theme provider or persisted language/backend preference contract was created.

Existing semantic tokens, dynamic text scaling, multiline text/notes, safe area, keyboard avoidance, labelled controls, selected/disabled/busy state and 48px-or-larger core actions are reused. Order badges communicate status text as well as color. Exact icons have fixed native geometry. Counter photos have loading/missing/error states with accessible labels and safe URLs. Narrow and large-text tab navigation can scroll rather than clip Burmese text.

`node scripts/operations-preview.cjs` generates **168 actual-TSX DOM approximations** under ignored `target/uxi-10-preview/`: synthetic restaurants A/B with red/teal palettes, four roles, 320/720px and 100/200% text fixtures for dashboard/orders/detail/queue/deliveries/assigned detail. Driver fixtures omit forbidden screens. All API/auth/storage/map ports are blocked/mocked. Static controls do not exercise interactions; counter remains closed in this SSR fixture. Counter review/receipt/discard layouts are therefore not visually accepted by these previews.

Rendered browser comparison is **BLOCKED**: local loopback preview attempts timed out/failed to connect from the browser boundary; the file URL was rejected by browser URL policy. No file-policy bypass or public hosting was used. Live Figma screenshots were visually reviewed; generated DOM files were not a substitute for viewed Android screenshots. Native typography/Padauk availability, TalkBack focus/announcements, keyboard/safe-area behavior, physical Android 200% scaling, map apps and final Figma/native acceptance remain **NOT RUN**.

## 14. Verification results

Final command outcomes and exact suite counts are recorded below after reconciliation checks. Ignored logs live under `target/uxi-10-*`.

| Check | Outcome |
| --- | --- |
| Shared package builds / root typecheck | PASS; existing workspaces build and TypeScript checks passed. |
| Root lint / Operations ESLint | PASS; all workspace lint plus scoped final changed-source checks. |
| Full root frontend/Node suites | PASS: 1,903 Vitest tests across 161 files plus 45 Node tests; 1,948 total, zero failures/skips. |
| Admin + Guest production builds | PASS: both production builds completed (root `npm run build:web`). |
| Ordinary Operations starter export | FAIL (environment gate): existing Firebase Android client does not match `dev.restaurantplatform.starter.operations.staging.dev` / configured project. No provider or package identity was changed to make it pass. |
| Isolated Operations Android JavaScript export | PASS on final source: 1,729 modules, 32 assets, 4.9 MB Hermes bundle `index-77f08548e62344fa314d276404e7f1a6.hbc`. No native/signed build. |
| Static DOM preview generation | PASS: 168 fixtures. Rendered browser visual review BLOCKED as described above. |
| `git diff --check` | PASS. |
| Backend Maven/database tests | NOT RUN: no backend source/contracts/schema changed; relevant Java source/tests were inspected. |
| Monolithic `verify:frontend` | NOT RUN; its applicable root component checks were executed separately and ordinary Operations starter failure is reported explicitly. |
| Native prebuild, EAS, signed APK/AAB, installed device, hosted/live actions | NOT RUN; outside this source-only milestone. |

The isolated export sets `EXPO_NO_DOTENV=1`, disables phone/notifications and clears Firebase paths only in the disposable development-fixture child environment; it uses the existing starter wrapper. It changes no checked-in/private provider settings and does not resolve or hide the ordinary starter gate. JavaScript export is not native release validation.

Exact final `npm run test` counts (all PASS):

| Suite | Vitest tests / files | Node tests |
| --- | --- | --- |
| UI tokens | 12 / 1 | — |
| API-client regression | 243 / 16 | — |
| Restaurant configuration | — | 21 |
| Admin | 220 / 22 | — |
| Guest | 330 / 30 | — |
| Operations, including navigation/roles/orders/queue/counter/delivery/branding/accounting regressions | 566 / 50 | 6 |
| Customer, including existing checkout/lifecycle | 532 / 42 | 8 |
| Root script regression | — | 10 |
| Total | 1,903 / 161 | 45 |

**SKIPPED: 0 automated tests.** The first full test run failed four assertions that expected retry on forbidden reads. Those assertions now require no retry for denied while retaining offline/error retry coverage; no tests were removed/skipped and no financial implementation changed. The final results above supersede that checkpoint. Adversarial review additionally added card filter/remount attempt-lock, old-scope busy-state and malformed-successful-receipt regressions before the final run.

## 15. Changed files

The following exact paths changed. `.postman/`, `postman/` and ignored build/preview/log artifacts are not implementation changes.

```text
apps/operations-mobile/app/(workspace)/_layout.tsx
apps/operations-mobile/assets/uxi/README.md
apps/operations-mobile/assets/uxi/account.png
apps/operations-mobile/assets/uxi/delivery.png
apps/operations-mobile/assets/uxi/food.png
apps/operations-mobile/assets/uxi/home.png
apps/operations-mobile/assets/uxi/more.png
apps/operations-mobile/assets/uxi/orders.png
apps/operations-mobile/src/assets.d.ts
apps/operations-mobile/src/components/QueryResult.test.tsx
apps/operations-mobile/src/components/QueryResult.tsx
apps/operations-mobile/src/components/ui.tsx
apps/operations-mobile/src/features/accounting/expense-cash-screens.test.tsx
apps/operations-mobile/src/features/accounting/procurement-screens.test.tsx
apps/operations-mobile/src/features/accounting/sales-dashboard.test.tsx
apps/operations-mobile/src/features/management/screens.test.tsx
apps/operations-mobile/src/features/operations/CounterOrderPanel.tsx
apps/operations-mobile/src/features/operations/CounterProductMedia.tsx
apps/operations-mobile/src/features/operations/DashboardScreen.tsx
apps/operations-mobile/src/features/operations/DeliveriesScreen.tsx
apps/operations-mobile/src/features/operations/DeliveryDetailScreen.tsx
apps/operations-mobile/src/features/operations/OrderCardActions.tsx
apps/operations-mobile/src/features/operations/OrderDetailScreen.tsx
apps/operations-mobile/src/features/operations/OrderPresentation.tsx
apps/operations-mobile/src/features/operations/OrdersScreen.tsx
apps/operations-mobile/src/features/operations/QueueScreen.tsx
apps/operations-mobile/src/features/operations/counter-delivery-interactions.test.tsx
apps/operations-mobile/src/features/operations/counter-order.test.ts
apps/operations-mobile/src/features/operations/counter-order.ts
apps/operations-mobile/src/features/operations/counter-product-media.test.tsx
apps/operations-mobile/src/features/operations/dashboard-overview.test.ts
apps/operations-mobile/src/features/operations/dashboard-overview.ts
apps/operations-mobile/src/features/operations/delivery-screens.test.tsx
apps/operations-mobile/src/features/operations/order-action-coordinator.ts
apps/operations-mobile/src/features/operations/order-interactions.test.tsx
apps/operations-mobile/src/features/operations/screens.test.tsx
apps/operations-mobile/src/features/operations/workflows.test.ts
apps/operations-mobile/src/features/operations/workflows.ts
apps/operations-mobile/src/hooks/mutation.test.ts
apps/operations-mobile/src/hooks/mutation.ts
apps/operations-mobile/src/hooks/useApiMutation.scope.test.ts
apps/operations-mobile/src/hooks/useApiMutation.ts
apps/operations-mobile/src/navigation/OperationsLanguage.tsx
apps/operations-mobile/src/navigation/RouteAction.test.tsx
apps/operations-mobile/src/navigation/RouteAction.tsx
apps/operations-mobile/src/navigation/WorkspaceLink.test.tsx
apps/operations-mobile/src/navigation/WorkspaceLink.tsx
apps/operations-mobile/src/navigation/WorkspaceTools.test.tsx
apps/operations-mobile/src/navigation/WorkspaceTools.tsx
apps/operations-mobile/src/navigation/presentation.test.ts
apps/operations-mobile/src/navigation/presentation.ts
docs/uxi-10-operations-core.md
scripts/operations-preview.cjs
```

## 16. Remaining gates and later milestones

- Existing Operations Firebase starter client/project/package mismatch remains open. No credentials, notification policy, package ID or provider configuration was changed.
- Native/emulator/Burmese-font/TalkBack and final rendered Figma approval remain open. No source-test result is described as native acceptance.
- Assigned independent COD due amount is not available in the current assigned DTO; exact limitation and creation invariant are recorded above. No broader Driver payment access or schema expansion was introduced.
- Current staff receipts do not return queue display codes; conditional display is supported without guessing. Summary table/queue labels and client date/payment/sort filters remain documented Figma gaps.
- UXI-11 may later align catalog, pricing/media, zones, team, settings and QR screens. Existing routes remain reachable; those modules were not redesigned. UXI-12 may later align authorized financial presentation without changing accounting rules. Neither milestone was started.
- Prior hosted geography/schema, full-resolution tenant originals/publication, Firebase/provider and signed-release gates from UXI-06/08/09 are not established by this work.

STOP at UXI-10. No commit, push, merge or deployment was performed.
