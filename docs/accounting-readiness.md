# Historical accounting readiness after M8-A

This document records the earlier M8-A audit. Shared accounting has since been implemented; use [current accounting documentation](accounting.md) for live contracts, permissions, screens and known limitations.

Source audit: 2026-11-02. M8-A implements restaurant operations only. No shopping, purchase, expense, supplier, cashbook, ledger, or financial-report tables, migrations, routes, or screens were introduced. The detailed [API gap report](accounting-api-gap-report.md) and type-only [proposed contracts](../apps/operations-mobile/src/features/accounting/contracts.ts) remain design inputs rather than live APIs.

## Existing financial data sources

Spring's restaurant order list/detail retains order IDs, channel/type, creation timestamps, status history/actor UUIDs, discounts and total amounts. Stored item and modifier names/prices, variant names and quantities are historical checkout snapshots. Menu/category/variant edits must not reprice those records. Separate payment reads expose method, authoritative status, amount, createdAt and paidAt. Counter collection is an existing idempotent operation; COD delivery requires explicit cash confirmation and changes order, delivery and payment atomically.

The daily operations report counts orders by creation time and sums non-cancelled order amounts. Its paid amount uses payment paidAt during an independently resolved restaurant-local day. It is not a recognized-sales ledger, cashbook balance or profit statement. M8-A displays operational records without synthesizing financial totals.

## M8-B prerequisites: financial backend

Before exposing accounting, agree the recognition policy for sales, returns and cancelled/failed deliveries; reconcile manager/customer cancellation differences. The manager cancellation service currently does not release stock or cancel pending payments like the customer cancellation path. Paid cancellation cannot imply a cash refund. Add dated, source-linked sale/collection/refund and correction events, historical currency/scale/policy snapshots, and collector identity for new collections. Do not fabricate missing historical actors or monetary precision during backfill.

Add explicit OWNER/MANAGER accounting read/write/close/correct/export/audit grants. Existing ORDER_READ/PAYMENT_READ include STAFF and therefore cannot secure accounting. Every route, download, attachment and aggregate must revalidate Supabase JWT identity, current restaurant membership and the specific permission; never accept request actor IDs as authority.

New forward-only database contracts are needed for persistent shopping items, purchase headers/lines/receipts, suppliers and payment allocations, incurred operating expenses and their payments, cash accounts/movements/days/closings, immutable corrections and audit events. Use mandatory restaurant IDs, scoped compound references/indexes, private receipt storage, controlled database privileges and RLS where applicable. Apply no production migrations automatically. All linked resources must be checked within the same restaurant, including export/receipt IDs.

Financial writes need durable idempotency scoped by tenant, actor, operation and request hash; locking/version checks must prevent concurrent overpayment, double posting and closing races. Idempotency replay must return the same result; reused keys with different bodies must fail. Posted records remain immutable; correction/reversal records link to the original, retain server actor/time/reason and update dependent aggregates atomically. Draft edits and catalog deactivation must not erase posted history.

Smart Daily Shopping needs a persistent searchable/reactivatable catalog, canonical units, decimal quantities, purchase snapshots and restaurant-local dates. Seven-day inactivity suggestions derive from posted, non-reversed purchases, using creation date for never-purchased items. Drafts and reversed purchases must not reset the activity date.

## Sales, collections, purchases and expenses

An order's existence or COMPLETED status does not prove payment. Recognized sales and collected cash use different events and dates. CASH_AT_COUNTER and CASH_ON_DELIVERY remain separate operational methods; driver collection is not evidence of transfer into the restaurant till. Preserve original paid amounts and separately date reversals/refunds. Do not infer actual cash custody or balance from a page of payments.

A posted purchase records goods and a payable obligation; it is not necessarily a cash payout or recognized expense. Purchase payment allocations settle that obligation and create one canonical disbursement/cash movement. Supplier payments and purchase payments must share the same allocation records to prevent duplicate cash counting. Operating expenses such as rent and utilities are separately incurred and paid; reports must distinguish expense recognition from cash settlement. Purchases alone do not establish inventory consumption or cost of goods sold.

Cash closing needs an explicitly approved opening balance/carry-forward policy and custody/handover workflow. Expected closing equals opening plus actual receipts minus actual payouts; counted cash and variance require a dated, audited close. Internal transfers create linked opposite movements and never count as revenue or expense. Closed days require explicit corrections, retaining each original count and close.

## Monetary and timezone rules

Legacy amounts are PostgreSQL BIGINT/Java long JSON numbers. The current source does not establish a universal minor-unit scale: preserve whole-currency operational amounts without dividing by 100. M8-A validates safe nonnegative integer inputs and refuses misleading display of unsafe integers. Financial contracts should transport integer amounts as strings with explicit currency and scale, and decimal quantity/unit-cost values as strings backed by PostgreSQL NUMERIC/Java BigDecimal. Define rounding and precision limits on the server. Never silently reinterpret old rows or mix currencies/scales.

Posted transactions need effective local date, UTC/offset instant, restaurant timezone and policy version. Daily/monthly/yearly queries use IANA restaurant-local calendar boundaries and half-open intervals, including DST and historical policy changes. Device timezone and fixed 24-hour arithmetic cannot determine reporting periods. Currency/timezone configuration is currently mutable: lock or version financial policies before posting, and document ambiguous historical backfills rather than guessing.

## M8-C prerequisites: accounting UI

Activate shared OWNER/MANAGER modules only after M8-B supplies implemented versioned contracts, capabilities and backend permission tests. Keep current Shopping/Accounting navigation unavailable until then. Reuse common forms, query/mutation handling and tenant-locked transport; do not create separate ledgers for different screens. Show unavailable/incomplete states when recognition, valuation or aggregate sources are missing, instead of displaying zero or fabricated profit.

Required backend-backed UI modules include detailed sale/item/payment/refund history; day/month/year sales and collected-cash reports; persistent shopping and purchase history; expenses and payments; supplier obligations/allocations; cash movements and daily reconciliation; auditable corrections; date/search filters and CSV export. Aggregates/exports must represent the complete authorized range, not loaded pages. Exports need consistent currency/scale/timezone metadata and spreadsheet-formula injection handling. Read/unread operational notifications are not an accounting audit trail.

Acceptance must cover all role and cross-tenant denials, large money precision, restaurant-local boundaries, paid cancellation/refund separation, concurrent posting/payment/closing, stable retry keys, correction history, private receipts, and network/session interruptions. Live Supabase/database and Android device results must be reported separately from mocked service/client tests and JavaScript export.

## Optional future journal mappings and M9.5

If later justified, source events can map to double-entry journals: cash collection to Cash/Receivable, purchase obligation to Inventory or approved expense/Payable, payable settlement to Payable/Cash, and recognized sale to Receivable/Revenue with separate tax and cost recognition. These are conceptual mappings, not implemented accounting policy. Event IDs, currency, effective dates, actors and reversal references should permit future mapping without changing historical operations.

Advanced double-entry ledger, Chart of Accounts, Trial Balance, Balance Sheet, bank reconciliation, complex taxes, valuation/cost layers and M9.5 advanced accounting remain optional and deferred. Inventory valuation/COGS, recipes, waste and reconciliation completeness are prerequisites for reliable profit. Do not ship advanced statements merely because operational totals are available.
