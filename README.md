# Restaurant Platform

A multi-restaurant ordering and management platform with a Spring Boot backend, Supabase PostgreSQL/Auth, and a Next.js operations dashboard with a Common QR guest pickup flow.

## Current backend structure

- `app/api`: Spring Boot API, DTOs, entities, repositories, security, and service layer.
- `apps/web`: responsive Next.js frontend. `/workspace` includes role-aware restaurant operations, catalogue/media, table QR ordering, team/settings, customer delivery checkout, customer profile/addresses/order history, notifications and device management. The root page retains the Common QR guest pickup flow; see `apps/web/README.md` for setup and current limitations.
- `supabase/migrations`: versioned SQL schema. Apply migrations in timestamp order before running the API.
- `docs/architecture.md`: architecture, authentication, and authorization flow.
- `docs/api.md`: currently implemented HTTP routes, DTOs, permissions, and error codes.
- `docs/database-erd.md`: entity relationships, schema ownership, and migration workflow.
- `.env.example`: sample backend environment variables only; never put real secrets in this file or in the frontend.

The database schema remains the source of truth. Hibernate is configured with `ddl-auto: validate`; it must not create or modify production schema.

## Requirements

- JDK 21
- Maven 3.9+ (or a compatible Maven version)
- A Supabase project with its PostgreSQL database and Supabase Auth configured

## Configure environment

Provide the variables shown in `.env.example` in your shell or IDE run configuration:

- `SUPABASE_DB_URL`, `SUPABASE_DB_USERNAME`, `SUPABASE_DB_PASSWORD`
- `SUPABASE_AUTH_ISSUER`, `SUPABASE_JWKS_URL`
- `SUPABASE_PROJECT_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server-only; never expose as `NEXT_PUBLIC_*`)
- `SUPABASE_STORAGE_BUCKET_RESTAURANT_LOGOS` (public-read logo bucket; legacy `SUPABASE_STORAGE_BUCKET` remains a fallback)
- `SUPABASE_STORAGE_BUCKET_MENU_IMAGES` (public-read product and variant image bucket)
- `SUPABASE_STORAGE_BUCKET_CUSTOMER_AVATARS` (private customer avatar bucket; API produces signed URLs)
- Optional: `DB_POOL_MAX_SIZE`, `APP_CORS_ALLOWED_ORIGINS`, `APP_SECURITY_JWT_REQUIRED_AUDIENCE`, `APP_SECURITY_JWT_SIGNING_ALGORITHM`, `APP_IDEMPOTENCY_ENCRYPTION_KEY`, `APP_PUSH_FIREBASE_ENABLED`, `APP_PUSH_FIREBASE_SERVICE_ACCOUNT_JSON`, `APP_PUSH_OUTBOX_POLL_INTERVAL_MS`, `APP_PUSH_OUTBOX_BATCH_SIZE`, `APP_PUSH_OUTBOX_MAX_ATTEMPTS`, `APP_PUSH_OUTBOX_MAX_RETRY_DELAY_SECONDS`

The JWT signing algorithm must match the Supabase project's asymmetric signing-key configuration served through its JWKS endpoint. Do not assume a value without checking the project settings. Database passwords and privileged credentials must remain server-side. To enable safe retry protection for public QR checkout, apply the `20261024083000_add_qr_order_idempotency.sql` migration and set `APP_IDEMPOTENCY_ENCRYPTION_KEY` to Base64-encoded 32 random bytes on the API server. The header is optional; clients should reuse a key only when retrying the exact same checkout request. See `docs/api.md` for details. To enable provider-backed push delivery, apply `20261024100000_add_push_notification_outbox.sql`, create/configure your Firebase project and client registration tokens, then set `APP_PUSH_FIREBASE_ENABLED=true`. Supply `APP_PUSH_FIREBASE_SERVICE_ACCOUNT_JSON` as a server-side secret or configure Google Application Default Credentials in the hosting environment. Firebase is deliberately off by default, and the backend will not pretend to send push messages without credentials. See `docs/api.md` for deployment and retry behavior.

## Build and tests

From the repository root:

```bash
mvn --batch-mode -f app/api/pom.xml clean verify
```

GitHub Actions also runs the same Maven verification command for pushes to `main` and `ai/**` branches and for relevant pull requests.

To start the API after the environment variables are configured:

```bash
mvn -f app/api/pom.xml spring-boot:run
```

## Implemented HTTP routes

| Method | Route | Access |
|---|---|---|
| GET | `/api/v1/public/restaurants/{restaurantId}/menu` | Public |
| POST | `/api/v1/public/restaurants/{restaurantId}/orders/common-qr` | Public QR flow; validates restaurant QR configuration/token in the service |
| POST | `/api/v1/public/restaurants/{restaurantId}/orders/table-qr` | Public QR flow; validates restaurant/table QR data in the service |
| GET | `/api/v1/restaurants/{restaurantId}/orders` | Authenticated member with `ORDER_READ`; supports `page`, `size`, and `status` |
| POST | `/api/v1/restaurants/{restaurantId}/orders/staff` | Member with `ORDER_CREATE`; creates dine-in or takeaway order for walk-in customers |
| GET | `/api/v1/restaurants/{restaurantId}/orders/{orderId}` | Authenticated member with `ORDER_READ`; order, items, modifiers, and status history |
| PATCH | `/api/v1/restaurants/{restaurantId}/orders/{orderId}/status` | Authenticated member with applicable order/queue/delivery permissions |
| GET | `/api/v1/restaurants/{restaurantId}/queue-tickets?status=READY` | Authenticated member with `QUEUE_MANAGE`; current local queue day |
| PATCH | `/api/v1/restaurants/{restaurantId}/queue-tickets/{ticketId}/call` | Authenticated member with `QUEUE_MANAGE`; calls a READY ticket and creates an in-app notification |
| GET | `/api/v1/public/queue-tickets/{ticketId}/status` | Requires the ticket's `X-Queue-Token` header |
| GET | `/api/v1/public/queue-tickets/{ticketId}/notifications` | Requires the ticket's `X-Queue-Token` header |
| PATCH | `/api/v1/public/queue-tickets/{ticketId}/notifications/{notificationId}/read` | Requires the ticket's `X-Queue-Token` header |
| GET | `/api/v1/notifications?status=PENDING` | Authenticated user; returns only notifications addressed to the JWT subject |
| PATCH | `/api/v1/notifications/{notificationId}/read` | Authenticated user; read access is scoped by notification ID and user ID |
| GET | `/api/v1/restaurants/{restaurantId}/deliveries?status=ASSIGNED` | Restaurant delivery queue; drivers are restricted to their own deliveries |
| GET | `/api/v1/restaurants/{restaurantId}/deliveries/mine` | Tasks assigned to the authenticated user |
| GET | `/api/v1/restaurants/{restaurantId}/deliveries/{deliveryId}` | Restaurant-scoped delivery detail; assigned-driver checks apply |
| PATCH | `/api/v1/restaurants/{restaurantId}/deliveries/{deliveryId}/assign` | Manager/owner assigns a same-restaurant delivery driver |
| PATCH | `/api/v1/restaurants/{restaurantId}/deliveries/{deliveryId}/status` | Driver/authorized member updates delivery lifecycle |
| GET | `/api/v1/restaurants/{restaurantId}/delivery-settings/default-driver` | Read the restaurant's default delivery driver |
| PATCH | `/api/v1/restaurants/{restaurantId}/delivery-settings/default-driver` | Owner/manager sets a default driver member |
| GET | `/api/v1/my/restaurants` | List restaurants joined by the signed-in user |
| POST | `/api/v1/restaurants` | Create restaurant and bootstrap current user as OWNER |
| GET | `/api/v1/restaurants/{restaurantId}` | Read member-visible restaurant profile |
| GET | `/api/v1/restaurants/{restaurantId}/orders/{orderId}/payments` | List order payment status for cashier/manager |
| PATCH | `/api/v1/restaurants/{restaurantId}/orders/{orderId}/payments/{paymentId}/collect` | Collect a pending cash-at-counter payment |
| GET | `/api/v1/restaurants/{restaurantId}/reports/daily?date=2026-10-21` | OWNER/MANAGER daily operations report in restaurant timezone |
| PUT | `/api/v1/restaurants/{restaurantId}/profile` | Update restaurant profile fields |
| POST | `/api/v1/restaurants/{restaurantId}/logo` | Owner-only PNG/JPEG/WebP logo upload (multipart field `file`, max 5 MB) |
| POST | `/api/v1/restaurants/{restaurantId}/products/{productId}/image` | MENU_MANAGE product image upload to Supabase Storage (multipart `file`, max 5 MB) |
| POST | `/api/v1/restaurants/{restaurantId}/products/{productId}/variants/{variantId}/image` | MENU_MANAGE product variant image upload (multipart `file`, max 5 MB) |
| POST | `/api/v1/customer/profile/avatar` | Upload the authenticated customer's avatar to private Storage (multipart `file`, max 2 MB); returns a short-lived signed URL in `avatarUrl` |
| GET/PUT | `/api/v1/restaurants/{restaurantId}/settings` | Read or update operational settings |
| POST | `/api/v1/restaurants/{restaurantId}/settings/common-qr-token/rotate` | Rotate Common QR token (returned once) |
| GET/POST | `/api/v1/restaurants/{restaurantId}/delivery-zones` | List or create delivery zones |
| PUT | `/api/v1/restaurants/{restaurantId}/delivery-zones/{zoneId}` | Update or deactivate a delivery zone |
| GET/POST | `/api/v1/restaurants/{restaurantId}/members` | Owner lists or adds restaurant members |
| PUT/DELETE | `/api/v1/restaurants/{restaurantId}/members/{memberId}` | Owner changes/removes a non-owner member |
| POST | `/api/v1/restaurants/{restaurantId}/members/transfer-ownership` | Transfer ownership to an existing member; previous owner becomes MANAGER |
| GET/POST | `/api/v1/restaurants/{restaurantId}/tables` | List tables or create table with one-time QR token |
| PUT | `/api/v1/restaurants/{restaurantId}/tables/{tableId}` | Update table number/availability |
| POST | `/api/v1/restaurants/{restaurantId}/tables/{tableId}/qr-token/rotate` | Rotate one table's QR token |
| GET/POST | `/api/v1/restaurants/{restaurantId}/categories` | List or create categories |
| PUT | `/api/v1/restaurants/{restaurantId}/categories/{categoryId}` | Update or deactivate a category |
| GET/POST | `/api/v1/restaurants/{restaurantId}/products` | List or create products |
| PUT | `/api/v1/restaurants/{restaurantId}/products/{productId}` | Update product and stock settings |
| GET/POST/PUT | `/api/v1/restaurants/{restaurantId}/products/{productId}/variants` | Manage product variants |
| GET/POST/PUT | `/api/v1/restaurants/{restaurantId}/modifier-groups` | Manage modifier groups |
| POST/PUT | `/api/v1/restaurants/{restaurantId}/modifier-groups/{groupId}/options` | Manage modifier options |
| GET/PUT/DELETE | `/api/v1/restaurants/{restaurantId}/products/{productId}/modifier-groups/{groupId}` | Manage product/modifier group links |
| GET | `/api/v1/public/restaurants/{restaurantId}/products/{productId}/modifier-groups` | Public available modifier options |
| GET | `/api/v1/customer/profile` | Get the signed-in customer's profile |
| PUT | `/api/v1/customer/profile` | Update full name, phone and preferred language |
| GET | `/api/v1/customer/addresses` | List addresses owned by the signed-in customer |
| POST | `/api/v1/customer/addresses` | Save a customer delivery address |
| PUT | `/api/v1/customer/addresses/{addressId}` | Update own saved address |
| PATCH | `/api/v1/customer/addresses/{addressId}/default` | Set own default address |
| DELETE | `/api/v1/customer/addresses/{addressId}` | Delete own address |
| GET | `/api/v1/customer/restaurants/{restaurantId}/delivery-zones` | List the restaurant's active delivery zones |
| POST | `/api/v1/customer/restaurants/{restaurantId}/orders/delivery` | Authenticated delivery checkout using saved address, zone, and database-priced items |
| GET | `/api/v1/customer/orders` | Paginated order history for the current customer |
| GET | `/api/v1/customer/orders/{orderId}` | Own order detail, status timeline, payment and delivery status |
| POST | `/api/v1/customer/orders/{orderId}/cancel` | Cancel own PENDING order and release reserved stock |
| POST | `/api/v1/customer/orders/{orderId}/reorder` | Reorder an own completed/cancelled delivery using fresh checkout validation |
| GET | `/api/v1/devices` | List own registered device metadata without raw push tokens |
| POST | `/api/v1/devices` | Register or reactivate one's push token |
| DELETE | `/api/v1/devices/{deviceId}` | Deactivate an owned device |

Order list page size is capped at 100; unsupported sort property names are ignored. Order detail and update lookups use both order ID and restaurant ID so an ID from another restaurant does not grant access. Status updates lock the restaurant-scoped order row and write the status history in the same transaction.

Queue polling, in-app notifications, delivery assignment, driver task/status APIs, default-driver configuration, customer profile/address management, authenticated delivery checkout, customer order history/reorder, owner transfer, and the daily operations report are exposed. A migration keeps `profiles` rows synchronized with Supabase Auth and another configures each restaurant's default delivery driver. Checkout computes prices and fees on the server and supports cash on delivery for customer delivery orders. The web frontend now exposes responsive workflows for owners, managers, staff, delivery drivers, and customers, as well as public Common QR pickup and table QR ordering. Online payment/refund provider integration is not implemented; external push delivery requires server-side Firebase configuration and a client/provider-generated token. Guest Common QR queue updates use opt-in polling and browser sound.

## Web client

The Next.js app in `apps/web` uses thin App Router entry files, reusable shared/domain components, feature modules, and a small shared API/media layer. The home route retains Common QR guest pickup. The `/workspace` route renders role-oriented operations, restaurant/catalogue management, driver, guest table QR, and customer workflows. See `apps/web/README.md` for the source tree, setup, authentication boundaries, and current integration limits.

The workspace shell currently keeps shared state and API orchestration in `features/workspace/WorkspaceClient.tsx`; individual views are grouped by domain in `features/workspace/views/`. UI navigation is a usability feature only: the Spring Boot API remains responsible for enforcing authorization. Production Supabase browser sign-in/refresh, online payment/refund integration, external push-provider setup, and deployment configuration remain future work.

Run it locally with:

```powershell
cd apps/web
Copy-Item .env.example .env.local
npm install
npm run dev
```

The default API URL is `http://localhost:8080`. Update `NEXT_PUBLIC_API_BASE_URL` in `.env.local` when the API runs elsewhere, and configure Spring CORS to allow the web origin.

## External push notification delivery

The API retains in-app notification history. When a user notification is inserted and the user has active device registrations, the migration trigger creates a durable outbox row per device. With Firebase enabled, a scheduled worker sends those rows via Firebase Cloud Messaging, retries transient failures with bounded exponential backoff, and deactivates tokens that FCM reports as unregistered. Public Common QR queue notifications have no signed-in user/device association and continue to use queue-token polling and client-side sound.

Push delivery requires a real Firebase project and server credentials; it is disabled by default. When disabled, the API continues creating in-app notifications but does not send external messages. The outbox should be monitored/configured before enabling device registrations in production.

## Security model

Supabase Auth authenticates users. Spring Security validates bearer JWTs, while the backend must enforce restaurant membership, permissions, customer ownership, and assigned-driver scoping for each operation. RLS remains enabled where defined by the database migrations; privileged server-side database access does not replace application authorization.

Before production deployment, use a least-privilege database role where practical, confirm tenant-isolation behavior, review the pending management API work, and run the full Maven verification against the current branch.


## Supabase Storage media setup

Create three buckets in Supabase Dashboard > Storage with these exact names:

| Bucket | Public access | File limit | Allowed MIME types | Purpose |
|---|---|---:|---|---|
| `restaurant-logos` | Public read | 5 MB | PNG, JPEG, WebP | Restaurant branding |
| `menu-images` | Public read | 5 MB | PNG, JPEG, WebP | Product and product-variant images |
| `customer-avatars` | Private | 2 MB | PNG, JPEG, WebP | Customer profile photos |

Uploads are made through Spring Boot using the server-only service-role key after application authorization; do not add browser Storage write policies or expose the key to Next.js/mobile code. Public-read buckets allow anyone with an object URL to view the images, but upload still goes through the authenticated API. Customer avatars are stored in a private bucket and the API returns a signed URL that expires after one hour; the database stores `profiles.avatar_path`, not the temporary URL.

Menu object paths are unique per upload (restaurant/product/variant scopes plus a random filename) so an image replacement does not reuse a cached URL. Product images use `products.image_url`, variant images use the new `product_variants.image_url`, restaurant logos use `restaurants.logo_url`, and private avatars use `profiles.avatar_path`. The existing `profiles.avatar_url` column is retained for compatibility with any legacy public avatar URLs.

Before applying the database migration, inspect the current state:

```powershell
npx supabase migration list
npx supabase db push --dry-run
```

Confirm that `20261025130000_add_storage_media_fields.sql` is the intended pending migration, then run `npx supabase db push`. Do not edit an already-applied migration.
