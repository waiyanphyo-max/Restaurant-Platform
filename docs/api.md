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
| GET | `/api/v1/public/restaurants/{restaurantId}/menu` | Return active categories/products, available variants, stock state, and product-specific active modifier groups/options |
| POST | `/api/v1/public/restaurants/{restaurantId}/orders/common-qr` | Create a Common QR order |
| POST | `/api/v1/public/restaurants/{restaurantId}/orders/table-qr` | Create a Table QR order |

These routes do not require a bearer token at the security-filter level; the QR-order service must still validate the restaurant/table QR credential and order rules. The public menu returns available product variants and product-specific active modifier groups/options so guest clients can build a valid cart. The backend revalidates current catalog links, modifier selection limits, stock, and prices when an order is submitted.

#### QR checkout retries and idempotency

Both QR checkout routes optionally accept an `Idempotency-Key` request header. Generate one unique, random key per intended checkout and reuse that same key only when retrying that exact request:

```http
POST /api/v1/public/restaurants/{restaurantId}/orders/common-qr
Content-Type: application/json
Idempotency-Key: 7e3a0a6c-49a4-461e-9f92-02f6d2eaa0ed
```

A matching retry within 24 hours returns the original response, including the same order ID and queue tracking token, without creating a second order or reserving stock again. Reusing a key with a different payload returns `409 IDEMPOTENCY_KEY_REUSED`. The key is scoped to the restaurant and operation. If the header is omitted, the legacy behavior remains unchanged.

To enable this feature, apply migration `20261024083000_add_qr_order_idempotency.sql` and configure a stable server-only `APP_IDEMPOTENCY_ENCRYPTION_KEY` containing Base64 for 32 random bytes. For PowerShell, generate one with:

```powershell
[Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

Keep it in the API secret store, never in browser variables or Git. The replay response is encrypted with AES-256-GCM because it contains the queue tracking token. Keep the key stable for at least the 24-hour replay retention window; rotating it early can make existing stored responses unreadable.

### Common QR guest web flow

The operations web client now includes a guest-facing Common QR pickup screen. A QR printed for this web deployment can open a URL in this shape:

```text
https://YOUR-WEB-ORIGIN/?view=customer-pickup&restaurantId=YOUR_RESTAURANT_UUID#qrToken=URL_ENCODED_COMMON_QR_TOKEN
```

Replace the origin, restaurant UUID, and token with real values. The token belongs in the URL fragment (after `#`), not in a query parameter, because fragments are not sent to the web server in the HTTP request. The client removes the fragment from the visible address bar after reading it. The guest screen still needs the customer to choose **Load menu** before it contacts the public menu endpoint. The token is kept in page memory, and guest checkout submits through the existing `POST .../orders/common-qr` route.

After checkout, the server returns the pickup number and a one-time queue tracking token. The page retains the token in memory and polls `/status` and `/notifications` every five seconds. The customer can opt in to browser sound on the page; local audio plays when the queue changes to `READY` or `CALLED`. This is client-side polling/audio only, not an external push notification, and polling stops when the page is closed or navigated away.

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
| 403 | Missing restaurant permission or mismatched authenticated user |\n| 409 | Invalid state transition, stock conflict, or idempotency key reused for a different request |
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
| POST | `/api/v1/restaurants/{restaurantId}/members/transfer-ownership` | Transfer ownership to an existing member; former owner becomes MANAGER |

Request example:

```json
{
  "userId": "00000000-0000-0000-0000-000000000000",
  "role": "DELIVERY_DRIVER"
}
```

The selected user must already have a `public.profiles` row (typically by signing in once after the profile-sync migration is applied). A user can join each restaurant only once. This general endpoint cannot create, demote, or delete an OWNER. To transfer ownership, the current OWNER calls `POST /api/v1/restaurants/{restaurantId}/members/transfer-ownership` with `{ "newOwnerUserId": "<existing-member-user-uuid>" }`. The target must already be a member of the same restaurant; the target becomes OWNER and the former owner becomes MANAGER in one transaction. A former default driver is cleared if ownership transfer changes their role away from DELIVERY_DRIVER. Only the currently authenticated OWNER may transfer ownership. Removing or changing the role of the configured default driver clears the default driver setting.

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

A delivery zone includes a name, fee, minimum order, active flag, and optional `coverageCity` + `coverageTownship` restriction. Configure both coverage fields together on create/update to restrict checkout to that city and township; matching is case-insensitive after trimming whitespace. If both are omitted on update, an existing restriction is preserved. Send both as empty strings to clear it. Older zones with both fields null remain unrestricted for backward compatibility. This is a township-level rule, not a GPS polygon or proof of a precise street boundary.

Example zone request:
```json
{
  "name": "Tamwe",
  "deliveryFee": 500,
  "minimumOrder": 3000,
  "active": true,
  "coverageCity": "Yangon",
  "coverageTownship": "Tamwe"
}
```

When a zone has coverage configured, customer delivery checkout requires the saved address to have both city and township and returns `400 DELIVERY_ADDRESS_OUTSIDE_ZONE` if either value does not match. Address/zone ownership and active-state checks still run before checkout. Apply migration `20261024091000_add_delivery_zone_coverage.sql` before deploying this version.

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
| POST | `/api/v1/customer/orders/{orderId}/reorder` | Create a new delivery order from an own completed/cancelled delivery order |

Only orders still in `PENDING` can be cancelled by the customer. The order row is locked and ownership-checked; tracked stock reserved at checkout is released and pending payment rows are marked `CANCELLED` in the same transaction. Once the restaurant accepts the order, customer cancellation is rejected. The migration `20261022002000_allow_cancelled_payment_status.sql` adds `CANCELLED` to the payment status constraint.

The optional status filter accepts `PENDING`, `ACCEPTED`, `PREPARING`, `READY`, `OUT_FOR_DELIVERY`, `COMPLETED`, or `CANCELLED`. Page size is capped at 100. A customer cannot see an order solely by knowing its UUID; detail lookups require both the order ID and the authenticated customer ID. Status history is customer-safe (status and timestamp only), and payment responses omit private transaction references and staff identity.

### Reorder a previous delivery

`POST /api/v1/customer/orders/{orderId}/reorder` accepts `addressId`, `deliveryZoneId`, and optional recipient/contact/note/payment fields. It is available only for the authenticated customer's own completed or cancelled `DELIVERY` orders. The server rebuilds the item list from saved product/variant/modifier IDs and quantities, then calls the normal delivery checkout path, which revalidates current product availability, catalogue relationships, modifiers, stock, minimum order, delivery zone, and price. Historical prices and totals are never copied. The customer must choose a current saved address and active zone again. A successful reorder returns a new `CreateOrderResponse` and creates a new pending COD payment; it does not change the original order.

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

The response intentionally never exposes the raw push token. A token already associated with another account is rejected; callers cannot transfer token ownership by registering it again. Deactivation is soft (inactive flag) and only works for the authenticated owner.

### Firebase Cloud Messaging setup

The backend includes an optional Firebase Admin sender and a durable per-device outbox. Apply migration `20261024100000_add_push_notification_outbox.sql` before deploying the new backend. To enable external delivery:

1. Configure a Firebase project with Cloud Messaging enabled and configure the mobile/web client to register that project's device token through `POST /api/v1/devices`.
2. Set `APP_PUSH_FIREBASE_ENABLED=true` in the API environment.
3. Provide `APP_PUSH_FIREBASE_SERVICE_ACCOUNT_JSON` as a server-only secret containing Firebase service-account JSON, or configure Google Application Default Credentials in the hosting environment.
4. Keep credentials out of Git, browser variables, logs, and API responses.

The sender is disabled by default. When enabled, an insert into `public.notifications` for a signed-in user with channel `IN_APP` creates one outbox row per active device. Delivery status is tracked per device; transient failures retry with bounded backoff, and FCM `UNREGISTERED` errors deactivate the stale device. Tokens are never copied into outbox rows or logged. Public queue-ticket notifications without a user ID do not enter this outbox and continue to use the queue-token polling flow.

If Firebase is disabled, in-app notifications continue to work, but no external push message is sent. Outbox rows are retained for dispatch when enabled and should be monitored until Firebase is configured. Client-side sound playback remains a separate client feature.

## Remaining backend work

Online payment/refunds, advanced reporting beyond the daily report, cross-tenant end-to-end tests, precise geospatial delivery-zone coverage, and client-side sound playback remain future work. Cash-on-delivery and cash-at-counter payment collection are implemented; online payment-provider integration requires selecting/configuring a provider. Firebase delivery requires a real project, server credentials, and matching client token registration.


## Restaurant logo upload

Restaurant owners can upload or replace a logo using:

```http
POST /api/v1/restaurants/{restaurantId}/logo
Authorization: Bearer <supabase-access-token>
Content-Type: multipart/form-data
```

Use a multipart form field named `file`. Supported image formats are PNG, JPEG, and WebP; files are limited to 5 MB. The API verifies that the authenticated user is the OWNER of the specified restaurant, checks the file media type and signature, uploads the object to Supabase Storage, and updates `public.restaurants.logo_url`. Managers and other roles cannot use this endpoint.

No database migration is required because `logo_url` already exists. Create a Supabase Storage bucket named `restaurant-logos` (or set `SUPABASE_STORAGE_BUCKET` to another bucket name) and enable **public reads** so browsers and customer pages can display the logo. Uploads are proxied through the Spring Boot API using the server-only `SUPABASE_SERVICE_ROLE_KEY`; do not expose that key to the frontend and do not add broad client-side write policies to the bucket. The bucket must exist before using the upload endpoint.

The object is stored under `{restaurantId}/logo`; replacing the logo overwrites that object and the response includes a cache-busted public URL. The dashboard's create flow creates the restaurant first and uploads the optional image immediately afterward. If upload fails, the restaurant remains created and its ID is shown so the owner can retry from the update form.

## Restaurant member management and invitations

Restaurant membership endpoints require a valid Supabase Auth access token. Member-management operations additionally require `MEMBERS_MANAGE`, which is granted to the restaurant OWNER role. Every route is scoped to its restaurant ID.

### Invite a new team account

`POST /api/v1/restaurants/{restaurantId}/members/invitations`

Request:

```json
{
  "email": "staff@example.com",
  "fullName": "Example Staff",
  "role": "STAFF"
}
```

Allowed roles are `MANAGER`, `STAFF`, and `DELIVERY_DRIVER`. This endpoint does not allow OWNER creation or promotion. Supabase Auth sends the invitation email; the returned Auth user ID is linked to a membership in the selected restaurant. The profile trigger mirrors Auth email to `public.profiles` so listings can identify members.

An email already registered in Supabase Auth is rejected by this new-account invitation endpoint. Existing accounts can be attached through the existing `POST /api/v1/restaurants/{restaurantId}/members` endpoint using a known `userId`. A client-supplied user ID is never proof of the actor's identity.

### Manage existing members

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/v1/restaurants/{restaurantId}/members` | List members with profile email/name where available |
| POST | `/api/v1/restaurants/{restaurantId}/members` | Add an existing profile by user ID |
| PUT | `/api/v1/restaurants/{restaurantId}/members/{memberId}` | Change a non-owner member's role |
| POST | `/api/v1/restaurants/{restaurantId}/members/transfer-ownership` | Transfer owner role explicitly |
| DELETE | `/api/v1/restaurants/{restaurantId}/members/{memberId}` | Remove a non-owner membership without deleting the Auth account |

Owner membership cannot be changed or removed using ordinary endpoints. Use the dedicated ownership-transfer endpoint. Removing a restaurant membership never deletes the Supabase Auth account, because that account may belong to other restaurants.

### Required environment variables

- `SUPABASE_PROJECT_URL`: Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only Auth Admin credential. Keep it in the API host secret store; never expose it to browser/mobile code or commit it to Git.
- `SUPABASE_INVITE_REDIRECT_URL`: optional invitation landing URL. Add it to Supabase Dashboard → Authentication → URL Configuration → Redirect URLs.

Apply migration `20261025120000_add_profile_email_for_member_management.sql` before deploying the updated API. Keep `spring.jpa.hibernate.ddl-auto=validate`. Invitations return a configuration error until the server-side Auth Admin variables are configured.


## Supabase Storage media routes

All image uploads use `multipart/form-data` with a file part named `file`. Send the current Supabase Auth access token in `Authorization: Bearer <token>`; never send the service-role key to a client.

| Method | Route | Authorization | Result |
|---|---|---|---|
| POST | `/api/v1/restaurants/{restaurantId}/logo` | Restaurant OWNER | Uploads PNG/JPEG/WebP up to 5 MB to the restaurant-logo bucket and updates `restaurants.logo_url` |
| POST | `/api/v1/restaurants/{restaurantId}/products/{productId}/image` | `MENU_MANAGE` for that restaurant | Uploads a product image up to 5 MB, saves the public URL to `products.image_url`, and returns the updated product |
| POST | `/api/v1/restaurants/{restaurantId}/products/{productId}/variants/{variantId}/image` | `MENU_MANAGE` plus restaurant/product/variant scope checks | Uploads a separate variant image up to 5 MB, saves `product_variants.image_url`, and returns the updated variant |
| POST | `/api/v1/customer/profile/avatar` | Authenticated customer; JWT subject determines the target profile | Uploads PNG/JPEG/WebP up to 2 MB to the private avatar bucket and returns the customer profile with an expiring `avatarUrl` |

Storage checks both the declared MIME type and the PNG/JPEG/WebP file signature. Restaurant/product/variant IDs in the route are checked against each other before an upload is stored. A user cannot upload a product image for a different restaurant by guessing an ID.

Public menu images are stored in `menu-images` and may be viewed by anyone who has their URL. Customer avatars use the private `customer-avatars` bucket; `profiles.avatar_path` is the durable object path and the API signs it on profile reads. Signed avatar URLs expire after one hour and must not be persisted as the profile's canonical value. Keep `SUPABASE_SERVICE_ROLE_KEY` server-side.

Configure these buckets and exact names in Supabase Dashboard > Storage: `restaurant-logos` (public, 5 MB), `menu-images` (public, 5 MB), and `customer-avatars` (private, 2 MB). Restrict allowed MIME types to `image/png`, `image/jpeg`, and `image/webp`. Upload write permission is enforced by Spring Boot; do not create client upload policies that expose privileged writes.
