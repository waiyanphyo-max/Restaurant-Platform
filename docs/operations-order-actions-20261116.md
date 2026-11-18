# Operations order cards and kitchen actions

The previous order list omitted item snapshots and delivery destinations, while its detail page hid destinations from all staff until a delivery was assigned. Kitchen controls also exposed every historical intermediate status. These behaviors made a practical ward/street delivery review difficult and tied kitchen preparation to several manual steps.

`GET /api/v1/restaurants/{restaurantId}/orders` remains paginated (maximum 100 orders). It now includes `queueTicketId`, complete historical `items` with variants/modifiers/instructions, `orderNote`, `deliveryDestination` and `availableActions`. The destination contains canonical region/district/township IDs and snapshot labels, ward, street, house/building, formatted address, recipient name/phone and instructions. Old snapshots retain nullable component fields and their original formatted text. There is no per-card order-history request: page items, modifiers and settled-payment eligibility are loaded in batches. No status history or payment rows are returned on cards.

The detail response includes the same destination and available actions. `ORDER_DELIVERY_DETAILS_READ` is explicitly granted to owner, manager and staff who handle restaurant orders. It is not granted to delivery drivers; drivers retain the separately checked assigned-delivery workflow. Every list/detail access still checks membership in the exact restaurant and `ORDER_READ`. An owner from another restaurant, a customer and an unassigned driver cannot access private order cards.

The new command is `POST /api/v1/restaurants/{restaurantId}/orders/{orderId}/actions`:

```json
{"action":"COMPLETE","expectedStatus":"ACCEPTED","reason":null}
```

`action` is `ACCEPT`, `COMPLETE` or `CANCEL`. `expectedStatus` is required. Cancellation requires a reason containing 10–500 characters after trimming. A practical-area cancellation can use “Delivery address outside our practical service area.” The order row is locked, the expected status is checked, and the resulting status, queue/delivery work, notifications and one audit-history entry are committed atomically. Stale or duplicate submissions return a conflict; no synthetic PREPARING entries are generated.

| Order type/channel | Accept | Complete from ACCEPTED/PREPARING | Separate final event |
| --- | --- | --- | --- |
| Customer delivery | PENDING → ACCEPTED | → READY; create/ensure delivery task | Assigned driver pickup → OUT_FOR_DELIVERY; physical delivery plus explicit COD confirmation → COMPLETED |
| Legacy delivery | PENDING → ACCEPTED | → READY | Existing protected delivery workflow |
| Takeaway / Common QR with pickup ticket | PENDING → ACCEPTED | → READY; ticket READY; pickup notification | Queue “Confirm pickup” uses existing protected READY → COMPLETED transition and marks ticket completed |
| Counter / takeaway without ticket | PENDING → ACCEPTED | → COMPLETED | Cash collection remains explicit and separate |
| Dine-in / Table QR without ticket | PENDING → ACCEPTED | → COMPLETED (restaurant fulfillment) | Payment collection remains explicit and separate |
| Any historical order with pickup ticket | PENDING → ACCEPTED | → READY | Queue physical pickup confirmation |

READY delivery and READY pickup preparation cards are read-only in Orders. Existing PREPARING/READY/history values remain valid for installed clients. Legacy non-delivery READY records without tickets can complete. Completed/cancelled orders have no actions. The status PATCH remains available to older clients and driver safeguards remain unchanged. An older client that sends cancellation without a meaningful reason receives `CANCELLATION_REASON_REQUIRED` and must supply one or update its app.

Server-computed `availableActions` hides cancellation for settled payments. Owner/manager cancellation retains its separate `ORDER_CANCEL` permission and eligible PENDING/ACCEPTED/PREPARING stages. Collected/settled payments now require the financial refund workflow (`REFUND_REQUIRED`) rather than silently cancelling a paid order. Staff have only `ORDER_CANCEL_EARLY_UNPAID`: PENDING/ACCEPTED orders with no collected or settled payment. They cannot cancel preparation already started, dispatch, delivered orders, or issue refunds. All action eligibility is checked again under the order/accounting locks when the request arrives.

Customer delivery cancellation closes pending COD and releases only recorded reservations before preparation. PREPARING cancellation retains consumed stock. Counter orders retain the existing separate stock-review policy. Immutable reservation/history evidence remains intact. A second cancellation is rejected by status and expected-state checks, preventing repeated stock release. Cancellation writes the actor and reason, preserves payment records, and emits the existing customer cancellation notification. The accounting lock serializes payment collection and cancellation: if collection wins, cancellation fails with `REFUND_REQUIRED`; if cancellation wins, collection fails with `CANCELLED_ORDER_PAYMENT`.

No kitchen action marks COD paid or creates pickup/delivered events. Township eligibility remains preliminary; handlers must review the detailed ward/street address before accepting. No distance or GPS calculations are introduced.

These changes add no native dependency or Android manifest change. The updated JavaScript bundle requires an app update or supported development-client reload; an APK rebuild is not required solely for these order changes. Backend changes should precede updated Operations clients. Apply the forward-only canonical location migrations before starting a backend that maps those new order columns.

Automated coverage includes atomic direct preparation completion, queue readiness, COD separation, stale requests, early unpaid staff cancellation, collected-cash rejection, role grants, batched item/modifier summaries, destination privacy, UI action selection and terminal-state buttons. Real-device checks still need: new order card readability, cancellation reason entry/confirmation, delayed/double tap handling, pickup confirmation, separately assigned driver delivery and physical cash reconciliation.
