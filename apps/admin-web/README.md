# Platform Admin web · M4

Next.js platform administration at `http://localhost:3001`. Spring Boot supplies all business data and authorizes every read and mutation using a verified JWT UUID and its server-side `PLATFORM_ADMIN_USER_IDS` allowlist.

## Run locally

From the repository root:

```powershell
Copy-Item apps/admin-web/.env.example apps/admin-web/.env.local
# Fill in this environment's public Auth configuration and API origin.
npm run build:packages
npm run dev:admin
```

Set `APP_STAGE=local`, `ADMIN_WEB_ORIGIN=http://localhost:3001`, `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Deployed origins require HTTPS. Missing or invalid configuration fails closed. Never put service-role keys or the platform allowlist in browser variables.

The additive SQL file described in [M4 acceptance](../../docs/m4-acceptance.md) must exist in a target database before using the new metadata endpoints. This task creates the migration file only; it does not apply remote migrations.

## Routes and capabilities

| Route | Behavior |
| --- | --- |
| `/` | Real total, active/inactive restaurant, order and restaurant membership counts. Memberships count records, not unique people. |
| `/restaurants` | Server search and pagination, empty/error states and independent detail links. |
| `/restaurant-details?id=UUID` | Fresh platform detail by UUID, Owner invitation status, restaurant totals, branding, domains, Android metadata and confirmed activation/deactivation. |
| `/provisioning` | Validate and review restaurant identity, address/contact, timezone, currency and initial branding; create restaurant and onboard its Owner. |
| `/settings` | Verified Auth UUID, backend permission, environment, connection and sign-out. |
| `/login`, `/access` | Sign-in and configuration/access/service recovery. |
| `/auth/callback`, `/auth/accept-invite` | Verified Supabase authentication returns. |

Domain and Android configuration is metadata. Saving does not configure DNS, host a Guest Website or publish Android applications.

## Owner onboarding

For a new Owner, Spring invites the email using server-only Supabase Auth Admin access and assigns membership exclusively to the provider-returned UUID. For an existing account, supply its exact Supabase Auth UUID and email. Spring fetches that UUID from Auth Admin and requires its confirmed email to match. Profile contact strings never select the Owner.

A duplicate registered email requires an explicit verified UUID. If an invitation succeeds but a subsequent database write fails, check the registry and Auth identity before retrying; email delivery cannot be rolled back with the database transaction. Forms do not automatically retry mutations or save drafts to browser storage.

The detail screen resolves invitation status using the exact Owner membership UUID. Provider outages show an unavailable state. Phone onboarding remains gated until a verified backend identity workflow and SMS provider are ready; the restaurant contact phone is ordinary contact metadata.

Platform responses contain no raw QR credentials. Setup links contain only a restaurant UUID and optional `setup=qr`, lead to the Owner workspace and still require authorization. The Owner completes menu/table/QR setup in Operations.

## Authentication and request handling

- Middleware refreshes Supabase cookies, verifies claims and propagates private/no-store headers.
- Every protected page and server action independently calls the backend admin guard. Tokens are never serialized in component props.
- The shared authenticated Spring client obtains current tokens and disables caching. Supabase is used for authentication only.
- HTTP 401 returns to login; 403 returns to access recovery; missing backend allowlist and service outages have explicit recovery states.
- The platform client validates restaurant IDs in detail/mutation responses and rejects legacy provisioning responses containing QR credentials.
- SDK logout/account changes leave the workspace via full navigation. Session monitoring checks expiry and restored browser-history pages reload.
- Server actions return restricted result shapes and stable validation/recovery messages. Duplicate, unverified identity and provider-unavailable states are distinct.

## Checks

```powershell
npm run typecheck
npm run lint
npm test
npm run build -w @restaurant-platform/admin-web
```

Tests exercise protected routes, page and mutation guards, overview counts, registry search/pagination, UUID detail selection, onboarding status/configuration rendering, validation, unsafe setup links, error recovery and token/session behavior. Shared client tests include actual loopback HTTP transport; Spring tests exercise its controllers, services and authorization.

Live Supabase email delivery, invite acceptance and an authenticated browser walkthrough require configured accounts and a running backend. PostgreSQL migration/schema tests require Docker. See [M4 acceptance](../../docs/m4-acceptance.md) for the verification matrix and remaining provider/deployment boundaries.
