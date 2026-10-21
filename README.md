# Restaurant Platform

A multi-restaurant ordering and management backend built with Spring Boot, Spring Security, Spring Data JPA, and Supabase PostgreSQL/Auth.

## Current backend structure

- `app/api`: Spring Boot API, DTOs, entities, repositories, security, and service layer.
- `supabase/migrations`: versioned SQL schema. Apply migrations in timestamp order before running the API.
- `docs/architecture.md`: architecture, authentication, and authorization flow.
- `docs/api.md`: currently implemented HTTP routes, DTOs, permissions, and error codes.
- `docs/database-erd.md`: database ERD documentation remains to be completed against the current migrations.
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
- Optional: `DB_POOL_MAX_SIZE`, `APP_CORS_ALLOWED_ORIGINS`, `APP_SECURITY_JWT_REQUIRED_AUDIENCE`, `APP_SECURITY_JWT_SIGNING_ALGORITHM`

The JWT signing algorithm must match the Supabase project's asymmetric signing-key configuration served through its JWKS endpoint. Do not assume a value without checking the project settings. Database passwords and privileged credentials must remain server-side.

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
| GET | `/api/v1/customer/addresses` | List addresses owned by the signed-in customer |
| POST | `/api/v1/customer/addresses` | Save a customer delivery address |
| PUT | `/api/v1/customer/addresses/{addressId}` | Update own saved address |
| PATCH | `/api/v1/customer/addresses/{addressId}/default` | Set own default address |
| DELETE | `/api/v1/customer/addresses/{addressId}` | Delete own address |
| GET | `/api/v1/customer/restaurants/{restaurantId}/delivery-zones` | List the restaurant's active delivery zones |
| POST | `/api/v1/customer/restaurants/{restaurantId}/orders/delivery` | Authenticated delivery checkout using saved address, zone, and database-priced items |
| GET | `/api/v1/customer/orders` | Paginated order history for the current customer |
| GET | `/api/v1/customer/orders/{orderId}` | Own order detail, status timeline, payment and delivery status |

Order list page size is capped at 100; unsupported sort property names are ignored. Order detail and update lookups use both order ID and restaurant ID so an ID from another restaurant does not grant access. Status updates lock the restaurant-scoped order row and write the status history in the same transaction.

Queue polling, in-app notifications, delivery assignment, driver task/status APIs, default-driver configuration, customer address management, authenticated delivery checkout, and customer order history are exposed. Checkout computes prices and fees on the server and supports cash on delivery only. Online payments, profile editing, restaurant/menu administration, external push delivery, and client-side sound playback remain future work.

## Security model

Supabase Auth authenticates users. Spring Security validates bearer JWTs, while the backend must enforce restaurant membership, permissions, customer ownership, and assigned-driver scoping for each operation. RLS remains enabled where defined by the database migrations; privileged server-side database access does not replace application authorization.

Before production deployment, use a least-privilege database role where practical, confirm tenant-isolation behavior, review the pending management API work, and run the full Maven verification against the current branch.
