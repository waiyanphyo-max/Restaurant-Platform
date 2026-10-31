# Spring API clients

The factories accept a configured API origin, never an origin entered by an end user. HTTPS is required except for explicit loopback/emulator development hosts. Paths and UUIDs are constructed inside the package; redirects, cookies, caching, and referrers are disabled for requests.

| Factory | Boundary |
| --- | --- |
| `createPublicRestaurantApiClient` | Fixed restaurant public menu, modifiers and QR checkout; queue credentials stay in `X-Queue-Token`. It accepts no session provider and never sends a bearer token. |
| `createPlatformAdminApiClient` | Overview, searchable registry, restaurant detail, verified-identity provisioning, active status and branding/deployment metadata. Spring's validated UUID allowlist decides access. |
| `createRestaurantMemberApiClient` | Fixed restaurant operations. `getConfiguredMembership` returns only that restaurant's active membership. Spring decides every permission. |
| `createCustomerApiClient` | UUID-owned account profile/addresses and fixed restaurant delivery checkout. |

Authenticated clients require `getAccessToken`, supplied by the platform's Supabase Auth adapter. It is called for each attempt; tokens are neither stored nor logged by this package. A local session or role label is not authorization. The backend validates JWTs and tenant/record access.

Methods accept an optional `ApiRequestOptions` with `signal` and `timeoutMs` (default 15 seconds per HTTP attempt, including response body). GET requests retry once after a transient network/timeout error or HTTP 429/502/503/504. QR POST requests retry once only when the caller supplies an idempotency key; the exact body and key are reused. Other writes and all 401/403 responses never retry. `Retry-After` seconds and HTTP dates are honored up to two seconds; longer waits return the error to the caller without retrying early. Cancelling stops attempts and retry waits.

Handle `ApiHttpError` using `status`, stable `code`, and `fieldErrors`; `serverMessage` is the localized Spring message. `MissingAccessTokenError`, `ApiNetworkError`, `ApiTimeoutError`, `ApiCancelledError`, `ApiProtocolError`, `ApiConfigurationError`, and `TenantAccessError` distinguish local failures without including credentials or raw response bodies in their messages.

Wire DTOs mirror inspected Java records in `packages/shared-types`. They are compile-time types, not a generated runtime schema. Tenant IDs are additionally checked on responses that include them, including the nested restaurant in platform detail and mutation responses. Platform provisioning rejects legacy responses containing QR credentials and checks a requested existing Owner UUID against the returned UUID. These guards supplement Spring authorization.

M4 adds `getRestaurant`, `provisionRestaurant`, `updateRestaurantStatus`, and `updateRestaurantConfiguration`. Provisioning optionally accepts an existing `ownerUserId`; Spring verifies that exact UUID and confirmed email through Supabase Auth Admin. A new invitation binds only the provider-returned UUID. These mutations are never automatically retried. See `docs/m4-acceptance.md` for contracts, retry instructions, migration requirements and verification boundaries. The historical M2 coverage audit is in `docs/api-coverage-gap-report.md`; global customer history remains outside branded clients.

The API-client tests include actual `fetch` against a temporary loopback HTTP fixture server. They verify transport and contracts; Spring authorization is verified separately by backend HTTP tests. No remote provider or database is contacted by the loopback test.
