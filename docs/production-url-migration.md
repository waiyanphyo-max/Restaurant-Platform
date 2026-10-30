# Production URL migration plan

**Status:** Design/runbook only. M1 does not change production DNS, backend configuration, Supabase Auth settings, deployed sites, QR credentials, or traffic.
**Prerequisite:** Read the [M0 reset audit](frontend-reset-audit.md), [API contract](api.md), and [frontend monorepo architecture](frontend-monorepo-architecture.md).

## Existing links and why they matter

| Distributed link | Existing purpose | Required compatibility |
| --- | --- | --- |
| `/?view=customer-pickup&restaurantId=<uuid>#qrToken=<token>` | Common QR guest menu/checkout | Keep a signed-out guest entry at the original origin; preserve the fragment until the browser captures it. |
| `/workspace?view=table-order&restaurantId=<uuid>#qrToken=<token>` | Table QR guest order | Keep a signed-out table entry at the original origin; do not require an app or account. |
| `/workspace?restaurantId=<uuid>` | Owner link returned by provisioning | Keep a safe owner handoff while Operations Android onboarding is built; the ID is not proof of membership. |
| `/auth/callback` | Supabase auth return | Keep exact allowlisted callback behavior until replacement is verified. |
| `/auth/accept-invite` | Supabase invitation landing | Keep exact allowlisted invite behavior until replacement is verified. |

Printed QR codes and sent invitations may outlive any deployment. The legacy origin must continue to serve these paths (or a tested compatibility bridge) until those links are intentionally retired. M1 starter routes and placeholder screens are **not** complete checkout or auth flows and must not receive production traffic.

## Backend and Supabase configuration inventory

Inspect the live environment before changing anything. Current source defaults are local-development values, not evidence of production settings.

| Setting | Current source default/behavior | Safe migration action |
| --- | --- | --- |
| `APP_PUBLIC_WEB_BASE_URL` | Defaults to `http://localhost:3000`. `PlatformRestaurantProvisioningService` uses this **single origin** for both owner `/workspace?restaurantId=...` and Common QR `/?view=customer-pickup...` links. | Keep the current production value until one compatibility origin serves both shapes. Later set it only to an HTTPS origin that has passed Common QR and owner-link tests. It cannot directly choose a different branded origin per restaurant without a separate backend contract change. |
| `SUPABASE_INVITE_REDIRECT_URL` | Defaults to `http://localhost:3000/auth/accept-invite`. The Auth Admin client passes it as `redirect_to`. | Keep the current production URL until real invite acceptance on the replacement origin passes end-to-end tests. Then set the exact new HTTPS URL and add it to Supabase Auth Redirect URLs before issuing new invitations. Previously sent links still require the legacy route. |
| Supabase Auth Site URL and Redirect URLs | Existing setup lists exact `/auth/callback` and `/auth/accept-invite` origins. Site URL is a fallback, not a tenant router. | Retain old exact entries. Add exact staging/production Admin callback and any implemented guest/native auth return URLs for the actual environments before testing. Avoid broad wildcard tenant-domain allowlists in production; use a controlled central auth return origin if many branded domains exist. Remove old entries only after all old links are expired/retired and rollback is no longer needed. |
| `APP_CORS_ALLOWED_ORIGINS` | Spring defaults include local `http://localhost:3000` and `http://localhost:8081`. Browser API calls use this allowlist. | Add each exact HTTPS Admin and Guest browser origin that will call Spring; retain the old origin during overlap. Validate preflight/credential behavior from actual deployed hosts. Do not use `*` to bypass tenant/domain review. Native apps do not use browser CORS. |

Also inventory API origin, Supabase project/environment, DNS/TLS, ingress Host forwarding, cookies, Content Security Policy, `Referrer-Policy`, and any QR rendering or invitation email templates. No secret value should enter this document or a client bundle.

## Compatibility routing design

1. Resolve each branded guest hostname through the verified restaurant registry (`configs/restaurants/<slug>.json`). Use an exact environment-specific host allowlist; unknown or mismatched hosts fail closed. The proxy/CDN must forward the canonical, verified host to Next.js and reject host-header spoofing; the app must not trust an arbitrary forwarded-host header.
2. Preserve the original production origin as a compatibility entry. The backend's single generated origin may remain there. It must understand legacy `/` and `/workspace` links for every existing restaurant ID and map only to a verified configured tenant.
3. If the compatibility entry sends a guest to a new branded domain, perform the handoff in browser code. An HTTP redirect cannot read the `#qrToken` fragment. Read the fragment in memory, validate the restaurant-to-domain mapping, create the intended URL on the trusted domain with the fragment, and remove the credential from the old visible history. Never put it into a query parameter, server log, analytics event, or open redirect.
4. Keep owner `/workspace` links functional while the Operations Android app has no full auth/onboarding handoff. A safe informational entry may guide the user to the correct app after verifying configuration; it must not imply membership or grant access.
5. Retain `/auth/callback` and `/auth/accept-invite` on the old origin for existing email links. Add replacement allowlist entries before switching the server-side redirect. Native deep links require their own exact scheme/domain and app-link tests.

A new Table QR can eventually be printed with the restaurant's branded domain, but printed legacy Table QR codes keep working. Do not rotate Common/Table QR credentials or invalidate queue tracking tokens merely because the frontend changes.

## Staged migration sequence

| Gate | Action | Evidence required before proceeding |
| --- | --- | --- |
| **0 — Inventory** | Record actual production URLs, printed Common/Table QR samples, owner links, Supabase Auth allowlists, backend env values, domains, and restaurant UUID/domain mappings. | Complete mapping owned by an operator; no secret/token value in reports. |
| **1 — Staging** | Configure one nonproduction restaurant/domain and separate staging API/Auth. Exercise new Admin/Guest starters and exact legacy aliases without production traffic. | Valid tenant host resolves; unknown/mismatched host fails; QR fragment is removed from history; no fake checkout is presented as real. |
| **2 — Feature readiness** | Implement and test real Common/Table checkout, queue tracking, owner handoff, callback/invite acceptance, and backend API integration. | Scanned/printed QR tests, signed-out checkout, idempotent retry, queue-token header, expired/rotated QR, wrong tenant, invitation and role-denial tests pass. |
| **3 — Configuration overlap** | Add new exact Supabase redirects and CORS origins while retaining old ones. Publish new domains with DNS/TLS, ingress host validation, and monitoring. | Auth return and browser preflight succeed from intended origins; old links still work. |
| **4 — Controlled cutover** | Switch one restaurant's guest domain/printed future QR issuance after monitoring. Change `APP_PUBLIC_WEB_BASE_URL` or `SUPABASE_INVITE_REDIRECT_URL` only after their single-origin routes are ready and rollback is rehearsed. | Real guest/auth/owner flows pass on old and new origins; no token leak; support/rollback owner available. |
| **5 — Long-term compatibility** | Keep old origin and aliases for distributed links. Plan deprecation only with a QR replacement campaign and evidence that old links are no longer needed. | Monitoring and support data justify any later retirement; no silent breakage. |

## Rollback

Retain the previous backend env values, Supabase allowlist entries, DNS/ingress configuration, and application release as a reversible deployment plan. If the new host or auth return fails, route traffic back to the working legacy origin and restore the previous server-side URL values. Do not rotate QR tokens as a rollback mechanism. Verify printed QR, owner links, and outstanding invitations again after rollback. Do not remove old allowlist/CORS entries during the reversible overlap window.

## M1 boundary

This runbook is planning material. M1 creates the architecture and starter routes; it does not authorize DNS, Supabase Dashboard, backend env, migration, deployment, or production traffic changes.
