# Restaurant Platform API — Current Routes

This document describes routes that currently exist in the backend source. It is not a promise that unimplemented workflows are available.

## Authentication

Protected routes require a Supabase Auth access token:

```http
Authorization: Bearer <supabase-access-token>
```

The token must have a valid signature under the configured JWKS key/algorithm, the configured issuer, a valid timestamp range, the required audience (default `authenticated`), and a UUID `sub` user ID. Confirm the algorithm, issuer, JWKS URL, and audience in the actual Supabase project configuration before deployment.

Restaurant permissions are resolved from `restaurant_members` for the authenticated subject and the `restaurantId` in the route. A client-supplied user ID is not accepted as proof of identity.

## Public menu and QR-order routes

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/v1/public/restaurants/{restaurantId}/menu` | Return the active public menu |
| POST | `/api/v1/public/restaurants/{restaurantId}/orders/common-qr` | Create a Common QR order |
| POST | `/api/v1/public/restaurants/{restaurantId}/orders/table-qr` | Create a Table QR order |

These routes do not require a bearer token at the security-filter level; the QR-order service must still validate the restaurant/table QR credential and order rules.

## Manager/staff order routes

### List orders

`GET /api/v1/restaurants/{restaurantId}/orders?page=0&size=20&status=PENDING`

Required permission: `ORDER_READ`.

Query parameters:

| Parameter | Required | Behavior |
|---|---|---|
| `page` | No | Zero-based page index; defaults to 0 |
| `size` | No | Defaults to 20; service caps the page size at 100 |
| `status` | No | Optional status filter: `PENDING`, `ACCEPTED`, `PREPARING`, `READY`, `OUT_FOR_DELIVERY`, `COMPLETED`, or `CANCELLED` |
| `sort` | No | Only `createdAt`, `orderNumber`, `status`, `orderType`, and `totalAmount` are accepted as sort properties; if no allowed property remains, newest first is used |

The response is a Spring Data page containing `OrderSummaryDto` items. Each summary contains ID, order number, type, channel, status, subtotal, delivery fee, total, and creation timestamp.

### Get order detail

`GET /api/v1/restaurants/{restaurantId}/orders/{orderId}`

Required permission: `ORDER_READ`.

Returns a `ManagerOrderDetailDto` containing order fields, the item snapshots, each item's selected modifier snapshots, and status history. The order is found by both `orderId` and `restaurantId` before related records are read. A missing order or one outside the given restaurant returns `404 ORDER_NOT_FOUND`.

### Update order status

`PATCH /api/v1/restaurants/{restaurantId}/orders/{orderId}/status`

Required permission: `ORDER_STATUS_UPDATE`, plus extra permissions for cancellation, queue updates, and delivery-specific transitions.

Request:

```json
{
  "status": "ACCEPTED",
  "note": "Order accepted by staff"
}
```

- `status` is required and must be one of `ACCEPTED`, `PREPARING`, `READY`, `OUT_FOR_DELIVERY`, `COMPLETED`, or `CANCELLED`. The service enforces transitions from the current state.
- `note` is optional and limited to 500 characters by request validation.
- The authenticated JWT subject is recorded as `changedByUserId`. No user ID is accepted from the request body.
- The order row is locked within the transaction before its state is changed, preventing concurrent requests from both transitioning the same current state.
- Order update and status-history insertion share the transaction. When a queue-linked order becomes `READY`, `COMPLETED`, or `CANCELLED`, the related queue ticket is synchronized in that transaction; becoming ready also creates an in-app notification database row. This does not itself deliver a push notification or audible alert.

Current supported transitions:

| Current status | Allowed next status |
|---|---|
| `PENDING` | `ACCEPTED`, `CANCELLED` |
| `ACCEPTED` | `PREPARING`, `CANCELLED` |
| `PREPARING` | `READY`, `CANCELLED` |
| `READY` for delivery | `OUT_FOR_DELIVERY` |
| `READY` for non-delivery | `COMPLETED` |
| `OUT_FOR_DELIVERY` | `COMPLETED` |

Cancellation requires `ORDER_CANCEL`. Queue-ticket lifecycle changes require `QUEUE_MANAGE`. Delivery transitions require `DELIVERY_STATUS_UPDATE`. Repeating a current status or attempting an invalid transition returns a conflict.

## Error response shape

Expected errors use the shared response structure:

```json
{
  "timestamp": "2026-10-21T12:00:00Z",
  "status": 404,
  "code": "ORDER_NOT_FOUND",
  "message": "Order not found.",
  "path": "/api/v1/restaurants/...",
  "errors": []
}
```

Relevant status codes:

| HTTP status | Meaning |
|---|---|
| 400 | Invalid status filter or request validation |
| 401 | Missing/invalid authentication |
| 403 | Missing restaurant permission or mismatched authenticated user |
| 404 | Order not found within the requested restaurant |
| 409 | Invalid order-state transition or database conflict |
| 500 | Unexpected server error; implementation details are not included in the response |

## Queue tracking and queue management

### Customer queue status

`GET /api/v1/public/queue-tickets/{ticketId}/status`

Send the raw tracking token returned in `CreateOrderResponse.queue.trackingToken` in the `X-Queue-Token` header. The token is generated with a cryptographically secure random source; only its SHA-256 hash is stored on the queue ticket. Unknown ticket IDs and invalid/missing tokens return the same `404 QUEUE_TICKET_NOT_FOUND` response.

The response includes queue number/display code, ticket status, order number/status, creation time, ready time, called time, and completed time. Customers can poll this endpoint to determine when the ticket reaches `READY` or `CALLED`.

### Customer queue notifications

`GET /api/v1/public/queue-tickets/{ticketId}/notifications`

Requires the same `X-Queue-Token` header. Returns notification records tied to that exact queue ticket, newest first.

`PATCH /api/v1/public/queue-tickets/{ticketId}/notifications/{notificationId}/read`

Also requires the tracking token. The notification lookup is scoped by both notification ID and ticket ID; it cannot mark a different ticket's notification read. Read is idempotent and sets status to `READ` and `readAt`.

### Manager queue list and call

`GET /api/v1/restaurants/{restaurantId}/queue-tickets?status=READY`

Requires `QUEUE_MANAGE`. Lists the current queue date using the restaurant's configured timezone. Without a status filter, it returns active tickets (`WAITING`, `READY`, `CALLED`). Valid filters are `WAITING`, `READY`, `CALLED`, `COMPLETED`, and `CANCELLED`.

`PATCH /api/v1/restaurants/{restaurantId}/queue-tickets/{ticketId}/call`

Requires `QUEUE_MANAGE`. A ticket must belong to the route's restaurant and be in `READY` status. The service locks the ticket row, changes it to `CALLED`, stamps `calledAt`, and creates a `QUEUE_CALLED` in-app notification in the same transaction. Tickets in any other state are rejected with `409 INVALID_QUEUE_TRANSITION`.

An order status update to `READY` already moves a linked queue ticket to `READY` and creates a `QUEUE_READY` in-app notification. A subsequent manager call records `QUEUE_CALLED`.

### Authenticated notification inbox

- `GET /api/v1/notifications` — returns notifications addressed to the authenticated JWT subject.
- `GET /api/v1/notifications?status=PENDING` — optional status filter; valid values are `PENDING`, `SENT`, `FAILED`, and `READ`.
- `PATCH /api/v1/notifications/{notificationId}/read` — marks only a notification owned by the authenticated user as read.

These APIs store and return in-app notification records. They do not integrate an external push provider and cannot by themselves make a browser/mobile device play a sound. For QR customers, the client can periodically call the queue status/notifications APIs with the tracking token and react when it sees a new `QUEUE_READY` or `QUEUE_CALLED` notification.

## Not yet exposed as HTTP routes

Queue tracking, delivery assignment/status operations, restaurant/menu administration, customer profile/address management, and payments are not described as implemented endpoints because their controllers/workflows have not yet been completed and verified.
