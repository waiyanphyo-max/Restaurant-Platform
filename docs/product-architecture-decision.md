# Product architecture decision

**Decision:** PAD-001 — Four client products on one restaurant platform
**Status:** Accepted for the M1 foundation; production cutover is pending
**Reviewed:** 2026-10-30
**Supersedes:** The 2026-10-28 plan for one multi-tenant mobile application

## Context

The M0 reset removed the legacy Next.js UI while preserving the Spring Boot API, Supabase schema/migrations, API contracts, and QR credentials. The [M0 audit](frontend-reset-audit.md) records the exact removed files and distributed URL formats. The previous decision combined restaurant operations and customer ordering in one Android app and treated all restaurants as choices inside that app. The product now requires separate restaurant-branded applications and websites.

## Decision

| Product | Source project | Tenant scope | Audience |
| --- | --- | --- | --- |
| Platform Admin website | `apps/admin-web` | Global platform scope, gated by backend platform-admin authorization | Platform operators |
| Guest website | `apps/guest-web` | One shared Next.js codebase; each configured restaurant has its own branded domain/site | Signed-out Common QR and Table QR guests |
| Operations Android app | `apps/operations-mobile` | One React Native codebase, built as a distinct restaurant-branded Android application per restaurant | Owner, Manager, Staff, Driver |
| Customer Android app | `apps/customer-mobile` | Separate React Native codebase, built as a distinct restaurant-branded Android application per restaurant | Signed-in home-delivery customers |

This is **not a marketplace mobile app**. A mobile build has one immutable restaurant identity from a validated build-time configuration. Neither mobile app offers cross-restaurant switching. Operations and Customer are separate application projects with separate Android application IDs, signing/release pipelines, and Play listings for each restaurant. They may share platform-neutral types, API transport, and design tokens; they do not share an application shell or role navigation.

The existing `app/api` Spring Boot service and `supabase` PostgreSQL/Auth project remain shared by all clients. The backend continues to validate JWTs, platform administrator allowlists, restaurant memberships and roles, customer ownership, QR credentials, prices, and order transitions. Hostname selection or an Android build-time restaurant ID is a client routing constraint, never proof of authorization.

## Repository boundaries

The target workspaces are `apps/admin-web`, `apps/guest-web`, `apps/operations-mobile`, `apps/customer-mobile`, `packages/api-client`, `packages/shared-types`, `packages/ui-tokens`, and `configs/restaurants`. Existing `app/api` and `supabase` are protected. `docs/api.md` is the authoritative HTTP contract; client DTOs must follow it and must not define a competing schema.

- `@restaurant-platform/shared-types` holds transport DTO shapes and narrow shared identifiers, without UI or server authorization logic.
- `@restaurant-platform/api-client` holds platform-neutral HTTP request/response behavior. Browser and native apps supply their own authentication/session adapters and trusted API origin.
- `@restaurant-platform/ui-tokens` holds reusable colors, spacing, typography values, and similar primitives. React components, navigation, storage, and auth callbacks stay in the owning app.
- Each app owns its runtime entry points, routing, native/web rendering, local state, and platform-specific accessibility. Sharing stops when the user interaction or security context differs.

See [frontend monorepo architecture](frontend-monorepo-architecture.md) for configuration and dependency rules.

## Restaurant identity and branding

Guest websites map a configured, canonical host to exactly one restaurant ID and branding record. Unknown, ambiguous, or mismatched hosts fail closed; a query parameter must not silently switch the tenant selected by the host. Each restaurant may use its own domain, name, logo, colors, and localized content. No restaurant identity or business data is fabricated as a production integration. Real configuration requires verified domains and restaurant IDs.

Android branding is selected at build time from `configs/restaurants/<slug>.json` plus an environment. The configuration supplies public brand metadata, the restaurant ID, and distinct application IDs for Operations and Customer. It must be validated before build/export. Signing keys, Supabase service-role keys, database credentials, and server-side Firebase credentials stay outside the repository and outside client bundles. Every API request uses the configured restaurant scope, and the backend still enforces it.

## Legacy URL and backend configuration constraint

M1 must preserve the distributed Common QR, Table QR, owner workspace, `/auth/callback`, and `/auth/accept-invite` URL shapes recorded in the [M0 audit](frontend-reset-audit.md). QR tokens remain in URL fragments and must be removed from browser history after client-side capture. No M1 change rotates existing tokens.

The backend currently has **one** `APP_PUBLIC_WEB_BASE_URL` for both generated Common QR links and owner links. It is not a per-restaurant domain registry. Do not assume it has already been changed or that it can generate separate branded domains without future backend work. Keep the existing production origin working as a compatibility origin while per-restaurant websites are introduced. The guest app or a dedicated compatibility entry at that origin must handle the old `/` and `/workspace` paths, including the owner handoff. Any future browser redirect to a tenant domain must use a trusted host mapping and preserve the fragment until the destination reads it. `SUPABASE_INVITE_REDIRECT_URL`, Supabase Auth allowlists, and `APP_CORS_ALLOWED_ORIGINS` also require environment-specific coordination; see the [production URL migration plan](production-url-migration.md).

## M1 scope and release boundary

M1 delivers workspaces, starter apps, validated tenant/brand configuration boundaries, shared packages, consistent TypeScript/lint/test tooling, and CI. It does not claim completed guest checkout, platform administration, native operations, customer delivery, invitation acceptance, or signed Android APK release. No placeholder is deployable as a replacement for an existing production flow. Keep the current production URLs and backend settings until the migration acceptance gates pass.

Phone/SMS account linking, UUID-safe provisioning, and assigned-only delivery authorization remain separate backend policy work. They cannot be inferred from a frontend role switch or implemented by changing UI checks. Platform Admin remains web-only; public QR guests remain web-first without account/app requirements.

## Consequences

The platform gains isolated product surfaces and restaurant-specific branding at the cost of more domain, Android application ID, signing, store-listing, and release management. One shared codebase per product limits duplicate implementation while allowing each restaurant a separate guest site and two separate Android apps. The single backend-generated web-origin setting is a deliberate compatibility constraint until a later backend contract change is designed and tested.
