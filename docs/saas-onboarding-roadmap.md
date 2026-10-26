# SaaS Restaurant Onboarding Roadmap

Last reviewed: 2026-10-26

## Target customer journey

1. A trusted platform operator verifies a restaurant business and submits the owner's email plus restaurant profile.
2. The platform invites a new owner through Supabase Auth (or attaches an existing Auth account), creates the restaurant, creates default settings/Common QR credential, and grants exactly one initial OWNER membership.
3. The owner opens a restaurant-specific workspace link and signs in; the API, not the URL, grants access according to restaurant membership.
4. The owner invites MANAGER, STAFF, and DELIVERY_DRIVER accounts, assigns roles, manages menu/settings, and generates/prints table QR codes and the Common QR.
5. Customers open a public ordering flow to place Table QR/Common QR orders or use the restaurant storefront for delivery.
6. The customer mobile app is released through Google Play after the mobile product, signing, privacy policy, testing, and release setup are ready.

## Milestones

| Milestone | Scope | Status on 2026-10-26 | Acceptance criteria |
|---|---|---|---|
| M0 — Audit and architecture | Confirm current endpoints, roles, QR behavior, customer flows, and missing pieces | **Done** | This roadmap and API docs match the code currently on `main` |
| M1 — Platform operator provisions owner + restaurant | Allowlisted provisioning API; invite/reuse owner, create restaurant/settings/OWNER membership, return owner and Common QR links; platform-operator form and live smoke test | **API and operator UI implemented; live Supabase smoke test remains** | An approved operator uses the provisioning interface/API; Supabase invitation, owner membership, and returned links are verified end-to-end; non-admin is denied |
| M2 — Production authentication and invitation acceptance | Browser sign-in, sign-out, refresh/session restoration, Supabase invite callback, safe post-invite password setup, expired/invalid-link states | **Not done** | Owner can open invite mail and sign in without manually pasting a bearer token; refresh and sign-out work; protected pages/API remain enforced |
| M3 — Owner workspace and team management | Open a direct restaurant URL; use membership roles; invite existing/new staff; change roles/remove member; clear user-friendly onboarding states | **Partially done** | Workspace and role-aware APIs exist; after M2, invite/accept/first-login and all owner/admin operations pass end-to-end tests |
| M4 — Restaurant QR onboarding pack | Generate a Common QR, create tables and individual QR codes, print/download clearly labelled codes, provide a safe replacement/rotation workflow | **Partially done** | Individual QR APIs and web views exist; a verified printable/downloadable onboarding pack and token-rotation checklist are still required |
| M5 — Customer online ordering | Public menu, table ordering, Common QR queue flow, authenticated delivery storefront, address/checkout/order history | **Partially done** | Web/API flows exist, but real Supabase Auth integration, live end-to-end coverage, mobile usability and deployment origin need validation |
| M6 — Restaurant mobile apps and Google Play | Build a separate restaurant app with its own branding, deep links, push notifications, privacy disclosures, signing, internal testing and Play release | **Deferred; not started** | Each restaurant's installable app is tested and published; web responsiveness is not counted as an Android release |
| M7 — Production readiness | Production HTTPS origins, secret storage, database migration verification, tenant-isolation and authorization tests, backups/monitoring, privacy/terms, operational runbook | **Not done** | Staging and production smoke tests pass and rollback/security procedures are documented |

## Current implementation facts

- The API already supports creating a restaurant for the authenticated user, assigns that user OWNER, creates settings and returns the Common QR token once.
- Owner-only team APIs already list members, invite new emails for MANAGER/STAFF/DELIVERY_DRIVER, manage roles, and support explicit ownership transfer. Staff invites depend on server-only Supabase Auth Admin configuration.
- Table QR create/rotate APIs exist and return a token once. The customer web flow includes Common QR queue tracking, Table QR checkout and a delivery storefront (currently cash on delivery).
- `apps/web` is a responsive Next.js website, not a native Android app; there is no verified Google Play listing as part of this codebase.
- The new platform provisioning API is deliberately separate from restaurant roles. It is disabled by default until `PLATFORM_ADMIN_USER_IDS` contains trusted platform operator Supabase Auth UUIDs. Never expose `SUPABASE_SERVICE_ROLE_KEY` to web or mobile clients.
- The owner URL selects a restaurant; it is not a bearer credential. A valid Supabase Auth session is still required to perform private operations.
- Supabase Auth invitation and database writes cannot be one distributed atomic transaction. Provisioning should be monitored and retried safely; do not assume an invitation email means every database step has completed.
- Product direction: create a separate app for each restaurant. This is intentionally deferred; the current web workspace remains shared while the platform and owner dashboards are built. Revisit Android packaging, branding, signing, and release setup as a separate milestone.

## Next recommended milestone

Smoke-test M1 against the actual Supabase project. Then implement M2 with a proper authentication and invitation-acceptance experience; this is necessary before giving a non-technical restaurant owner a polished direct link. Do not publish a raw Common QR token or service-role credential in logs or analytics.
