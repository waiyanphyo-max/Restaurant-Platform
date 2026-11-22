# UXI-12 — Operations finance UI

22 November 2026, Asia/Bangkok. Source implementation and synthetic regression verification completed for UXI-12 only. Browser visual acceptance is BLOCKED; installed Android, TalkBack and final Figma acceptance are NOT RUN. This is not production acceptance.

## 1. Baseline and preservation

- Branch `uxi/12-finance-ui`; HEAD `138beeee35ea8e6b9638c3c061fa46ef9312d59a`, exactly the accepted UXI-11 PR #51 merge.
- Branch, HEAD, status, recent history and ancestry were inspected before editing. UXI-01 through UXI-11 appear in the accepted merge history, PRs #41–#51. Initially no tracked changes existed; only `.postman/` and `postman/` were untracked. They were left untouched.
- No switch, reset, stash, stage, commit, push, merge, deployment, migration, live financial action, media upload, destructive prebuild, EAS or signed release occurred.
- The audit team read the complete baseline, product decisions, D0 amendments, v2 roadmap, UXI-10/11 reports and all three domain accounting documents, accounting foundation and role matrix. Current accounting API documentation, client/DTOs, source, security boundaries and tests were inspected. Historical readiness/gap descriptions were treated as history, not current capability authority. No applicable AGENTS.md was found.
- Backend, API/client contracts, schema, ledger services, role grants, operational order/queue/delivery/COD state machines, native identity and provider configuration are unchanged.

## 2. KEEP / ADAPT / ADD, assessed before implementation

| Disposition | Finding and action |
|---|---|
| KEEP | Existing Spring/PostgreSQL accounting, exact decimal strings/BigInt helpers, immutable snapshots and append-only correction history, tenant authorization, canonical payment/cash events, report/CSV contracts, stable request keys, SecureStore purchase attempts. |
| ADAPT | Dense finance forms/history into themed summary/record cards, wrapping quantity controls, clear source/period explanations, exact figures, danger reviews, private export scope and bilingual safeguards. |
| ADD | Finance landing composition; explicit reviews for previously direct expense/payment/movement/opening/template writes; exact remaining-payment/refund caps; session uncertainty/pending holds in the existing key mechanism, authoritative history check and explicit acknowledgement before a fresh review. No accounting engine or second durable recovery store. |

## 3. Exact changed files

All accounting paths below are relative to `apps/operations-mobile/src/features/accounting/`:

```text
AccountingAuditScreen.tsx
AccountingCsvAction.tsx
AccountingScreen.tsx
CashbookScreens.tsx
ExpenseCashScreens.tsx
ExportReportsScreen.tsx
FinanceMetric.tsx (new)
FinancialActionRecovery.tsx (new)
FinancialPeriodFields.tsx
PurchaseScreens.tsx
PurchasingScreen.tsx
SalesDashboardPanel.tsx
SalesDetailScreen.tsx
SalesLedgerScreen.tsx
ShoppingScreen.tsx
SupplierScreens.tsx
expense-cash-form.ts
expense-cash-interactions.test.tsx (new)
export-scope.ts (new)
finance-overview.test.tsx (new)
financial-requests.ts
financial-requests.test.ts
procurement-review.test.tsx (new)
sales-dashboard.test.tsx
sales-finance-interactions.test.tsx (new)
sales-refund-review.ts (new)
sales-refund-review.test.ts (new)
shopping-screens.test.tsx
```

Other paths:

```text
apps/operations-mobile/src/features/operations/ReportsScreen.tsx
scripts/operations-preview.cjs
docs/uxi-12-finance-ui.md (new)
```

Ignored `target/uxi-12-*` logs, preview fixtures and a disposable export runner are verification artifacts, not application configuration. The Android starter JS output is ignored. User Postman files are excluded from the implementation.

## 4. Live Figma evidence

Read-only session `d487f8cf-4130-4211-9bf9-e5282b22586d` in [Restaurant Platform](https://www.figma.com/design/WTKlnQ51UsYuRX2md60Fbn/Restaurant-Platform). High-fidelity design context and returned screenshots were inspected across the team before editing the corresponding screens:

| Family | Inspected nodes |
|---|---|
| Finance | O06 `15:169` |
| Shopping/purchases/suppliers | O21 `39:871`, O22 `39:929`, O23 `39:984`, O24 `39:1030`, O63 `72:3062`, O64 `72:3081`, O65 `72:3099`, O68 `72:3168` |
| Sales/refunds/audit/reports/export | O25 `39:1080`, O26 `39:1128`, O27 `39:1174`, O32 `39:1418`, O33 `39:1465`, O34 `39:1519`, O42 `40:1270`, O66 `72:3120`, O67 `72:3146` |
| Cash/expenses | O28 `39:1222`, O29 `39:1270`, O30 `39:1324`, O31 `39:1372`, O41 `40:1218`, O43 `40:1313`, O45 `40:1396` |
| Compatibility/date | O44 `40:1356`, O46 `40:1439`, O47 `40:1483` |
| Safeguards | S03 `16:27`, S06 `16:71`, S08 `20:30`, S28 `40:2378`, S30 `40:2455`, S31 `40:2496`, S39 `72:3866`, S40 `72:3884` |
| Foundations/coverage | Brand Kit `88:118`; Audit Coverage `27:2` metadata and current report-family child `27:409` context |

The Audit page itself did not return screen context (canvas, no selection); metadata discovery and its actual report-family child were used. Do not describe this as a full-page audit screenshot review. Implemented screen contexts were not sparse. Finance-specific bitmap artwork was absent; visible shared navigation icons already exist locally and retain the shell's 24px geometry. No temporary Figma assets or sample financial values were embedded. Figma was not modified. Current brand text retains variants/configured modifiers and runtime branding authority; O67 explicitly defers custom columns/physical-row previews.

## 5. Finance overview terminology

Accounting opens on Finance, with the server's actual period, IANA timezone and currency, exact sales/collection measures, confirmed purchases and registered expenses. Links reach existing Sales History, Purchasing, Cashbook/Closing, Expenses, Audit and Reports routes/workspaces. Local tab navigation uses the existing draft guard.

Order-cohort net sales are gross less discounts before refunds and include unpaid orders. Collected payments use actual collection timestamps; refund/reversal amounts use their own event timestamps. Outstanding payments remain separate. The overview explicitly disclaims profit and reconciled physical cash balance. Missing amounts render Unavailable, not zero; loading/offline/denied/error states do not render totals. `FinanceMetric` wraps large exact figures without narrowing them.

## 6. Sales history, immutable detail, refunds and reversals

Server filters, sorting, pagination and historical product breakdown remain. Historical order IDs/numbers, prices/variants/modifiers, discounts, creation/payment/refund times and actor/source references are retained. Legacy absent cashier, table, queue or refund times remain unknown. No current-menu reconstruction or updatedAt inference occurs.

Sales detail groups immutable item, payment, timeline, refund and reversal records. Completed-refund review identifies the actual collected payment, exact remaining refundable balance, positive whole amount, actual timestamp with offset and reason. Date validation rejects impossible dates/times, future events, events preceding collection and unsupported offsets. Backend caps and final authorization remain authoritative. Refund posting records money already physically returned and initiates no provider transfer.

Reversal review preserves the original refund and explains the actual correction event, server event time and finalized-period restrictions. New pending/uncertain holds block duplicate writes through local detail remount, require a successful current history read plus acknowledgement, retain retry keys and require a fresh action review. A 403 on the sale read clears private sale data rather than offering a forbidden retry.

## 7. Shopping versus Purchasing

Shopping remains its own route with item ID, decimal quantity and unit only. Stacked semantic rows replace fixed narrow inputs/hardcoded colors. No cost, payable, cash or expense field was added to planning. Saving/viewing plans does not change purchase recency. Copy-to-purchase remains explicit and leaves unit costs blank.

Purchasing retains actual offset timestamp/local purchase date, supplier, independent lines, units, exact costs, due date and invoice. Draft line totals use existing exact quantity-times-cost arithmetic; incomplete or fractional-currency results are shown as unavailable/errors, never rounded. Only reviewed confirmed submission creates an obligation. No automatic expense or cash settlement is added.

The original environment/restaurant UUID/user-scoped SecureStore attempt store is unchanged. It freezes the exact body/key before dispatch, survives restart/remount, retains ambiguous attempts, and blocks new purchases when recovery cannot be read. No second durable mechanism was introduced.

## 8. Suppliers, payables and payments

Supplier create/edit gains explicit review, stale-review invalidation and draft navigation protection. Reviews explain that historical supplier snapshots are retained. Existing contact/active fields and selection APIs remain. Supplier/payment records expose purchase source, actor, actual payment/reversal times and references. Obligations, effective paid and outstanding balances remain distinct.

Purchase payment review caps the exact amount at current outstanding balance and confirms actual money already paid. Cancellation/reversal preserve originals. Recovery reads the existing purchase/payment history; it never creates another purchase or blindly posts a second payment.

## 9. Expenses and payment history

Expense obligation recording, payment recording, corrections and template occurrences now require explicit payload review. The expense business date remains the current `expenseDate` contract; payment `paidAt` is separate, despite historical design date-time wording. Payee/category/description, exact obligation, effective paid/outstanding, payment/reversal and correction history remain visible. A template is inert until a supported actual occurrence is explicitly confirmed. Supplier inventory purchases are not duplicated as expenses.

## 10. Physical cashbook and daily closing

Cashbook explicitly remains consolidated restaurant physical cash, including driver-held cash, with actual dated signed events and traceable source/actor references. Positive/negative signs are visible text. Digital payments and unpaid orders do not enter totals; handover does not create a second consolidated receipt. Movement/opening review records actual events without adding custody or till accounting.

Missing opening leaves expected cash unavailable. Existing ordered missing-day/carry-forward rules, incomplete legacy inputs, meaningful acknowledgement/reason, exact variance, responsible actor/time, immutable finalized counts and newest-first reversals remain. Closing reversal itself moves no cash. `409 CASH_CLOSING_EXPECTED_CHANGED` invalidates the previous review, reloads, and requires reconciliation/current expected values and a fresh review. No automatic finalization or retry occurs.

## 11. Exact money, quantities, dates and timezone

No financial amount is converted to Number/parseFloat or used in floating-point currency arithmetic. Existing exact formatters and BigInt calculations are retained, including amounts above `9007199254740991`. Purchase quantities retain supported decimal precision and reject non-whole currency products/overflow. No tax, exchange-rate, currency conversion or silent rounding was added.

`FinancialPeriodFields` and `resolveFinancialPeriod` still support Day/Month/Year/inclusive Range, leap years, chronological dates and the 366-calendar-day limit. Added bilingual period labels and restaurant-local explanation. Blank Day remains server restaurant-today. Offset timestamps remain original values; device/browser timezone is not substituted. The illustrative calendar was not implemented as a new persistence/timezone model.

## 12. Reports, charts and unavailable inputs

Overview/summary/dashboard use existing endpoints. Summary displays exact obligations, effective dated payments, category totals and a clearly partial trading payment net. It is not a complete cash-flow statement. COGS/gross/net operating profit remain unavailable/null; no sales-minus-purchases profit is computed.

Existing daily/monthly backend series and BigInt-normalized bar proportions remain. Only bounded graphical proportions use Number; labels use original exact strings. An absent monthly series shows an empty statement rather than fabricated bars. Historical product sales include modifier amounts before order discounts/delivery fees; ranking does not modify Owner-curated Featured or introduce Best Seller.

## 13. Private CSV export

Existing detailed Sales, Purchase History and Financial Summary CSV endpoints/file utilities remain. A central accessible review captures the applied scope/fetch callback, explains complete filtered dataset versus visible page, and warns about private business recipients. Changed period/identity invalidates retained confirmation. No arbitrary column selection, physical-row preview or invented schema is presented. Server size/row limits and formula escaping remain unchanged.

Authentication, tenant scope, revocation/focus/background cancellation, private cache/share files and expiry cleanup remain. Staff/Driver cannot export even through a directly retained CSV component. Success feedback waits for the server result and successful local export/share preparation. No bearer-token export URL or public upload was introduced.

## 14. Audit and immutable corrections

Existing paginated/searchable/sortable audit displays recorded event/action/entity IDs, timestamps, actor when present, reason and original/replacement/reversal references. Posted records have no inline edit/delete controls. No financial originals or history entries were removed. Supplier edits do not rewrite purchase snapshots, and operational notifications remain separate from accounting audit.

## 15. Request identity and reconciliation evidence

`FinancialRequestKeys` retains its existing exact-body key mapping and adds session-only pending/uncertain holds. `begin` acquires a shared operation hold before dispatch; `settle` releases pending status. Settlement updates the key object independently of unmounted UI callbacks. A still-running action cannot be acknowledged/retried from a remounted form. While pending, a component-local render timer observes settlement; it sends no network request.

Unknown/network/timeout/5xx/protocol failures and conservative conflicts retain the original body/key. Definitive rejections release the hold. Authoritative history checks are read-only; failed reads retain the hold. Actual returned source records are shown, absence is explicitly not proof of failure, and manual acknowledgement precedes a fresh reviewed action. Reconciliation does not clear the retry key. These session holds do not claim restart durability for expense/refund/payment forms; only the pre-existing purchase attempt store supplies that guarantee.

## 16. Authorization and tenant isolation

Owner/Manager retain the actual FINANCE_READ/FINANCE_MANAGE grants; Staff/Driver gain none. Existing ScreenGuard checks the fixed tenant before route children mount. Workspace identity/role keys discard private UI state on sign-out/revocation, query scopes discard stale account/tenant responses, and mutation callbacks remain scope checked. A financial write or reconciliation read returning 403 hides retained expense, purchase, cashbook and closing details/actions. Child cash forms propagate denial to their parent ledger/history, without offering repeated forbidden actions. CSV has an additional direct role guard. Server membership/JWT/tenant checks remain the final authority.

Synthetic preview fixtures use separate A/B UUID namespaces and red/teal themes; denied-role queries throw in the adapter and are asserted absent. No global private financial cache or user-selected tenant was added. Frontend transport mocks/source inspection are not fresh hosted Spring/RLS acceptance.

## 17. Localization and accessibility

Reused semantic native Page/Card/Body/Action/FormField/Status/ConfirmDialog, runtime tenant tokens, safe-area/keyboard shell and draft navigation. New finance summaries, period controls, reviews and safeguards supply English/Burmese through the existing language hook or bilingual copy. Existing unchanged legacy labels remain; complete linguistic review is not claimed.

Large exact figures/long notes wrap; dialogs scroll, controls have labels and appropriate 48px targets, dynamic text scaling is retained, and status/signs use words as well as color. Synthetic red/teal and 320/720px, 100/200% static specimens were generated. Actual Android shaping, keyboard, TalkBack, focus return, safe areas and 200% device rendering are NOT RUN.

## 18. Synthetic regression matrix

PASS below means fresh frontend/helper/component/mock evidence only. Server/database semantics are preserved and inspected; they were not re-executed against a live or disposable backend in this frontend-only change.

| Requested cases | Result and evidence |
|---|---|
| 1–2 Owner/Manager access; Staff/Driver denial | PASS: existing navigation/access/ScreenGuard suites, 448 guarded previews, direct CSV role tests. |
| 3 foreign-tenant ledger/CSV rejection | PASS for scoped client error/path propagation and existing tenant guards; actual Spring/DB rejection NOT RUN. No fresh server claim. |
| 4 signout/role cleanup | PASS: existing auth/query/mutation/CSV cleanup suites, stale export-scope interactions, and new 403 purchase/expense/cashbook/closing private-detail removal tests. |
| 5–6 large exact amounts; decimal quantities/no rounding | PASS: finance overview, refund review, procurement format/review, shopping, cash variance and API-client suites. |
| 7–8 restaurant periods/366/leap/offset | PASS: financial-period, expense-cash, procurement-format and new sales-refund-review tests. Backend IANA/DST execution NOT RUN. |
| 9–10 sales versus collections/unpaid cash | PASS: distinct supplied server totals and explanatory UI, existing workflows/DTO client suites. Actual server aggregation NOT RUN. |
| 11 refund event dates versus collections | PASS: original/offset refund payload and timeline presentation; backend event aggregation source unchanged, server run NOT RUN. |
| 12–13 immutable snapshots; missing actor/refund time | PASS: sales/procurement screen fixtures and unknown legacy presentation; database immutability execution NOT RUN. |
| 14–15 plan no money event; copied blank costs | PASS: shopping-plan/shopping-screens suites preserve assertions. |
| 16–17 durable purchase recovery; replay/conflict | PASS: purchase-attempt persistence/remount/exact-body/key/read-failure/foreign scope tests; server changed-body transaction execution NOT RUN. |
| 18–19 purchase cap/reversals; supplier history | PASS: procurement format/screens/review, exact cap, preserved snapshots and read/ack/retry tests; backend correction transaction NOT RUN. |
| 20–21 expense obligation/payment/template | PASS: expense-cash screens plus new interactions require explicit reviews and exact cap, no automatic template posting. |
| 22–23 physical cash/digital exclusion/driver holdings | PASS: truthful consolidated UI and existing client/source contracts; backend totals/driver custody execution NOT RUN. |
| 24–26 missing opening/legacy gates/stale close/newest-first | PASS: missing-opening/expected-cash/variance UI, new 409 interaction and preserved newest-first history/copy; backend locking/sequence execution NOT RUN. |
| 27 refund reversal audit | PASS: exact remaining capacity after reversal and original/reversal UI history; server transaction NOT RUN. |
| 28–29 server report/null profit/exact chart labels | PASS: overview, sales-dashboard and empty/unavailable tests. |
| 30 CSV scope/size/formula/cleanup | PASS: client/export/share/cleanup and review tests. Formula escaping/server row limits inspected and unchanged; fresh server generation NOT RUN. |
| 31–32 rapid taps/unknown reconciliation | PASS: mutation gate, financial-request, sales/procurement/expense/cash interaction tests, including pending navigation/remount. |
| 33 validation/accessible confirmation | PASS: exact payload/amount/date/cap and explicit dialog interaction/semantic source tests. Actual screen-reader/keyboard acceptance NOT RUN. |
| 34 UXI-10 orders/queue/delivery/COD | PASS: full Operations and API-client regressions. No operational implementation edits. |
| 35 UXI-11 catalog/settings/QR permissions | PASS: full Operations suites and 160 catalog preview regression specimens. No management implementation edits. |

## 19. Verification outcomes

| Check | Actual result |
|---|---|
| Shared package builds | PASS: build:packages, also included in root typecheck and web build. |
| Root typecheck / root ESLint | PASS. Final Operations checks rerun after integration. |
| Root tests | PASS: 2,003 Vitest tests at the root-run snapshot, plus 45 Node tests. Later Operations tests supersede its 666-test snapshot, below. |
| Final full Operations tests | PASS: 702 Vitest tests / 61 files plus 6 Node tests; includes sales/history, shopping/purchase/supplier, expense/cash/closing, request/recovery, CSV, auth/navigation and UXI-10/11 regressions. |
| Other root suites | PASS: ui-tokens 12, API-client 243, Admin 220, Guest 330, Customer 532 Vitest tests; config 21, Customer 8 and root scripts 10 Node tests. These overlap root totals. |
| Admin and Guest production builds | PASS: npm run build:web. |
| Ordinary Operations starter export | FAIL: existing Firebase client/project/package mismatch for dev.restaurantplatform.starter.operations.staging.dev. Environment gate retained. |
| Isolated Operations Android JS export | PASS on final source: 1,739 modules, 32 assets, 5 MB Hermes bundle `index-0db5102939f33f15e1e83fd306a174b7.hbc`. Disposable development-fixture environment, no native prebuild/signing. Notifications/phone disabled and Firebase paths cleared only in that child environment. |
| Static source previews | PASS: 448 UXI-12, 160 UXI-11 and 168 UXI-10 generated specimens. |
| Browser visual comparison | BLOCKED: browser inventory/control tool timed out before a usable surface was returned. No implementation screenshot or pixel acceptance claimed. |
| Installed Android, TalkBack, native keyboard/share/SecureStore/device rendering | NOT RUN. |
| Maven/database tests | SKIPPED: no backend/API/schema source changed. Relevant service/security/test contracts inspected; no migration/database action. |
| Monolithic verify:frontend | NOT RUN as one command; applicable components were run separately and ordinary export failure reported. |
| Whitespace/scope | PASS: git diff --check and source path inventory. |

Ignored evidence logs: `target/uxi-12-packages.log`, `uxi-12-root-typecheck.log`, `uxi-12-root-lint.log`, `uxi-12-root-test.log`, `uxi-12-operations-final-test.log`, `uxi-12-operations-final-typecheck.log`, `uxi-12-operations-final-lint.log`, `uxi-12-web-build.log`, `uxi-12-starter-export.log`, `uxi-12-isolated-export.log`. Initial intermediate test harness/import failures were corrected; final passing runs above supersede them. Tests were not removed or weakened.

## 20. Visual artifacts and limits

`node scripts/operations-preview.cjs --finance` produces ignored `target/uxi-12-preview/index.html`, with actual Operations TSX through the existing React Native-to-DOM approximation. Fourteen finance specimens include overview, summary, sales dashboard/history, shopping, purchasing/recovery, purchase history/detail, payables, expenses, cashbook, missing-opening closing, audit and export. Synthetic APIs/auth/native/provider ports are blocked or mocked. No server was started for this mode after browser access failed.

SSR does not execute effects or controls. In particular the initial Purchasing route stays on its genuine secure-recovery checking state; separate history/detail specimens show supported records. Purchase draft/review, payment/refund/cash dialogs and recovery interactions are verified by tests, not visually accepted from closed static specimens. Figma screenshots are design references, not installed-app evidence. Browser/native screenshot acceptance remains BLOCKED/NOT RUN.

## 21. Existing release gates

The ordinary Firebase Android project/client/package mismatch remains unresolved. No private provider credentials, application IDs, notification configuration, signing, EAS or installed identity was changed. Hosted API/schema/migration parity, actual JWT/RLS/provider behavior, private sharing/storage, original media provenance and device acceptance remain reviewed release gates. No real financial record/refund or production screenshot/log was created.

## 22. Remaining design/backend gaps

- No inventory valuation/COGS/profit, double entry, trial balance, new Accountant role, tax/exchange calculations or provider refunds.
- No collection/cash chart series absent from current DTO, arbitrary CSV columns, physical-row preview, XLSX/PDF or export-schema API.
- No new till/driver custody ledger or cash handover money event.
- Nonpurchase request holds are session-only; existing purchase SecureStore restart recovery remains the sole durable purchase mechanism. Bounded history absence does not prove a write failed; manual authoritative reconciliation remains necessary.
- The illustrative date-time calendar remains deferred; validated current date/offset text fields preserve the accepted contract.
- Full Burmese linguistic/device accessibility and final visual review remain unverified. Source tests and JS export cannot close those gates.

## 23. UXI-13 prerequisites and stop boundary

Review this UXI-12 diff and its evidence. Later authorized integrated QA needs reachable browser/device surfaces, an approved synthetic/staging backend with tenant/role/CSV/cash transaction acceptance, hosted parity evidence and the existing Firebase/provider/native gates resolved by their operators. This report records prerequisites only; UXI-13 was not started.

STOP after UXI-12. No commit, push, merge or deployment was performed.
