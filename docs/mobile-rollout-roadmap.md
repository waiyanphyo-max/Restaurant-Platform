# Mobile rollout roadmap

**Target:** two separate React Native Android application projects: Operations and Customer. Each produces a distinct restaurant-branded application for every onboarded restaurant.
**Reviewed:** 2026-10-30
**Status:** M1 foundation complete; no production mobile release is authorized.

Platform Admin is a global website. Signed-out Common QR and Table QR ordering remain guest websites and do not require either Android app or an account. This replaces the previous one-app/multi-restaurant rollout plan. See [PAD-001](product-architecture-decision.md) and the [M0 audit](frontend-reset-audit.md).

## Application and tenant boundaries

| Project | Users | Restaurant lock | Separate release identity |
| --- | --- | --- | --- |
| `apps/operations-mobile` | Owner, Manager, Staff, Driver | Build-time restaurant ID; authenticated membership and permissions come from Spring Boot | Operations application ID, signing lineage, Play listing, and version stream per restaurant |
| `apps/customer-mobile` | Signed-in home-delivery customer | Build-time restaurant ID; every storefront/order request remains scoped to it | Customer application ID, signing lineage, Play listing, and version stream per restaurant |

A customer with membership in another restaurant is still confined to the configured restaurant in that Customer build. An Operations user may have memberships elsewhere, but that build exposes only the configured restaurant after the backend confirms membership. Neither app offers a marketplace selector. The build-time lock constrains navigation and API targeting; Spring Boot remains the authoritative tenant and role boundary.

## M1 build-time configuration

`configs/restaurants/<slug>.json` is a validated public configuration record for an onboarded restaurant. A build selects exactly one slug and `MOBILE_ENV=development|staging|production`. A real record requires restaurant UUID, approved guest domain, display name/color, public HTTPS logo URL, separate local PNG icon assets, and distinct Operations/Customer Android application IDs. A missing/unknown slug, duplicate application ID, invalid restaurant UUID, or missing brand asset must fail before an Android build/export. The exact `starter-fixture` slug works only in development for starter JavaScript export; staging and production require real restaurant config. A branded release must use approved assets and must not ship generic starter artwork. The `.example.json` template is documentation only and must not produce a releasable build.

Keep staging and production separate in identifiers, API/Supabase project configuration, Android credentials, app links, push configuration, and signing/release tracks. Public Supabase URL/publishable key and an API origin can be injected into a client build; service-role keys, database credentials, Firebase server credentials, and signing keys cannot. The exact app configuration fields and validation command are documented in [frontend monorepo architecture](frontend-monorepo-architecture.md). A restaurant launch needs its own verified config and brand assets; M1 does not invent a real restaurant record.

The two projects can use the same validated configuration registry but must have separate native entry points, app names, icons/splash assets, application IDs, and release profiles. Build automation should make the selected restaurant and environment explicit in the artifact name and release metadata. Do not install a Customer build over its Operations counterpart or reuse one application's signing lineage for another without an explicit release plan.

## Security and API rules

- Use the official Supabase client supported by the selected React Native/Expo SDK and secure native session persistence. Restore/refresh through the SDK. Do not copy browser cookie adapters or hand-roll refresh-token storage.
- Obtain the current access token only for protected Spring API calls. Public guest QR calls remain on the web and unauthenticated. Do not call the Supabase Data API for application writes.
- Spring validates JWT signature, issuer, audience, expiry, and UUID subject. It resolves membership, platform allowlists, permissions, and customer ownership. UI role labels are presentation only.
- Keep the restaurant ID from the build config fixed. Reject or hide data for a different restaurant, and test that the backend denies cross-tenant requests. Customer checkout uses backend prices, stock, delivery zones, and order status.
- Register push tokens through authenticated device APIs when push is implemented. Firebase server credentials stay server-side. Native deep links and auth callbacks need exact environment/app allowlists before rollout.
- Do not put raw QR tokens or queue tracking tokens in app logs, analytics, or untrusted links. Guest QR compatibility remains on web.

## Milestones and acceptance

| Milestone | Work | Exit gate |
| --- | --- | --- |
| **M1 — Foundation** | Separate Operations and Customer workspaces, TypeScript/lint/test, validated build-time restaurant configuration, public design tokens and API contract boundary. | Both starter projects typecheck/lint/test; Android bundle/export or local starter build runs where toolchain permits; invalid/missing tenant selection fails closed; no client secret or fake production tenant. |
| **M2 — Native auth and identity** | Supabase session persistence, sign-in/recovery, safe deep-link callbacks, restaurant-locked API adapter. Resolve verified same-UUID phone linking and invitation policy before enabling SMS flows. | Restored session and sign-out work; wrong restaurant/membership denied; verified UUID remains stable; expired/mismatched links fail closed. |
| **M3 — Operations shell** | Owner, Manager, Staff, and Driver navigation against real memberships and permissions; orders, queue, catalogue, settings, reports, and delivery flows in measured slices. | Every role has explicit allowed/denied backend tests and app acceptance cases. Assigned-only delivery policy is enforced by backend before claiming completion. |
| **M4 — Customer delivery** | Account-based profile, address, restaurant-locked menu/cart, zone, checkout, order history/reorder/cancel, and notifications. | No cross-restaurant switch or cross-customer read; backend prices and order transitions remain authoritative; guest QR still works independently. |
| **M5 — Tenant release pipeline** | Per-restaurant brand assets, domains/app links, Android IDs, signing, Play listings, privacy/support data, staging and internal testing. | Each app can install/upgrade independently for a pilot restaurant; signing and credentials remain outside Git; rollback and support owner are recorded. |
| **M6 — Production rollout** | Gate each restaurant's Operations and Customer releases separately; monitor auth, API, crashes, delivery, and support. | Signed builds and store listings pass policy and device matrix; existing guests and production URLs continue working throughout cutover. |

## Dependencies and unresolved work

- Real restaurant UUIDs, approved names/domains, logos/icons, brand colors, legal/privacy/support information, and release owners for each restaurant.
- Android signing material, Play Console access, app links, deep-link domains, internal testing tracks, and environment-specific push registration.
- Supabase project URL/publishable key per environment and exact native redirect allowlists. The existing server-side invite redirect and web URL configuration are **not** assumed to be updated.
- Verified phone/SMS provider and same-UUID account linking/invitation contract. Email/phone text alone is not identity proof.
- Backend delivery eligibility and assigned-only Staff/Driver enforcement before shipping delivery tasks. Do not rely on mobile role hiding.
- Online payment/refund provider lifecycle remains unimplemented; do not present payment claims before provider/webhook/refund work.
- Actual Android SDK/build service availability for signed APK/AAB verification. A JavaScript bundle/export alone is not a signed Android release.

## Immediate next steps after M1

1. Onboard one nonproduction restaurant configuration and verify both mobile project selections fail on wrong or missing tenant IDs.
2. Implement native auth/session adapters and test protected Spring requests against staging.
3. Resolve identity and delivery authorization gaps with backend tests before exposing those features.
4. Produce independent staging Android builds for Operations and Customer, then run tenant, role, install/upgrade, deep-link, and device tests.
5. Keep existing production web URLs and guest checkout live until the [URL migration plan](production-url-migration.md) passes its cutover gates.
