# M8 acceptance report

Verified on 2026-11-03 in Asia/Bangkok on branch `rebuild/m8-owner-accounting`.

## Phase gates

| Phase | Delivered and verified |
| --- | --- |
| M8-A · Owner Android operations | Preserved the existing Owner and Manager workflows. The Operations baseline passed 3 build-configuration checks and 145 mobile tests. The focused Spring rerun passed 26 role, tenant, service and HTTP checks. See the [original M8-A acceptance report](m8-a-acceptance.md). |
| M8-B · Shared accounting backend | Verified the accounting migrations and Hibernate mappings on a disposable database. Added server-side history sorting, payable and audit search, atomic expense corrections, a cash closing preview check and private financial-summary export. Verified explicit Owner and Manager grants and backend denial for Staff, Driver and out-of-scope memberships. |
| M8-C · Shared Android screens | Extended the authenticated Operations workspace after the accounting backend gate passed. The branded app uses its embedded restaurant ID and signed-in user's token for all financial data. |

## Screen map

| Operations entry | Screens and data |
| --- | --- |
| Reports | **Financial Overview**, **Sales Reports**, **Financial Summary**, **Export Reports**. Sales and payment measures use their respective dates. Product reports use stored names and historical line totals. CSV exports use the complete server-filtered range and support sales, purchases and the financial summary. |
| Sales History | **Detailed Sales History** and **Order/Sale Detail**. Search, sort and page through historical orders, then inspect line prices, modifiers, discounts, collections, refunds, reversals and order events. |
| Shopping | **Shopping List**, **Purchase History**, **Purchase Detail**, **Supplier Register**, **Payables**. Plans remain separate from purchases. Confirmations retain historical quantities, units and prices. Supplier balances derive from recorded obligations and their payments. |
| Accounting | **Expense Register**, **Add/Edit Expense**, **Cashbook**, **Daily Cash Closing**, **Accounting Audit History**. Editing a posted expense records a reasoned cancellation and linked replacement. Cash closing shows expected and counted cash, variance and prior revisions. |

Lists use server-side search, sorting and pagination where applicable. Shared controls provide labeled inputs, selected states, loading, empty and retry states, and touch targets that wrap on smaller screens. Posted records and totals come from the Spring API. Profit values remain unavailable because the backend lacks verified inventory consumption and cost of goods sold. The financial summary labels its payment-flow and expense measures separately.

## Verification coverage

| Area | Checked behavior |
| --- | --- |
| Sales and dates | Daily, monthly and yearly totals across a leap-day and restaurant-local midnight. Product-level search and sorting, original timestamps and prices, discounts, cancelled orders, dated refunds and refund reversals. Separate collection and sales cohorts. |
| Procurement | Purchase history and immutable prices, seven-day suggestion expiry, reactivation on a qualifying purchase, supplier search, payment history and payable balances. |
| Expenses and cash | Expense categories, correction rollback and replay, linked audit records, cash and digital separation, opening carry-forward, counted variance, stale-preview rejection and reversal history. |
| Safety | Concurrent duplicate submissions, posted history immutability, direct database client restrictions, tenant-scoped references, Owner and Manager enforcement, Staff and Driver denial, private CSV and receipt access, and redacted accounting errors. |

## Test execution

| Check | Result |
| --- | --- |
| Frontend workspace tests | 599 passed, including 177 Operations mobile checks and 70 API-client tests. The API-client suite includes a loopback HTTP integration test. |
| Workspace TypeScript and lint | `npm run typecheck` and `npm run lint` passed. |
| Spring Maven verify | 287 discovered, 280 passed, seven Docker-only tests skipped. Zero failures or errors. The final run included structured error responses for CSV requests and the real expense correction and cash preview scenario. |
| Disposable PostgreSQL | PostgreSQL 16.4 ran the accounting migrations unchanged. Temporary copies of two older privilege scripts omitted `MAINTAIN`, which requires PostgreSQL 17 or newer. All 10 local accounting, procurement, receipt and Hibernate checks passed. PostgreSQL 18 initialization crashed on this Windows host. |
| Docker migration suite | Skipped because Docker Desktop's Linux engine was unavailable. |
| Operations Android bundle | Metro and Hermes exported the Android JavaScript bundle using the development fixture. |
| Android device | ADB ran and found no attached device or emulator. Native rendering, TalkBack, font scaling and the Android share sheet require a device run. |

## Operational limits

- Server idempotency protects requests that reuse the same key and body. Mobile keys live in the mounted workspace and reset on exit or restart. Following an ambiguous submission, use the server-backed history to confirm its outcome before entering a new action.
- The Android expense form accepts a private receipt ID and purchase detail shows attachment presence. Receipt file access is available through the authenticated backend.
- Intentional CSV sharing hands the file to the selected recipient. Native temporary files use app-private cache with best-effort cleanup after sharing and stale-file cleanup on later exports.

## Database and release

The existing forward-only accounting migrations are `20261102090000` through `20261102101000`. The additional screens, API filters, correction events and report export use that schema. See the [accounting contracts and migration order](accounting.md) and the [backend permission matrix](role-permission-matrix.md).

Verification used a disposable local database. Production migration application, deployment and Git operations are reserved for the maintainer.
