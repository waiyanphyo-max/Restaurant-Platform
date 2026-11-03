# Sales dashboard and historical ledger

Financial access requires `FINANCE_READ` or `FINANCE_MANAGE`, granted only to restaurant Owners and Managers. Staff retain their existing operational payment permissions; those collection workflows now preserve the actual cashier/driver identity. Anonymous checkout creators and previously unrecorded actors stay null.

All monetary responses use base-10 integer **strings** in the restaurant's existing whole-currency convention. Amounts in Java/database aggregation use exact integers/numeric values. Fractions are rejected; clients must not parse money with `Number` or `parseFloat`. Quantities/order counts are numbers. Requests continue to accept whole integer amounts, including decimal strings accepted by the typed integer DTO. No payment provider or transfer integration is introduced: posting a refund records a refund that a member has already completed.

## Endpoints

All routes begin `/api/v1/restaurants/{restaurantId}/accounting/sales`.

| Method | Suffix | Behavior |
|---|---|---|
| GET | `/dashboard?date=2026-11-02&month=2026-10&year=2026` | Today's totals; selected day, month and year; zero-filled daily/monthly trends; selected-month top products; precise metric definitions. Each selector is optional. |
| GET | `/ledger?month=2026-10&page=0&size=20` | Paginated historical orders with independent line/payment/refund collections and chronology. |
| GET | `/ledger/{orderId}` | Exact snapshots, original timestamps, payment/cashier records, cancellation/status history, and refund adjustments. |
| GET | `/products?month=2026-10&search=Rice&page=0&size=20` | Product ID/historical-name grouping, quantities and historical line subtotals. |
| GET | `/ledger.csv?month=2026-10` | Filtered authenticated CSV download. |
| POST | `/ledger/{orderId}/refunds` | Record a completed refund using `Idempotency-Key`; body: `paymentId`, positive whole `amount`, exact `refundedAt` with offset, and nonblank `reason`. |
| POST | `/ledger/{orderId}/refunds/{refundId}/reverse` | Append a full correction using `Idempotency-Key` and nonblank `reason`; the original refund remains visible. |

Ledger, product and CSV requests accept exactly one of `date`, `month`, or the complete inclusive `from`/`to` pair. Omitting all dates selects today in the restaurant's timezone. Supported ranges contain at most 366 calendar days. Page sizes are 1–200. Ledger/CSV additionally support `product` (historical product name or ID), `order` (display number or ID), exact `channel`, and accounting `paymentStatus`: `UNPAID`, `PARTIALLY_PAID`, `PAID`, `PARTIALLY_REFUNDED`, `REFUNDED`, or `CANCELLED`. Searches are server-side and escape SQL wildcard characters. Channel codes are `TABLE_QR`, `COMMON_QR`, `STAFF`, and `CUSTOMER_APP`.

Ledger and CSV accept `sort=NEWEST|OLDEST|HIGHEST_TOTAL`. The ledger defaults to newest first and CSV to oldest first. Product breakdown accepts `sort=MOST_SOLD|HIGHEST_SALES|NAME`, defaulting to quantity sold. Sorting applies before pagination to the complete filtered result.

## Definitions and accounting basis

- **Gross sales:** immutable stored order subtotal plus delivery fee, before order discounts, for noncancelled orders created within the selected restaurant-local period.
- **Discounts:** stored order discounts for that same noncancelled created-order cohort.
- **Net sales:** gross sales minus discounts, before refunds. This includes unpaid orders; it is never used as cash collected.
- **Collected payments:** original payment amounts in status `PAID` or legacy `REFUNDED`, dated by actual `paid_at` within the period. This is a payment-date measure and can include orders created outside the period. Refunds do not erase the original collection.
- **Outstanding payments:** sum of each noncancelled order's `max(order total − all confirmed original collections, 0)` in the created-order cohort. Refunds do not reopen a receivable. Failed/pending payment attempts are not collections.
- **Refunded amounts:** immutable recorded refund outflows dated by exact `refunded_at`, minus reversal inflows dated by their actual correction posting timestamp, within the period. This can be negative when correcting an older refund; the older period retains its original refund.
- **Order count/quantity:** noncancelled order count and sum of order-item quantities for the created-order cohort. Cancelled order count is separate. An amount-only refund does not fabricate returned product quantities.
- **Product sales:** sum of historical item subtotals, including modifier charges and before order discounts/delivery fees. Different historical names for one product remain distinct groups.

Order recognition follows creation time and current cancellation status, so cancellation restates the original created-order cohort. This is an operational sales basis, not a certified accrual recognition policy. Exact cancellation timestamps/actors/reasons remain visible in the immutable status timeline; no timestamp is inferred from `orders.updated_at`. Gross/net sales and payment-date collections must not be added together. SQL aggregates orders, items, original payments and refunds separately to avoid multiplication from one-to-many joins.

Day boundaries use the restaurant's IANA timezone and local start-of-day plus next-day start-of-day, including daylight-saving changes. The dashboard returns the timezone and configured currency. Calendar dates are inclusive at the API boundary; SQL timestamp ranges use an exclusive upper bound.

## Historical integrity and gaps

Order-item product/variant names, prices, quantities, subtotals and modifier snapshots are read directly from checkout records; the live menu is never joined for historical names/prices. Database triggers prevent update/delete of snapshots, deletion of original orders/payments and changes/deletion of status history. Order financial totals, original creation time/channel/type/creator, and captured table/queue labels are protected. New orders capture table/queue display labels; old orders retain IDs but show a missing label where it was never recorded, instead of substituting today's label.

Checkout currently has **order-level discounts only**. `lineDiscount=0` does not claim an allocation: the original order discount is shown independently, and line totals stay before that order discount. No guess is made about per-product discounted net revenue.

Old `REFUNDED` payment rows have no reliable refund event timestamp. Their amount is returned as `legacyRefundsWithoutEventTime` for the original created-order cohort, excluded from dated refund totals; their original collection is included only where an actual `paid_at` is available. An unknown old refund date is never replaced by order creation/update time. Previously unrecorded collector identity remains null.

Refund writes are transactional and append-only, retain the paid original, lock the tenant/payment and cap cumulative refunds at that payment's actual collected amount. A refund requires original `PAID` status, a recorded collection timestamp, matching payment method, a timestamp at/after collection and at/before now, and a correction reason. Reusing a request key with the identical payload returns the original record; changing the payload conflicts. Duplicate parallel requests cannot post twice. Cash refunds and original collections cannot post into a finalized cash day or change a later closing's carry-forward; affected closings must first be explicitly reversed.

Counter/delivery collection and checkout/cancellation acquire the accounting tenant lock before order/stock row locks. The database collection guard also validates new collected payments across methods, prevents cancelled-order/over-collection, rejects payment amount/reference edits and enforces cash closed-period safety. This avoids a caller bypassing invariants through an older collection route.

Erroneous recorded refunds support a controlled full reversal with a reason and current server posting timestamp (`clock_timestamp()`, taken after lock acquisition). Each original refund can be reversed once. The original refund stays immutable; the reversal appears in the ledger, chronological detail, CSV and audit trail. A reversed refund frees the original payment's refund capacity for a future correctly recorded refund; a new refund cannot be backdated before a correction that restored that capacity. Cash reversals create a separate cash receipt in the open posting day and cannot change finalized day balances; digital reversals remain separate from physical cash. No provider transfer is initiated by recording either event.

CSV is limited to 5,000 orders and 20,000 item rows per export; larger selections must be narrowed. CSV cells are escaped and spreadsheet formula prefixes neutralized. Order totals/discounts and payment/refund/timeline detail appear only on the first item row for each order, preventing repeated order totals in spreadsheet sums. Original item IDs, names, prices, variants and modifiers remain present. Export requests retain all server filters and never send auth tokens in URLs. Native exports use private app cache files with five-minute cleanup; browser exports use a temporary object URL. Financial screens keep query data in memory and use the existing role/session guards.

Reliable inventory consumption, opening/closing stock valuation, recipe costing and refund-to-product quantities are not present. These inputs are required for reliable COGS/gross profit/net operating profit and must not be inferred from sales or shopping purchases. See the shared financial report documentation for the labeled cash-flow/expense summary.

## Deployment and verification

Migrations are forward-only and must be reviewed/applied through the existing Supabase deployment process; the application retains Hibernate `ddl-auto: validate`. This implementation does not apply production migrations. New refund data has restaurant-scoped foreign keys, RLS enabled and all direct `PUBLIC`, `anon` and `authenticated` privileges revoked.

Sales transport tests cover exact money above JavaScript's safe integer range, server filters, invalid calendars, authenticated CSV content handling and stable refund keys. Shared real-database checks cover multiple order lines and split payments, historical price/name persistence, refund replay/caps, cash closing protection and tenant integrity. The primary migration/schema suite targets PostgreSQL 17 in Docker. A disposable PostgreSQL 16 compatibility check may omit only unsupported historical `MAINTAIN` privilege tokens in temporary SQL copies; accounting migrations and source migration files remain unchanged.
