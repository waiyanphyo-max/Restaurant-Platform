# Backend Architecture and Security

## Runtime architecture

- Spring Boot runs the REST API from `app/api` on the configured `PORT` (default `8080`).
- Spring Web MVC handles HTTP requests; request/response DTOs form the API boundary.
- Spring Data JPA/Hibernate accesses the existing Supabase PostgreSQL schema.
- Supabase SQL migrations are the schema source of truth. Hibernate uses `ddl-auto: validate` and must not mutate the schema.
- Supabase Auth authenticates users. The API validates Supabase access tokens; database membership records determine restaurant authorization.

## Authentication flow

1. The client obtains an access token from Supabase Auth and sends it as `Authorization: Bearer <access-token>`.
2. Spring Security's stateless OAuth2 Resource Server validates the token signature using the configured JWKS endpoint and configured signing algorithm.
3. The default issuer/timestamp validators check the issuer and token time validity. An additional validator requires the `authenticated` audience by default and another requires a UUID subject.
4. Application identity is taken from the validated JWT `sub` claim via `JwtAuthenticationToken`. Request-supplied user IDs are not accepted as proof of identity.
5. Restaurant permissions are loaded from `restaurant_members`; client JWT role claims do not grant restaurant permissions.

The signing algorithm must match the Supabase project's actual JWT signing-key configuration. The example configuration assumes an asymmetric signing algorithm and is not evidence of the algorithm used by any particular project. Verify the project settings before deployment.

## Authorization and tenant isolation

`RestaurantAuthorization` resolves membership using both `restaurant_id` and the authenticated JWT subject. Protected service methods should check the needed permission for the requested restaurant and scope resource lookups by that restaurant.

Current role intent:

- `OWNER`: all application-defined restaurant permissions.
- `MANAGER`: operational management permissions, excluding restaurant membership management.
- `STAFF`: order and queue operations needed for daily service; cannot assign drivers or manage membership/settings.
- `DELIVERY_DRIVER`: basic restaurant read plus delivery read/status permissions. A driver must also be the delivery's assigned user and the linked order must belong to the requested restaurant.

The delivery authorization helpers require checks against the delivery assignment and the linked order's restaurant. Delivery list endpoints restrict DELIVERY_DRIVER users to their own assigned tasks; management users can view the restaurant queue when authorized.

`ManagerOrderService` includes method-level `@PreAuthorize` checks for reading orders and updating order status, and retains service-level identity, permission, restaurant-scoping, transition, and cancellation checks. Controller-level protection must be maintained when protected controllers are added.

## Currently exposed HTTP routes

The filter chain permits only these current public route shapes:

- `GET /api/v1/public/restaurants/{restaurantId}/menu`
- `POST /api/v1/public/restaurants/{restaurantId}/orders/common-qr`
- `POST /api/v1/public/restaurants/{restaurantId}/orders/table-qr`

The following manager-order routes require a valid bearer token and an appropriate membership permission:

- `GET /api/v1/restaurants/{restaurantId}/orders?page=0&size=20&status=PENDING` — paginated list; optional status filter; service caps page size to 100 and whitelists sort properties.
- `GET /api/v1/restaurants/{restaurantId}/orders/{orderId}` — order details, item/modifier snapshots, and status history. The service first scopes the order by both IDs, then loads child data in batches.
- `PATCH /api/v1/restaurants/{restaurantId}/orders/{orderId}/status` — validated status transition and optional audit note. The update locks the order row scoped to that restaurant and records the authenticated actor in status history in the transaction.

All other application routes require authentication by default. Actuator health endpoints and Spring's `/error` path are explicitly permitted; health response details are hidden by configuration. Queue tracking, delivery management, customer address, and customer delivery-checkout controllers are exposed, while owner transfer, online payment/refunds, full reporting, and external push-provider delivery remain pending.

## Queue tracking and notification flow

Common QR order creation returns a high-entropy tracking token once. The server persists only its SHA-256 hash on `queue_tickets.public_token_hash`; the client must retain the raw token and send it in `X-Queue-Token`, not in the URL. Public queue status and ticket-notification requests validate that token before returning ticket data. Invalid tokens and unknown ticket IDs use the same not-found response.

When a queue-linked order is marked `READY`, `ManagerOrderService` updates the queue ticket and creates a `QUEUE_READY` in-app notification record in the order-status transaction. The manager queue operation `PATCH .../queue-tickets/{ticketId}/call` only accepts a ticket in `READY`, locks the ticket row scoped to its restaurant, updates it to `CALLED`, sets `called_at`, and inserts a `QUEUE_CALLED` notification record.

The public ticket notification endpoints scope every notification query/update to the validated queue ticket ID. Authenticated `/api/v1/notifications` endpoints scope by the validated JWT subject and do not accept a client-supplied user ID. Reading a notification marks its state `READ` with a UTC timestamp.

This is a database-backed in-app notification workflow. No external push provider or sound player is wired in the backend. Web/mobile clients must poll the queue status/notification route and play a sound locally when a new ready/called notification is observed.

## Delivery management flow

A delivery order creates a delivery task when staff moves the order to `READY`. The restaurant's `restaurant_settings.default_delivery_driver_user_id` is used for automatic assignment. If unset, the backend selects the earliest-added `DELIVERY_DRIVER` member and persists that user as the default. A manager/owner can change this with `PATCH /api/v1/restaurants/{restaurantId}/delivery-settings/default-driver`; the endpoint rejects users who are not delivery-driver members of that exact restaurant. With no registered driver, the delivery is kept in `WAITING_ASSIGNMENT`.

The delivery workflow locks the linked order before its delivery row to reduce concurrent status races. Assignment, delivery history, order history, and in-app notifications are persisted through the service layer. Driver task listing is scoped to the authenticated driver ID and restaurant ID. Driver pickup changes the linked order to `OUT_FOR_DELIVERY`; delivery completion changes it to `COMPLETED`. Failed deliveries require a reason and can be reassigned by authorized management.

## Customer address and delivery checkout

Customer-address APIs derive ownership from the validated JWT `sub`; all read/update/delete queries include that user ID. The first saved address becomes default, and deleting a default address promotes another saved address where available. The delivery checkout endpoint requires an active restaurant, enabled delivery, an active delivery zone belonging to that restaurant, and an address owned by the current user.

The checkout service calculates item/modifier prices from database records, checks stock and both restaurant/zone minimums, snapshots the destination into the order, and creates a `PENDING` cash-on-delivery payment record in the same transaction. Clients cannot provide order totals, fees, customer IDs, or creator IDs. Online payment processing is not implemented. Delivery zones currently carry names, fees, and minimums but no geographic polygons or township boundaries, so the customer selects a zone and the backend can only validate that it belongs to the restaurant.

## Restaurant onboarding

`POST /api/v1/restaurants` derives the initial owner from the authenticated JWT subject and creates the restaurant, settings (including a random Common QR token), and OWNER membership in one transaction. The raw Common QR token is returned only in the onboarding response for QR generation; settings/profile reads do not expose it. `GET /api/v1/my/restaurants` derives the user ID from the JWT and lists only their memberships. Restaurant profile changes require `SETTINGS_MANAGE`, and public slug is immutable through that endpoint.

## Membership administration

Membership mutation is restricted to `MEMBERS_MANAGE`, which the current role map grants to OWNER only. A new member must reference an existing profile, and the API accepts MANAGER, STAFF, or DELIVERY_DRIVER; it does not allow creating/deleting an OWNER without a dedicated owner-transfer process. If the configured default driver is removed or demoted, its restaurant setting is cleared.

## Table QR management

Dining table list/update responses never include their QR secrets. Creating a table or rotating its token returns the new random token once. A rotation invalidates the old printed QR token; the operator must reprint the corresponding table QR. The table creation/update APIs require `SETTINGS_MANAGE` and scope all IDs to a restaurant.

## Cash-on-delivery completion

A driver marking a delivery as `DELIVERED` must explicitly set `cashCollected: true` when a pending `CASH_ON_DELIVERY` payment exists. Payment status and `paid_at` are written together with delivery/order completion in the same transaction. The legacy manager order-status route rejects completion while a COD payment remains pending, avoiding a payment-confirmation bypass.

## Restaurant settings and delivery zones

Only members with `SETTINGS_MANAGE` can change operational settings or delivery zones. The settings response never includes the Common QR credential. Rotation creates a cryptographically random token and returns it once; since the database stores the token in plaintext to validate public QR orders, treat the returned value like a secret and reprint the QR after rotation. Settings validation checks the timezone and non-negative amount fields. Zone lookups and updates are scoped to the restaurant, with availability/minimum values checked by the checkout service.

## Catalog management

Category, product, variant, modifier-group, and modifier-option mutations require the restaurant's `MENU_MANAGE` permission; reads require `MENU_READ`. Every management lookup is scoped by restaurant ID and product/variant/group relationships. Stock tracking requires a non-negative quantity. Modifier selection rules enforce `minSelections <= maxSelections` and required groups need a positive minimum. Products cannot be ordered through inactive categories, and the public modifier endpoint only exposes active groups linked to an active product and available options.

## Customer profile lifecycle

Migration `20261022001000_sync_auth_user_profiles.sql` adds an `auth.users` insert trigger that creates the matching `public.profiles` row and backfills existing Auth users that lack one. It does not overwrite existing profile data on conflict. The trigger function is security-definer, uses an empty search path with fully-qualified objects, and revokes direct execute privileges from end-user roles. Customer profile GET/PUT endpoints always use the validated JWT subject as the profile ID. Supported preference values are `my-MM` and `en`.

## Customer order cancellation

`POST /api/v1/customer/orders/{orderId}/cancel` takes a pessimistic lock on the customer-owned order row and only permits cancellation while the order is `PENDING`. The same transaction releases each tracked product's reserved stock, marks pending payments `CANCELLED`, saves the order status and audit history, and returns the current customer order detail. The SQL migration `20261022002000_allow_cancelled_payment_status.sql` expands the allowed payment status values. Accepted/preparing orders cannot be cancelled through this endpoint; paid-payment refunds remain a separate future workflow.

## Customer order history and privacy

Customer order history queries use `orders.customer_id` derived from the validated JWT subject. The detail lookup combines `order_id` and `customer_id`; knowing an order UUID does not grant access. The response includes item/modifier snapshots, status timestamps, a safe summary of payment status, and the current delivery status without exposing internal payment transaction references or status-change actor IDs. Order history is read-only; customer cancellation/reorder workflows have not been implemented.

## Push-device registration

The authenticated `/api/v1/devices` endpoints associate device push tokens with the JWT subject, reject a token already owned by a different account, and never return raw tokens. Device deactivation is owner-scoped. Device-token persistence is not a push provider: server-side delivery to FCM/APNs/web-push is not yet connected, and the browser/mobile client remains responsible for local sound playback.

## Error handling

Business errors use `ApiException` and stable machine-readable codes. `GlobalExceptionHandler` maps validation, data conflicts, and framework `ResponseStatusException` errors into the shared `ApiErrorResponse` structure. Authentication/authorization filter errors are handled by `ApiSecurityErrorHandler`.

## Verification

Run the backend build and tests from the repository root:

```bash
mvn --batch-mode --no-transfer-progress -f app/api/pom.xml clean verify
```

GitHub Actions runs this command on pushes to `main` and `ai/**` branches, and relevant pull requests. Unit tests cover JWT validator behavior, restaurant membership isolation, assigned-driver checks, role permission boundaries, and error response status preservation.

## Production checks still required

- Confirm the Supabase project signing algorithm, issuer, JWKS URL, and audience from its actual project settings.
- Use least-privilege server-side database credentials and verify RLS behavior for the deployed DB role.
- Add authenticated API integration tests around the eventual controllers, including invalid/missing bearer tokens and cross-restaurant requests.
- Add authenticated API integration tests around default-driver configuration and delivery status endpoints, including cross-restaurant IDs and drivers attempting to access another driver's delivery.
