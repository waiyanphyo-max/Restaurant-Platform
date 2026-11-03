# Shopping, purchases and supplier payables

These Spring APIs are under `/api/v1/restaurants/{restaurantId}/accounting`. Owner and Manager finance permissions are checked on every entry point; the backend derives actor identity. Every mutation requires an `Idempotency-Key` (1–120 letters, digits, period, underscore, colon or hyphen). A retry with identical payload returns the existing result. Reusing the key with changed payload is a conflict. Monetary values and decimal quantities are JSON strings to preserve exact precision in clients.

| API | Purpose |
| --- | --- |
| `GET/POST /suppliers`, `PUT /suppliers/{id}` | Search, create or correct supplier identity/contact and active status |
| `GET /suppliers/payables` | Confirmed obligations, net payments, outstanding amount, earliest unpaid due date by supplier |
| `GET /suppliers/{id}/payments` | Paginated payment history, including reversal reasons/actors/timestamps |
| `GET/POST /shopping/items`, `PUT /shopping/items/{id}` | Restaurant catalog; name, default unit/quantity, default supplier and suggestion preference |
| `GET /shopping/items?suggestionsOnly=true` | Only eligible automatic suggestions |
| `GET/POST /shopping/sheets`, `GET/PUT /shopping/sheets/{id}` | Daily planning sheets and audited corrections before posting |
| `GET/POST /purchases`, `GET /purchases/{id}` | Immutable confirmed obligations, historical line snapshots and chronological payments/adjustments |
| `POST /purchases/{id}/payments` | Record a real payment; cap at remaining obligation |
| `POST /purchases/{id}/payments/{paymentId}/reverse` | Append a payment reversal on the current restaurant-local day |
| `POST /purchases/{id}/cancel` | Append a reasoned cancellation, after all effective payments are reversed |
| `GET /purchases/report` | Confirmed/cancelled totals and monthly breakdown |
| `GET /purchases/export.csv` | Snapshot line export; maximum 10,000 lines, with spreadsheet-formula escaping |

List endpoints use `page` (zero based) and `size` (1–200). `from`/`to` are inclusive ISO dates. Set them equal for daily history, use month boundaries for a month, or supply a custom range of up to 366 days. Purchases, report and CSV accept `supplierId`, `item` and `paymentStatus=PAID|UNPAID|PARTIALLY_PAID`. `item` matches historical purchased names. Supplier, catalog and payables lists accept a name `search`. Inactive suppliers and items remain searchable and retain their history.

The API sorts the complete filtered result before pagination. The first sort listed for each endpoint is its default.

| Endpoint | `sort` values |
| --- | --- |
| `/suppliers` | `NAME_ASC`, `NAME_DESC` |
| `/shopping/items` | `NAME_ASC`, `NAME_DESC`, `LAST_PURCHASE_DESC` |
| `/purchases` | `NEWEST`, `OLDEST`, `TOTAL_DESC` |
| `/suppliers/payables` | `NAME_ASC`, `OUTSTANDING_DESC`, `DUE_ASC` |

Items without a purchase date and suppliers without an unpaid due date appear last when sorting by those fields. Report and CSV requests use the same filters as purchase history and cover the full matching range.

CSV has one row per historical purchase line. Purchase total, amount paid, outstanding amount and payment/cancellation histories are emitted once per purchase, on its first line; subsequent lines leave those fields blank. Line totals remain present on every line so spreadsheets can sum either financial level without multiplying purchase totals by the number of lines.

## Recognition and suggestion rules

Saving a shopping sheet only saves a **plan**. It never posts a purchase, expense, payment, cash movement, payable, latest cost or usage date. Confirming an actual purchase is a separate explicit `POST /purchases`. A linked `sheetId` can be posted once; actual purchase lines may reflect what was really bought. The sheet then shows `PURCHASED` or `CANCELLED` and its derived payment status. Posted sheet contents cannot be edited.

A purchase requires an actual `purchasedAt` timestamp matching `purchaseDate` in the restaurant timezone. Future confirmations are rejected. Backdated purchases are permitted. Their immutable item names, quantity, unit, unit cost and totals do not change when the catalog changes. Whole-currency unit costs multiply exact decimal quantities; non-whole results and overflow are rejected instead of rounded. `latestUnitCost` and `latestCostUnit` come from the latest confirmed, noncancelled purchase ordered by purchase date, purchase timestamp and recorded timestamp. Costs in different units must not be compared as if the units match.

Automatic eligibility is recalculated at read time from the latest confirmed, noncancelled purchase date. An enabled catalog item stays suggested for age 0 through 6 restaurant-local calendar days. At age 7 it leaves suggestions. Showing/selecting/saving a plan does not count as usage. A new confirmed purchase reactivates its catalog items, with creator/update metadata and a catalog reactivation audit event; the new purchase's actual local date determines whether it is recent enough to be suggested. A never-purchased item remains searchable and can be manually selected. Backdating and cancellation consistently recalculate the usage date against remaining confirmed history; no scheduler or destructive expiry is required.

## Payments, cancellations and corrections

`PaymentInput` contains whole-currency `amount`, `method=CASH|BANK_TRANSFER|CARD|OTHER`, and actual `paidAt`. Only confirmed purchases create obligations. `PAID`, `PARTIALLY_PAID`, and `UNPAID` are derived from unreversed payment sums. Payment and reversal rows are append only. Payments cannot precede the purchase date or exceed its remaining total; cancelled purchases reject payment. No payment-provider integration is implied.

To correct a posted purchase, reverse each effective payment, cancel the original with a reason, and confirm a replacement with `correctionOfId` and `correctionReason`. The original snapshots, payments, reversal events, cancellation, creator and correction links remain visible. Cancelled purchases contribute no obligation or suggestions. Their historical cancelled totals remain separately reportable. Cancellation cannot silently erase paid cash: effective payments must be reversed first. Cashbook uses each original cash payment on `paidAt` and its opposite reversal on the reversal's `created_at`; digital payments stay separate. The shared restaurant transaction lock and finalized-day check prevent backdated payments from changing finalized cash balances. Successful idempotent retries remain safe after closing.

Purchase details expose receipt ID, invoice reference, supplier name snapshot, due date, creator and recorded timestamp. Optional `receiptId` must reference a receipt owned by this restaurant; use the private accounting receipt upload/view API. Supplier history and purchase history preserve records even when the supplier's current contact details change. Purchase cash outflows are not automatically COGS or operating expenses.

## Example confirmation

```json
{
  "purchaseDate": "2026-11-02",
  "purchasedAt": "2026-11-02T09:30:00+06:30",
  "supplierId": "00000000-0000-4000-8000-000000000001",
  "lines": [{
    "itemId": "00000000-0000-4000-8000-000000000002",
    "quantity": "2.5", "unit": "kg", "unitCost": "1000"
  }],
  "invoiceReference": "INV-2026-11-02"
}
```

`20261102092000_accounting_procurement.sql` is forward only and depends on the accounting foundation migration. It enables RLS, revokes direct browser roles, adds restaurant-scoped composite foreign keys and prevents updating or deleting posted purchases/payments/adjustments. Apply migrations through the normal reviewed deployment workflow; the API does not apply production migrations. Hibernate's existing `ddl-auto: validate` remains unchanged.
