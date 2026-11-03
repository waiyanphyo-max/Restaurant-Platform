# M9 Manager Operations Android acceptance

Reviewed on 2026-11-03 in Asia/Bangkok on `rebuild/m9-manager-android`.

## Delivered workflows

| Area | Manager workflow |
| --- | --- |
| Daily operations | The dashboard shows the restaurant's local operating day, orders needing attention, pickup tickets, deliveries and unread updates. The daily report separates order totals from payments collected. Individual dashboard sections can report unavailable data and be refreshed. |
| Orders, menu and payments | Filter operational orders and open item snapshots and status history. Create a dine-in or takeaway counter order with the published menu, active tables, quantities, variants and modifiers. Spring validates current catalog data, stock, prices and transitions. Confirm counter cash separately. Owners and Managers share the existing menu management controls. |
| Delivery and notifications | Assign or reassign a delivery to an eligible member in any restaurant role, including yourself. Default-driver settings remain specific to Drivers. Staff and Drivers can access only their own delivery tasks. COD completion records cash, delivery and order changes together. Updates show notifications addressed to the user and linked to this restaurant. |
| Sales and ledger | Owner and Manager use the same day, month and year report, charts, top products and CSV exports. Gross sales, discounts, net sales before refunds, collections and dated refunds remain distinct. Search detailed history by product and reporting period, and inspect stored timestamps, quantities, historical prices, variants, modifiers, channels, payment status, cancellations, refunds and known cashier identities. |
| Shopping and purchases | The shared catalog and shopping sheets support selecting saved items, entering units and prices, selecting suppliers and confirming purchases. The server computes restaurant-wide suggestion eligibility from confirmed purchases. Day seven drops an item from suggestions while search and history keep it available. Another qualifying purchase restores the suggestion for both roles. Purchase history includes saved quantities, costs, suppliers, payment status and receipt references, with server-filtered CSV. |
| Expenses | Record and inspect categorized expenses and their payments across day, month, year or custom periods. Link private receipt IDs where available. Audited correction confirms a reasoned cancellation and linked replacement. Purchase obligations remain separate from operating expenses. |
| Cashbook and closing | Reconcile opening cash, receipts and payouts against expected closing cash. Review and confirm counted cash and optionally record a variance explanation. Historical missing inputs require acknowledgment and a reconciliation note. The server detects stale previews and retains closing revisions and reversals. |
| Accounting reports | The shared report views cover revenue, product sales, transaction history, purchases, expense categories, cash movements, suppliers and payables. Exports are authorized and bounded by the selected period. The trading payment summary is a partial cash-flow view. Verified profit figures remain unavailable while inventory valuation and cost of goods sold are missing. |

## Role and tenant checks

The branded Android build verifies a server membership for its embedded restaurant before mounting the workspace. It sends that restaurant in business requests. Spring resolves each request's permission and resource scope from the validated JWT subject and current database membership. A Manager cannot mount the Owner Team screen, transfer ownership, manage members, or access Platform Admin through a restaurant role. Staff and Driver cannot use the accounting routes. Owner and Manager have the same finance grants under the current policy, including confirmed, audited corrections and closing actions. See the [role-permission matrix](role-permission-matrix.md) and [accounting contracts](accounting.md).

## Operational limits

- The Android expense form links a private receipt by ID. Direct file upload and retrieval use the authenticated Spring receipt API.
- Financial posting uses server idempotency for retries with the same key and payload. The mobile workspace retains keys in memory. Counter order creation prevents duplicate taps and prompts the user to check Orders after an ambiguous response. The existing counter POST has no persistent replay key.
- Older data can lack an authoritative cashier, refund timestamp or label. The ledger displays available historical data and preserves unknown values.
- Live Supabase sign-in, physical-device UI, native sharing and offline recovery on a device remain separate smoke checks.

## Verification

| Check | Result |
| --- | --- |
| Frontend workspace tests | 622 passed, including 199 Operations Android tests and 71 API-client tests. The API-client suite includes loopback HTTP integration. |
| Workspace TypeScript and lint | `npm run typecheck` and `npm run lint` passed. |
| Spring Maven verify | 297 passed and eight Docker-only tests were skipped because the Docker engine was unavailable. Zero failures and errors. |
| Disposable PostgreSQL 16.4 | All 11 local accounting, procurement, receipt and Hibernate checks passed. All accounting migrations ran unchanged. Temporary copies of two older privilege scripts omitted PostgreSQL 17's `MAINTAIN` privilege for this local run. |
| Operations Android bundle | Metro and Hermes exported the Android JavaScript bundle with the development fixture. |
| Android device availability | ADB found no attached device. The SDK reported no configured Android virtual devices. |

The frontend checks include counter-order variants and modifier quantities, request paths, same-mount duplicate prevention, loading and offline states, shared finance routes, date-pinned export, exact whole-currency values, receipt references and cash closing notes.

The backend checks cover ownership-transfer denial, Staff and Driver finance denial, forged claims, cross-restaurant isolation, assignment eligibility and assigned-only delivery actions. The local database scenarios compare Owner and Manager report results, preserve historical prices and date filters, test shopping suggestion expiry and reactivation across roles, and exercise concurrent request replay, payables, expense correction and cash reconciliation. The disposable database server was stopped after verification.
