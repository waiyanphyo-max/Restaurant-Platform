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

The delivery authorization helpers require checks against the delivery assignment and the linked order's restaurant. Do not replace them with a generic restaurant-membership check when adding delivery endpoints.

`ManagerOrderService` includes method-level `@PreAuthorize` checks for reading orders and updating order status, and retains service-level identity, permission, restaurant-scoping, transition, and cancellation checks. Controller-level protection must be maintained when protected controllers are added.

## Currently exposed HTTP routes

The filter chain permits only these current public route shapes:

- `GET /api/v1/public/restaurants/{restaurantId}/menu`
- `POST /api/v1/public/restaurants/{restaurantId}/orders/common-qr`
- `POST /api/v1/public/restaurants/{restaurantId}/orders/table-qr`

All other routes require authentication by default. A public queue tracking controller, manager order controller, delivery controller, restaurant administration controller, and customer account controllers have not yet been exposed in the current backend source.

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
- Ensure each future delivery endpoint uses `canAccessDelivery`, `canUpdateDeliveryStatus`, or an equivalent scoped check before reading or mutating delivery data.
