# Restaurant Platform

A multi-restaurant ordering and management backend built with Spring Boot, Spring Security, Spring Data JPA, and Supabase PostgreSQL/Auth.

## Current backend structure

- `app/api`: Spring Boot API, DTOs, entities, repositories, security, and service layer.
- `supabase/migrations`: versioned SQL schema. Apply migrations in timestamp order before running the API.
- `docs/architecture.md` and `docs/database-erd.md`: architecture and schema documentation (still to be completed against the verified implementation).
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

Order list page size is capped at 100; unsupported sort property names are ignored. Order detail and update lookups use both order ID and restaurant ID so an ID from another restaurant does not grant access. Status updates lock the restaurant-scoped order row and write the status history in the same transaction.

These routes are currently present in the repository. Queue-tracking HTTP routes and delivery/customer administration controllers are not exposed yet. A notification database row does not by itself deliver a push notification or audible alert.

## Security model

Supabase Auth authenticates users. Spring Security validates bearer JWTs, while the backend must enforce restaurant membership, permissions, customer ownership, and assigned-driver scoping for each operation. RLS remains enabled where defined by the database migrations; privileged server-side database access does not replace application authorization.

Before production deployment, use a least-privilege database role where practical, confirm tenant-isolation behavior, review the pending management API work, and run the full Maven verification against the current branch.
