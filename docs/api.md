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
- Order update and status-history insertion share the transaction. When a queue-linked order becomes `READY`, `COMPLETED`, or `CANCELLED`, the related queue ticket is synchronized in that transaction. When a delivery order becomes `READY`, a delivery task is created and assigned to the restaurant's default driver where available.

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

### Create an order entered by staff

`POST /api/v1/restaurants/{restaurantId}/orders/staff`

Requires `ORDER_CREATE`. This route is intended for staff entering orders for customers who are not placing the order through their own phone.

Dine-in request:

```json
{
  "orderType": "DINE_IN",
  "tableId": "00000000-0000-0000-0000-000000000000",
  "items": [
    {
      "productId": "00000000-0000-0000-0000-000000000000",
      "quantity": 2,
      "modifiers": []
    }
  ],
  "note": "No onions"
}
```

For takeaway, set `orderType` to `TAKEAWAY` and omit `tableId`. Dine-in requires an active table from the same restaurant; takeaway is rejected when takeaway ordering is disabled. Item prices, variants, modifiers, stock, minimum order, and totals are validated/calculated by the backend. The authenticated staff member is recorded as creator; the request cannot choose the customer or creator ID. A pending `CASH_AT_COUNTER` payment is created for collection through the payment endpoint.

## Delivery management and driver workflow

All routes below require a valid Supabase bearer token.

### Default driver

- `GET /api/v1/restaurants/{restaurantId}/delivery-settings/default-driver`
- `PATCH /api/v1/restaurants/{restaurantId}/delivery-settings/default-driver`

Required permission: `SETTINGS_MANAGE`.

Request body for the PATCH route:

```json
{
  "driverUserId": "00000000-0000-0000-0000-000000000000"
}
```

The selected user must be a `DELIVERY_DRIVER` member of the same restaurant. At the first transition of a delivery order to `READY`, the backend uses the configured default. If no default is configured, it selects the earliest-added `DELIVERY_DRIVER` member and persists that user as the default. If there is no delivery driver yet, the delivery remains `WAITING_ASSIGNMENT`. The UUID shown above is only an example; use a real user UUID from that restaurant's membership data.

### Delivery queue and individual task

| Method | Route | Required permission / behavior |
|---|---|---|
| GET | `/api/v1/restaurants/{restaurantId}/deliveries?status=ASSIGNED&page=0&size=20` | `DELIVERY_READ`; paginated restaurant queue, except drivers see only their own assigned tasks |
| GET | `/api/v1/restaurants/{restaurantId}/deliveries/mine` | `DELIVERY_READ`; returns tasks assigned to the authenticated user in this restaurant |
| GET | `/api/v1/restaurants/{restaurantId}/deliveries/{deliveryId}` | Delivery must belong to the restaurant; drivers must be the assigned driver |
| PATCH | `/api/v1/restaurants/{restaurantId}/deliveries/{deliveryId}/assign` | `DELIVERY_ASSIGN`; assigns or reassigns to a same-restaurant driver |
| PATCH | `/api/v1/restaurants/{restaurantId}/deliveries/{deliveryId}/status` | `DELIVERY_STATUS_UPDATE`; updates delivery and linked order state in one transaction |

Assignment request:

```json
{
  "driverUserId": "00000000-0000-0000-0000-000000000000",
  "note": "Assigned by manager"
}
```

Driver status request examples:

```json
{
  "status": "PICKED_UP",
  "note": "Collected from restaurant"
}
```

```json
{
  "status": "FAILED",
  "failureReason": "Customer could not be reached",
  "note": "Contact manager for next steps"
}
```

For `DELIVERED`, include `"cashCollected": true` when a pending `CASH_ON_DELIVERY` payment is associated with the order:

```json
{
  "status": "DELIVERED",
  "cashCollected": true,
  "note": "Cash received"
}
```

If a COD payment is pending and `cashCollected` is missing or false, delivery completion returns `409 CASH_COLLECTION_REQUIRED` and the order, delivery, and payment remain unchanged. The legacy manager order-status endpoint cannot bypass this check.

The supported delivery lifecycle is `WAITING_ASSIGNMENT → ASSIGNED → PICKED_UP → DELIVERED`, with `FAILED` and pre-pickup `CANCELLED` branches. Failed deliveries can be reassigned by a manager; if the order was `OUT_FOR_DELIVERY`, reassignment returns the order to `READY`. A driver can change only deliveries assigned to their authenticated user. Managers can override delivery transitions through the manager order status endpoint, and both paths write delivery/order status history.

Picking up a task changes the linked order from `READY` to `OUT_FOR_DELIVERY`; confirming delivery changes it to `COMPLETED`. If the customer has an account, status updates create in-app notification records. External push notifications and actual browser/mobile sound playback are not wired in the backend.

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

## Dine-in table and Table QR management

These endpoints require `SETTINGS_MANAGE`.

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/v1/restaurants/{restaurantId}/tables` | List tables without exposing their QR tokens |
| POST | `/api/v1/restaurants/{restaurantId}/tables` | Create table and return its raw QR token once |
| PUT | `/api/v1/restaurants/{restaurantId}/tables/{tableId}` | Rename or activate/deactivate a table |
| POST | `/api/v1/restaurants/{restaurantId}/tables/{tableId}/qr-token/rotate` | Rotate the table QR token and return it once |

Table creation request:

```json
{
  "tableNumber": "T1",
  "active": true
}
```

The QR token is generated with a cryptographically secure random source and is intentionally not included in table list/update responses. If a token is rotated, the old printed Table QR becomes invalid and must be replaced with the new QR code.

## Restaurant onboarding and owner bootstrap

These authenticated routes let a signed-in user create and manage their own restaurant memberships.

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/v1/my/restaurants` | List restaurants where the current user is a member, including their role |
| POST | `/api/v1/restaurants` | Create a restaurant, initial settings, and OWNER membership in one transaction |
| GET | `/api/v1/restaurants/{restaurantId}` | Read active restaurant details with `RESTAURANT_READ` |
| PUT | `/api/v1/restaurants/{restaurantId}/profile` | Update restaurant profile fields with `SETTINGS_MANAGE` |

Create request:

```json
{
  "name": "Tea Shop",
  "slug": "tea-shop",
  "description": "Tea and snacks",
  "phone": "09123456789",
  "address": "Example street",
  "houseNo": "12",
  "street": "Main Road",
  "ward": "Ward 1",
  "township": "Min Buri",
  "city": "Bangkok",
  "latitude": null,
  "longitude": null,
  "logoUrl": null,
  "currency": "MMK",
  "timezone": "Asia/Yangon"
}
```

The caller's JWT subject becomes the initial OWNER; the client cannot choose the owner ID or role. The response includes the newly-created Common QR token once so it can be encoded for printing. Keep that token private and do not log/share it. Later settings reads do not expose the token; rotating it invalidates old printed Common QR codes.

The endpoint creates a profile row for the authenticated user when missing, as a safety net for Auth-profile synchronization. Restaurant slug is immutable through the profile update endpoint to avoid silently breaking public links. This endpoint is for restaurant creation by the current authenticated user; it is not a public endpoint.

## Restaurant member management

The following endpoints require `MEMBERS_MANAGE`, which is granted to `OWNER` only in the current role policy.

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/v1/restaurants/{restaurantId}/members` | List this restaurant's members |
| POST | `/api/v1/restaurants/{restaurantId}/members` | Add an existing profile as MANAGER, STAFF, or DELIVERY_DRIVER |
| PUT | `/api/v1/restaurants/{restaurantId}/members/{memberId}` | Change an existing non-owner member's role |
| DELETE | `/api/v1/restaurants/{restaurantId}/members/{memberId}` | Remove an existing non-owner member |

Request example:

```json
{
  "userId": "00000000-0000-0000-0000-000000000000",
  "role": "DELIVERY_DRIVER"
}
```

The selected user must already have a `public.profiles` row (typically by signing in once after the profile-sync migration is applied). A user can join each restaurant only once. This general endpoint cannot create, demote, or delete an OWNER; owner transfer is intentionally not included yet. Removing or changing the role of the configured default driver clears the default driver setting.

## Restaurant settings and delivery zone administration

These endpoints require a valid bearer token and `SETTINGS_MANAGE` for the restaurant.

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/v1/restaurants/{restaurantId}/settings` | Read safe operational settings; never returns the Common QR secret |
| PUT | `/api/v1/restaurants/{restaurantId}/settings` | Update currency, timezone, minimum order, default fee, and ordering flags |
| POST | `/api/v1/restaurants/{restaurantId}/settings/common-qr-token/rotate` | Replace the Common QR credential and return it once |
| GET | `/api/v1/restaurants/{restaurantId}/delivery-zones` | List active and inactive zones for management |
| POST | `/api/v1/restaurants/{restaurantId}/delivery-zones` | Create a delivery zone |
| PUT | `/api/v1/restaurants/{restaurantId}/delivery-zones/{zoneId}` | Update a zone or deactivate it |

Settings updates validate IANA timezone IDs and non-negative amounts. The Common QR token rotation response contains the raw token once; it is intentionally omitted from the normal settings response. Keep it private and use it when creating/regenerating the restaurant's Common QR code. Rotating the token invalidates previously printed Common QR codes and requires printing the new QR.

A delivery zone includes only a name, fee, minimum order, and active flag. The current schema does not describe geographic boundaries, so the backend can validate that a selected zone is active and belongs to the restaurant but cannot infer zone membership from an address.

## Restaurant catalog and menu management

All authenticated management routes are scoped to `restaurantId`. Reads require `MENU_READ`; create/update/attach/detach operations require `MENU_MANAGE`. STAFF can read active categories/products and available modifiers but cannot change the catalog.

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/v1/restaurants/{restaurantId}/categories` | List categories |
| POST | `/api/v1/restaurants/{restaurantId}/categories` | Create category |
| PUT | `/api/v1/restaurants/{restaurantId}/categories/{categoryId}` | Rename, reorder, or activate/deactivate category |
| GET | `/api/v1/restaurants/{restaurantId}/products` | List products; managers can also see unavailable products |
| POST | `/api/v1/restaurants/{restaurantId}/products` | Create product |
| PUT | `/api/v1/restaurants/{restaurantId}/products/{productId}` | Update product and stock settings |
| GET | `/api/v1/restaurants/{restaurantId}/products/{productId}/variants` | List variants |
| POST | `/api/v1/restaurants/{restaurantId}/products/{productId}/variants` | Create variant |
| PUT | `/api/v1/restaurants/{restaurantId}/products/{productId}/variants/{variantId}` | Update variant or mark unavailable |
| GET | `/api/v1/restaurants/{restaurantId}/modifier-groups` | List modifier groups and options |
| POST | `/api/v1/restaurants/{restaurantId}/modifier-groups` | Create modifier group |
| PUT | `/api/v1/restaurants/{restaurantId}/modifier-groups/{groupId}` | Update selection rules or activate/deactivate |
| POST | `/api/v1/restaurants/{restaurantId}/modifier-groups/{groupId}/options` | Add option |
| PUT | `/api/v1/restaurants/{restaurantId}/modifier-groups/{groupId}/options/{optionId}` | Update option price or availability |
| GET | `/api/v1/restaurants/{restaurantId}/products/{productId}/modifier-groups` | List groups linked to a product |
| PUT | `/api/v1/restaurants/{restaurantId}/products/{productId}/modifier-groups/{groupId}` | Attach a group to a product |
| DELETE | `/api/v1/restaurants/{restaurantId}/products/{productId}/modifier-groups/{groupId}` | Detach a group from a product |
| GET | `/api/v1/public/restaurants/{restaurantId}/products/{productId}/modifier-groups` | Public options for an available product |

Product management requests use the database UUIDs returned by the API. Product category, price, stock state, variants, group selection rules, and same-restaurant relationships are validated server-side. Soft deactivation/availability flags are used where the schema preserves catalogue history; products cannot be ordered from an inactive category and unavailable variants/options cannot be selected. The public modifier endpoint only returns active groups attached to an available product and available options.

## Counter payment collection

QR orders create a `PENDING` `CASH_AT_COUNTER` payment record for the order total. The following routes require `PAYMENT_READ` or `PAYMENT_COLLECT` respectively; OWNER, MANAGER, and STAFF have these permissions.

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/v1/restaurants/{restaurantId}/orders/{orderId}/payments` | List safe payment metadata for a restaurant-scoped order |
| PATCH | `/api/v1/restaurants/{restaurantId}/orders/{orderId}/payments/{paymentId}/collect` | Mark a pending cash-at-counter payment as paid |

The collect action locks the order, scopes payment lookup by order ID, records `paid_at` in UTC, and is idempotent when a payment is already `PAID`. Cancelled orders cannot be collected. It only accepts `CASH_AT_COUNTER`; `CASH_ON_DELIVERY` must be confirmed by the assigned driver using the delivery status route and `cashCollected: true`. Online payments are not implemented. If the order belongs to a registered customer, an in-app `PAYMENT_RECEIVED` notification record is created.

## Daily operations report

`GET /api/v1/restaurants/{restaurantId}/reports/daily?date=2026-10-21`

Requires `REPORT_READ` (OWNER and MANAGER in the current role map). If `date` is omitted, the report uses the current date in the restaurant's configured timezone. Future local dates are rejected. The service computes local-day boundaries using the IANA timezone and aggregates orders created during that window; paid amount is aggregated separately from payment rows whose `paid_at` falls inside that window.

The report contains total orders, counts for `PENDING`, `ACCEPTED`, `PREPARING`, `READY`, `OUT_FOR_DELIVERY`, `COMPLETED`, and `CANCELLED`, the total amount of non-cancelled orders created that day, and the amount of payments actually marked `PAID` that day. These two amount fields represent different dates/semantics and should not be treated as interchangeable revenue figures.

## Customer profile

These endpoints read/write only the profile whose ID equals the validated JWT subject.

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/v1/customer/profile` | Read the signed-in customer's profile |
| PUT | `/api/v1/customer/profile` | Create or update the signed-in customer's full name, phone, and preferred language |

PUT example:

```json
{
  "fullName": "Example Customer",
  "phone": "09123456789",
  "preferredLanguage": "my-MM"
}
```

Supported languages are `my-MM` and `en`. The database migration `20261022001000_sync_auth_user_profiles.sql` creates a `profiles` row when a Supabase Auth user is added and backfills existing users without a profile. The migration `20261022002000_allow_cancelled_payment_status.sql` permits cancelled unpaid payment records after customer cancellation.

## Customer saved addresses

These endpoints use the authenticated JWT subject as the owner ID; clients cannot provide another user's ID.

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/v1/customer/addresses` | List the authenticated customer's saved addresses |
| POST | `/api/v1/customer/addresses` | Create an address; the first address is automatically default |
| PUT | `/api/v1/customer/addresses/{addressId}` | Update an address owned by the current user |
| PATCH | `/api/v1/customer/addresses/{addressId}/default` | Make an owned address the default |
| DELETE | `/api/v1/customer/addresses/{addressId}` | Delete an owned address; if it was default, another saved address is promoted |

Create/update example:

```json
{
  "label": "Home",
  "recipientName": "Example Customer",
  "houseNo": "12",
  "street": "Main Road",
  "ward": "Ward 1",
  "township": "Example Township",
  "city": "Example City",
  "latitude": null,
  "longitude": null,
  "deliveryNote": "Call when arriving",
  "makeDefault": true
}
```

The API validates required address fields and coordinate bounds. Address lookups are always scoped to the JWT subject. An address ID belonging to a different user returns `404 CUSTOMER_ADDRESS_NOT_FOUND`.

## Customer delivery checkout

### List available delivery zones

`GET /api/v1/customer/restaurants/{restaurantId}/delivery-zones`

Requires a valid bearer token. Returns active delivery zones for the restaurant with each zone's name, fee, and minimum order. The restaurant must be active and accepting delivery orders.

### Create a delivery order

`POST /api/v1/customer/restaurants/{restaurantId}/orders/delivery`

Requires a valid bearer token. The current JWT subject becomes both `customerId` and `createdByUserId`; neither ID is accepted from the request.

```json
{
  "addressId": "00000000-0000-0000-0000-000000000000",
  "deliveryZoneId": "00000000-0000-0000-0000-000000000000",
  "recipientName": "Example Customer",
  "recipientPhone": "09123456789",
  "deliveryNote": "Call on arrival",
  "paymentMethod": "CASH_ON_DELIVERY",
  "items": [
    {
      "productId": "00000000-0000-0000-0000-000000000000",
      "variantId": null,
      "quantity": 2,
      "specialInstruction": "No onions",
      "modifiers": []
    }
  ]
}
```

The UUIDs above are placeholders; use IDs returned by the actual restaurant APIs. The address must belong to the authenticated customer, and the delivery zone must be active and belong to the route's restaurant. Product, category, variant, modifier, availability, and stock rules are validated server-side. Prices are read from the database; client-submitted prices and totals are not accepted. The computed subtotal must meet both the restaurant-wide and delivery-zone minimums. The saved address and recipient details are snapshotted onto the order to preserve the destination used at checkout.

For now, only `CASH_ON_DELIVERY` is supported. An order and pending payment record are created in one database transaction. Online payment and refunds are not implemented. The selected zone is checked by restaurant, but the current schema does not contain geographic boundaries to automatically determine whether a street/township falls inside a zone; the customer chooses from the configured zones.

When the order later reaches `READY`, the Milestone 5 workflow creates its delivery task and attempts to assign the configured default driver.

## Customer order history

These endpoints require a valid bearer token and always scope by the authenticated JWT subject.

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/v1/customer/orders?page=0&size=20&status=PENDING` | Paginated order history for the current customer |
| GET | `/api/v1/customer/orders/{orderId}` | Own order details, items/modifiers, status timeline, payment records, and delivery status |
| POST | `/api/v1/customer/orders/{orderId}/cancel` | Cancel own order while it remains PENDING |

Only orders still in `PENDING` can be cancelled by the customer. The order row is locked and ownership-checked; tracked stock reserved at checkout is released and pending payment rows are marked `CANCELLED` in the same transaction. Once the restaurant accepts the order, customer cancellation is rejected. The migration `20261022002000_allow_cancelled_payment_status.sql` adds `CANCELLED` to the payment status constraint.

The optional status filter accepts `PENDING`, `ACCEPTED`, `PREPARING`, `READY`, `OUT_FOR_DELIVERY`, `COMPLETED`, or `CANCELLED`. Page size is capped at 100. A customer cannot see an order solely by knowing its UUID; detail lookups require both the order ID and the authenticated customer ID. Status history is customer-safe (status and timestamp only), and payment responses omit private transaction references and staff identity.

## Push-device registration

These routes require authentication and always use the validated JWT subject as the device owner.

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/v1/devices` | List the current user's device metadata |
| POST | `/api/v1/devices` | Register or reactivate a push token for ANDROID, IOS, or WEB |
| DELETE | `/api/v1/devices/{deviceId}` | Deactivate an owned device |

Request example:

```json
{
  "pushToken": "TOKEN_FROM_THE_PUSH_PROVIDER_SDK",
  "platform": "ANDROID"
}
```

The response intentionally never exposes the raw push token. A token already associated with another account is rejected; callers cannot transfer token ownership by registering it again. Deactivation is soft (inactive flag) and only works for the authenticated owner. This API stores device tokens but does not send push messages; FCM/APNs/web-push provider integration and browser/mobile sound playback remain separate client/provider work.

## Not yet exposed as HTTP routes

Owner transfer, customer cancellation/reorder, online payments/refunds, advanced reporting, and external push notification integration are not yet implemented as complete HTTP workflows.
