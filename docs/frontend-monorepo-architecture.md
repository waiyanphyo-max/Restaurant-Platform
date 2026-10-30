# Frontend monorepo architecture (M1)

**Status:** Starter foundation. This document defines boundaries and acceptance gates; it does not claim the new applications are feature-complete or ready for production traffic. Read the [M0 frontend reset audit](frontend-reset-audit.md) and [PAD-001](product-architecture-decision.md) before extending a client.

## Workspace map

| Path | Purpose | Tenant model |
| --- | --- | --- |
| `app/api` | Existing Spring Boot API and security; protected | Shared, server-enforced tenant/role boundaries |
| `apps/admin-web` | Next.js Platform Admin site | Global; platform-admin allowlist checked by backend |
| `apps/guest-web` | Next.js guest site | One configured restaurant per exact host/domain |
| `apps/operations-mobile` | React Native Operations project | One configured restaurant per Android build |
| `apps/customer-mobile` | Separate React Native Customer project | One configured restaurant per Android build |
| `packages/shared-types` | Transport DTO/types only | No tenant selection or authorization decisions |
| `packages/api-client` | Platform-neutral Spring HTTP transport | Caller supplies trusted base URL, auth adapter, and restaurant scope |
| `packages/ui-tokens` | Primitive design values | No React components or platform runtime imports |
| `configs/restaurants` | Validated public tenant/brand registry | Real `<slug>.json` files only; example template is excluded |
| `supabase` | Existing migrations and schema/security rules; protected | Shared PostgreSQL/Auth |

The root is an npm workspace requiring Node 22.13.0 or newer. Each app and package owns its TypeScript/lint/test configuration. The root lockfile keeps Supabase CLI and other existing root tooling. CI installs with `npm ci` and runs `npm run verify:frontend`; Maven backend verification remains a separate protected workflow. `apps/web` is the M0 placeholder, not an active workspace.

| Root command | Scope |
| --- | --- |
| `npm run build:packages` | Compile/validate shared workspaces first |
| `npm run build:web` | Build both Next.js starter apps |
| `npm run build:mobile:starter` | Export Android JavaScript bundles for both native starters; this is not a signed APK/AAB |
| `npm run typecheck`, `npm run lint`, `npm run test` | Check all frontend workspaces |
| `npm run verify:frontend` | Combined frontend validation gate |
| `npm run dev:admin`, `npm run dev:guest` | Start web development servers |
| `npm run start:operations`, `npm run start:customer` | Start the separate native development projects |

## Allowed dependency direction

`apps/*` may import `@restaurant-platform/shared-types`, `@restaurant-platform/api-client`, `@restaurant-platform/ui-tokens`, and `@restaurant-platform/restaurant-config`. `api-client` may import `shared-types`. Neither shared package imports an application, browser-only API, React Native runtime, Next.js server code, Spring entity, or Supabase service-role client. `ui-tokens` supplies serializable values; web and native apps own their renderers, components, navigation, accessibility, session storage, and auth callback handling.

The existing [API contract](api.md) is authoritative. Shared DTOs represent wire shapes; they are not a second business schema. Review each DTO against the backend route/request/response and evolve it with API contract tests. The backend remains responsible for QR validation, price/stock calculation, idempotency, tenant membership, role permissions, platform allowlists, and customer ownership. A client may provide a narrower UI scope, never broaden backend access.

## Restaurant configuration

`configs/restaurants` is the `@restaurant-platform/restaurant-config` workspace. A real `<slug>.json` record has schema version 1 and these public fields:

| Field | Meaning |
| --- | --- |
| `slug`, `restaurantId` | Stable configured slug and backend restaurant UUID |
| `branding.displayName`, `branding.primaryColor`, `branding.logoUrl` | Public restaurant brand; real records require a public HTTPS logo URL |
| `guestDomains.staging[]`, `guestDomains.production[]` | Exact allowlisted guest hosts for each environment |
| `android.operations` and `android.customer` | Separate `stagingApplicationId`, `productionApplicationId`, `displayName`, and local PNG `iconPath` per product |

Validation must reject duplicate slugs, restaurant IDs, guest hosts, or Android IDs; malformed UUIDs/hosts/colors; unsafe asset URLs; and missing selected records or required logo/icon assets. The `.example.json` template is documentation only and must not be loaded as a real tenant. M1 includes no real restaurant configuration; a missing tenant must fail closed rather than silently using example business data. A development fixture under `configs/restaurants/fixtures/` may support starter export tests but is never a staging or production tenant.

The configuration is public app metadata, not a secret vault. Never place service-role keys, DB passwords, Firebase server credentials, signing keys, raw QR credentials, or customer data in it. Real restaurant/domain onboarding requires verified ownership, approved assets, and configuration review.

## Guest domain routing and legacy URLs

`apps/guest-web` selects one tenant from the trusted, canonical request host using `GUEST_CONFIG_ENV=staging|production` and `resolveRestaurantByHost(host, env)`. Unknown or ambiguous hosts fail closed. The deployment ingress must pass the intended host without trusting arbitrary forwarded-host headers. A `restaurantId` query on a legacy URL must match the host-resolved restaurant or take a separately reviewed compatibility path; it must not silently switch the active tenant. Localhost is accepted only when an actual staging registry record explicitly lists `localhost` as a staging hostname; the request port is ignored by the resolver. The current config package reads real JSON records dynamically, so a future standalone deployment must explicitly package those validated files or use a generated registry; M1 has no deployable registry.

The new guest application must keep these previously distributed paths working before production cutover:

```text
/?view=customer-pickup&restaurantId=<uuid>#qrToken=<url-encoded-common-token>
/workspace?view=table-order&restaurantId=<uuid>#qrToken=<url-encoded-table-token>
/workspace?restaurantId=<uuid>
/auth/callback
/auth/accept-invite
```

QR fragments are not sent with HTTP requests. Browser code must read them before navigation, keep them out of logs/analytics/query strings, and remove them from visible history. A server redirect cannot read a fragment; any cross-domain compatibility handoff must run in a controlled browser entry and preserve the fragment until the destination captures it. The owner `/workspace` URL needs a safe Operations-app or support handoff; its restaurant ID is a hint, not proof of membership. Auth callback/invite routes must retain exact allowlisted paths but cannot be sent production traffic until real Supabase session handling is implemented. Public guest QR calls remain unauthenticated.

The backend currently generates Common QR and owner links from one `APP_PUBLIC_WEB_BASE_URL`. Per-restaurant guest domains therefore do not arise automatically from backend provisioning. See the [production URL migration plan](production-url-migration.md) before changing that variable.

## Mobile build selection and tenant lock

The two mobile workspaces are separate React Native/Expo projects. A build selects `RESTAURANT_SLUG`, `MOBILE_ENV=development|staging|production`, and `PUBLIC_API_BASE_URL`. Dynamic app configuration loads the real registry entry and chooses the product-specific Android application ID and public brand. Missing/unknown slug or environment, or selecting the example template, must fail before export/build. The exact `starter-fixture` slug is permitted only with `MOBILE_ENV=development` for starter export tests; it is never a staging or production default.

Operations and Customer packages have different app IDs even for the same restaurant/environment. Native signing and Play Console details remain outside source control. Operations shows only the configured restaurant after membership validation; Customer orders only from the configured restaurant. Server-side checks remain authoritative even if a modified client sends a different ID. There is no runtime marketplace or cross-restaurant selector.

## Environment and credential boundaries

| Surface | Public configuration | Private/server configuration |
| --- | --- | --- |
| Backend | API origin advertised to clients | DB credentials, `SUPABASE_SERVICE_ROLE_KEY`, JWT validation config, `APP_PUBLIC_WEB_BASE_URL`, `SUPABASE_INVITE_REDIRECT_URL`, `APP_CORS_ALLOWED_ORIGINS`, Firebase server credentials |
| Web | Trusted Spring API origin, deployment environment, and guest host allowlist; Supabase project URL/publishable key only after real auth integration | Any server-only web secret must remain server-side; do not use backend service credentials |
| Mobile | Validated restaurant/brand metadata, API origin, product/environment-specific app ID; Supabase URL/publishable key only after native auth integration | Signing keys, push server credentials, service-role/DB secrets remain outside APK and Git |

Staging and production use separate API origins, Supabase/Auth settings, domain allowlists, app IDs, signing/release tracks, and secrets. Do not infer that the existing Spring URL/CORS configuration or Supabase Auth redirect allowlists have been changed. Add the new origins/redirects deliberately and test them before switching traffic. Native clients are not subject to browser CORS, but still require HTTPS and backend JWT/tenant enforcement.

## UI sharing rule

Share values and contract code that behave the same across platforms: DTOs, request semantics, error mapping, idempotency helpers, and design tokens. Keep web components in their web app and native components in their native app unless a specific cross-platform component proves the same accessibility, navigation, input, and rendering behavior on both. Platform Admin, Guest, Operations, and Customer do not share an application shell. Restaurant branding can reuse token values, but each product applies them through its own renderer.

## Validation and release gate

M1 checks workspace installation/commands, TypeScript, lint, focused tests, Next.js starter builds, mobile starter export/build where the available toolchain permits, and unchanged protected backend/Supabase trees. The [M1 acceptance checklist](m1-acceptance.md) records the commands and limitations. No starter or M0 placeholder is a production replacement. Keep legacy production pages and URLs live until the [URL migration plan](production-url-migration.md) is completed.
