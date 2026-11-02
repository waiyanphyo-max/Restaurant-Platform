# Shared restaurant accounting

Implemented 2026-11-02 in the shared Spring API, typed API client, and Owner/Manager Operations app. Domain references: [sales and historical ledger](accounting-sales.md), [shopping, purchases and suppliers](accounting-procurement.md), [expenses and cash closing](accounting-expenses-cash.md).

## Access and installation

`FINANCE_READ` and `FINANCE_MANAGE` belong only to Owner and Manager. Services resolve current JWT identity and restaurant membership for every request, including CSV, audit and private receipt downloads. Staff and Driver retain their existing operational collection permissions without gaining accounting access. Forged client roles do not grant access.

Review and apply the forward-only migrations `20261102090000` through `20261102101000` through the existing deployment procedure. No application startup migration runner was added; production migrations are never automatically applied. Hibernate remains `ddl-auto: validate`. New accounting tables use explicit SQL repositories within Spring transactions; existing JPA order/payment mappings remain validated.

All new tables have RLS enabled, with no direct client policies or public/anon/authenticated table privileges. Posted financial records, receipts, request keys and audit entries reject update/delete. Cross-restaurant references use composite foreign keys. Catalogs and unposted shopping plans are editable with actor, timestamp and correction reason in the audit history.

## Monetary and period rules

Amounts preserve the existing whole-currency convention: PostgreSQL `BIGINT`, Java `long`, and exact `BigDecimal` arithmetic. Accounting HTTP responses serialize monetary totals as base-10 integer strings, including values above JavaScript's safe integer limit. Counts remain numeric. Fractional JSON values cannot silently truncate into integer amounts. Decimal purchase quantities support six decimal places; a quantity multiplied by unit cost must produce an exact whole-currency line total. No implicit rounding, unit conversion or division by 100 occurs.

Date filters use inclusive `from`/`to` restaurant-local dates, converted to half-open timestamp intervals by IANA timezone rules. Maximum range is 366 calendar days, including a full leap year. Blank endpoints default to one local day. Sales/purchase screens also accept month/day selectors. Historical timestamps come from `created_at`, `paid_at`, `purchased_at`, `refunded_at`, or recorded reversal events, never an unrelated last-update timestamp.

Currency and timezone changes are prevented once orders or accounting audit history exist. A future policy change requires an explicit migration/design preserving the old interpretation; changing a settings label cannot reprice or redate posted history.

## Sales definitions

| Metric | Definition |
| --- | --- |
| Gross sales | Stored order subtotal plus delivery fee, before discount, for noncancelled orders created in the period. |
| Discounts | Stored order-level discounts on the same order cohort, counted once per order. |
| Net sales | Gross sales minus discounts, before refunds; includes unpaid orders and does not claim accrual revenue recognition. |
| Collected payments | Original PAID/legacy REFUNDED collections with authoritative `paid_at` inside the period. This uses payment dates independently of order dates. |
| Outstanding | Sum of each noncancelled cohort order's nonnegative total less confirmed collections. Refunds do not reopen receivables. |
| Refunded amounts | Refund outflows dated by actual refund time, less controlled reversal inflows dated by the reversal event. A reversal in a later period never erases the original dated outflow. |
| Orders / products sold | Noncancelled cohort order count and stored item quantities. Cancelled counts are separate. Amount-only refunds do not invent returned quantities. |
| Product sales | Historical line subtotals including modifiers, before order discounts and delivery fees. Historical names remain separate if a product was renamed. |

Orders, items and payments are aggregated independently before combining results, preventing join multiplication. Daily/monthly trends include zero-activity periods. The ledger retains cancelled orders, payment history, refund entries, refund reversals and chronological status events. Checkout item/modifier prices and names are immutable; table/queue labels are snapshotted for new orders. Existing missing label/cashier snapshots remain unknown.

The existing schema has only order-level discounts. Ledger `lineDiscount` is explicitly zero; the actual discount remains on the order. No allocation is fabricated. Current cancellation state restates order-cohort totals; the original cancellation event remains visible in transaction detail.

## Plans, obligations and expenses

Saving or selecting a shopping plan creates no purchase, payable or expense. Confirmation creates immutable purchase headers/lines containing item/supplier snapshots and costs. Purchase payments are independent append-only records; payment reversals retain the original payout and record the opposite movement at reversal time. A purchase cannot be cancelled until its payments have been explicitly reversed. Corrections cancel the original and link a replacement purchase.

Suggestions derive from the latest confirmed, noncancelled purchase date. Ages zero through six local calendar days are eligible; day seven disappears automatically without deleting the catalog or history. Display/selection/plan edits never refresh that date. A new confirmed purchase re-enables suggestion eligibility; a backdated purchase still uses its actual local purchase date. Cancellations recompute eligibility from remaining confirmed history.

Only confirmed supplier obligations contribute to payables. Supplier payment history reads the canonical purchase-payment records rather than creating a second payment ledger. Operating expense categories are separate from inventory purchases. Recording a purchase does not also create an operating expense. Recurring expense templates create no automatic postings: each valid occurrence requires explicit confirmation, with a unique occurrence constraint.

## Cash closing and corrections

The cashbook represents consolidated restaurant cash, including cash held by delivery drivers. Count all custody balances before closing; this is not an individual till/handover ledger. Digital collections are excluded. Expected close equals opening plus actual cash sales and other cash receipts, less cash refunds, purchase/expense cash payments and other outflows. Unpaid orders contribute no cash.

An initial counted opening starts the book. Subsequent openings require the previous calendar day's finalized actual count; close missing days in sequence, including zero-activity days. A finalized close retains expected/count/variance, responsible member, timestamp and revision. Changes require a reasoned reversal and a new revision. Later closings must be reversed before earlier ones. Cash postings into any finalized period or its carry-forward chain are blocked. Known incomplete legacy inputs require explicit acknowledgement and a reconciliation reason before closing, retained with the original closing.

The restaurant transaction lock serializes posting, collection, refunds and closing. Existing collection services acquire it before row locks, and a database trigger also protects collection amounts/transitions and finalized cash dates. Transaction-safe request keys reject changed-body reuse and roll back with failed actions. Clients retain a stable key when retrying the same financial action; a new key identifies a new intended action.

## Reports and missing accounting inputs

`GET /accounting/reports/summary` returns sales totals, confirmed purchases, registered operating expenses by category, net dated purchase/expense payments, and a clearly labelled trading payment net. It includes both cash and noncash settlements and excludes other capital/cash movements. It is not profit.

`costOfGoodsSold`, `grossProfit`, and `netOperatingProfit` remain **null**. The backend lacks opening/closing inventory valuation, recipe/yield costs, stock consumption/cost layers and a complete accrual recognition policy. Purchases cannot establish what was consumed or sold. The UI displays these missing inputs instead of calculating sales minus shopping as net profit.

Historical legacy REFUNDED payments lack an authoritative refund timestamp. They remain identifiable, with original collections retained when `paid_at` exists; dated refunds are not inferred. Older missing cashier identities and table/queue labels are not backfilled from current members or configuration.

## Shared endpoints

All paths below are relative to `/api/v1/restaurants/{restaurantId}/accounting`.

| Routes | Purpose |
| --- | --- |
| `/sales/dashboard`, `/sales/ledger`, `/sales/ledger/{id}`, `/sales/products`, `/sales/ledger.csv` | Sales summaries, complete paginated history, breakdown and filtered export. |
| `/sales/ledger/{id}/refunds` | Record an already completed, reasoned refund against a collected payment; no provider integration. |
| `/shopping/items`, `/shopping/sheets` | Persistent catalog and editable unpurchased plans. |
| `/purchases`, `/purchases/{id}`, `/purchases/report`, `/purchases/export.csv` | Confirmed purchase history, totals, detail and export. |
| `/suppliers`, `/suppliers/payables`, `/suppliers/{id}/payments` | Supplier register, obligations and canonical payment history. |
| `/expenses`, `/expenses/report`, `/expense-templates` | Incurred expenses, dated payments, reports and explicitly confirmed recurrences. |
| `/cashbook/daily`, `/cashbook/transactions`, `/cashbook/closings`, `/cashbook/openings`, `/cashbook/movements` | Cash reconciliation, opening/count and controlled history. |
| `/reports/summary` | Verifiable payment-flow and expense summary with unavailable profit inputs. |
| `/audit?entityId=...&page=0&size=50` | Tenant-authorized immutable audit history. |
| `POST /receipts`, `GET /receipts/{id}` | Private PNG/JPEG/WebP/PDF attachment upload/download. |

Every new mutation requires `Idempotency-Key` (1–120 letters/digits or `. _ : -`). Use a new key for a new intended action. Receipt upload uses multipart `file`, a maximum of 5 MiB, and content signatures. Receipt downloads require finance authorization, are sent as attachments with `nosniff` and `private, no-store`, and have no public storage URL. Receipt references on purchases/expenses must belong to the same restaurant.

History lists have server-side filters and pagination; exports apply the complete bounded filter range independently of the loaded page. CSV cells are quoted and protected against spreadsheet formula injection. See domain references for request DTO fields and correction endpoints.

## Verification

Unit/HTTP tests cover finance role boundaries, spoofed membership/tenant denial, exact large amounts, fractional amount rejection, decimal quantities, CSV escaping, DST/leap-year ranges, recurring dates and reconciliation rules. The PostgreSQL migration suite applies migrations to a disposable PostgreSQL 17 Docker database, validates Hibernate mappings, and runs shared real transaction checks. On machines without Docker, `AccountingLocalPostgresTest` can explicitly target a pre-migrated disposable `jdbc:postgresql://127.0.0.1:<port>/accounting_verify` using `ACCOUNTING_TEST_DATABASE_URL`; remote URLs are rejected.

Local PostgreSQL 16 verification uses a temporary compatibility copy removing only unsupported `MAINTAIN` tokens from older privilege migrations. Accounting migrations run unchanged. This does not substitute for the exact PostgreSQL 17 migration suite in CI. No live Supabase production migration or native Android device acceptance is implied by local tests.

Local verification on 2026-11-02: full Maven verification completed with 280 tests, no failures/errors and seven Docker-only skips; the final request-parameter validation checks then passed all nine affected HTTP/error tests and rebuilt the backend artifact. Fresh PostgreSQL 16 migration, accounting transaction, supplier/purchase, receipt and Hibernate checks passed. Full frontend typecheck, lint and tests passed, and both Android starter bundles exported successfully; the operations bundle was exported again after the final refund-correction screen changes. The disposable database server was stopped afterward.
