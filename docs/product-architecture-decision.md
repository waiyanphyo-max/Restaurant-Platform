# Product Architecture Decision

**Decision:** PAD-001 — Three product experiences on one platform
**Status:** Proposed next milestones
**Reviewed:** 2026-10-28

## Decision

Maintain three distinct experiences:

1. **Platform Admin website** for private platform operations. Spring authorization against the Supabase Auth UUID allowlist is authoritative.
2. **Public Common QR and Table QR guest-ordering website** with mobile-first, no-account flows. QR credentials and order data are validated by public backend routes.
3. **One multi-tenant Expo/React Native Android app** for Owner, Manager, Staff, Delivery Driver and signed-in Customer. Restaurant selection comes only from API memberships. Platform Admin remains web-only.

Keep the existing monorepo and Spring Boot + Supabase PostgreSQL/Auth + Next.js stack. Initially keep Admin, guest ordering and the responsive workspace in Next.js under separate routes/layouts. Do not create a separate mobile app or Play listing per restaurant. The Expo app does not exist yet; this is a target plan, not a statement of implemented features.

## Repository and branch audit

At review, checkout is codex/m2-platform-admin at 6550d4a; local main and origin/main point to the same commit. The tree already has uncommitted M2 dashboard/read-endpoint work and other untracked files. These are not in main and must be reviewed separately.

codex/admin-owner-dashboards diverged before M1 Supabase session integration. Its old Admin UI uses manual bearer-token entry and old auth behavior. Its responsive shell and provisioning-form presentation are reusable ideas; its auth/API changes and docs are stale. Do not merge that branch wholesale.

The committed architecture is Next.js App Router plus Spring Boot domain APIs, Supabase Auth and PostgreSQL migrations as schema source of truth. No Expo app, Android package or EAS configuration exists.

## Surface boundaries

### Platform Admin web

- Operator route: /admin. Require a Supabase session, then enforce PLATFORM_ADMIN_USER_IDS against validated JWT sub on every API request. A restaurant role or frontend metadata grants no platform access.
- POST /api/v1/platform/restaurants exists on main. GET /api/v1/platform/overview and GET /api/v1/platform/restaurants exist only in the uncommitted checkout.
- Keep Supabase Auth Admin provisioning server-side; never expose service-role credentials. Test every platform route with a non-admin denial case.

### Public guest website

Create guest-first Common and Table QR pages, proposed as /order/common and /order/table. Keep current QR URLs as compatibility aliases while reprinting/migrating links.

Current Common QR: /?view=customer-pickup&restaurantId=...#qrToken=... with menu, cart, checkout and queue status/notification polling. Current Table QR: /workspace?view=table-order&restaurantId=...#qrToken=... with menu/cart/checkout, embedded in the workspace shell. Both currently call public APIs without login. Table QR is not yet a standalone guest experience.

Use GET /api/v1/public/restaurants/{restaurantId}/menu and POST routes ending in /orders/common-qr or /orders/table-qr. The backend verifies QR/table scope, active menu, modifiers, stock and price. Keep checkout account-free. Handle empty menu/cart, invalid QR, changed stock/price, loading, retry/network failure and submitted state. Read existing QR secrets from the URL fragment, remove it from browser history promptly, and never log or analyze it. Queue polling uses X-Queue-Token header. A signed-in option must not block guest checkout.

### Expo Android app

One multi-tenant app serves multiple restaurants. After sign-in, load /api/v1/my/restaurants; show only returned memberships. A user with no memberships can still use permitted customer profile/address/order flows.

Use the official Supabase JS SDK supported by Expo and secure native session persistence such as Expo SecureStore, verified against the chosen Expo SDK. Let the SDK restore/refresh sessions; do not port the browser cookie adapter or hand-roll JWT parsing/refresh storage. Obtain current session token for protected Spring requests. Use Spring for domain data/writes. Do not call Supabase Data API for application writes or bundle database/service-role credentials. Guests keep ordering on web without an app.

## Authentication and identity

Support email/password and phone/SMS OTP. Current M1 web implements email/password, session restoration/refresh and email invitation acceptance; phone OTP/linking is not implemented.

- Validated Supabase Auth UUID sub is the identity key; profiles.id and memberships reference that UUID.
- Email/phone strings are contact attributes, not proof that two accounts belong to one person. Never merge/link using an unverified string.
- Phone linking begins inside the signed-in account. Verify Supabase phone-change OTP, then confirm the Auth UUID is unchanged and phone is confirmed before saving verified app state. Never reparent profiles or memberships.
- Phone onboarding is an explicit role-scoped, expiring, one-time pending invite created by an authorized Platform Admin or restaurant owner. No membership exists yet. After SMS OTP, API validates JWT sub and trusted Auth Admin data confirms that exact UUID has the verified E.164 phone. Then atomically consume invite and create membership for that UUID. Store claim secret hashed; rate-limit and audit.
- Unverified, expired, used, mismatched or unverifiable claims fail closed. Conflicts require explicit verified support handling.
- Current email provisioning looks up profiles by email text. Harden to use trusted Auth Admin UUID/verification; a matching email string alone must not attach memberships or ownership.

See Supabase [phone login](https://supabase.com/docs/guides/auth/phone-login), [Auth users](https://supabase.com/docs/guides/auth/users), and its [phone-change troubleshooting note](https://supabase.com/kb/troubleshooting/unexpected-behavior-with-authupdateuser-phone-phone-linked-to-incorrect-user-id). Test stale phone-change behavior with the chosen provider, serialize changes and verify the returned UUID. Stop rather than reconcile by string if identity differs.

## Delivery decision and current gap

Owner/Manager may assign/reassign to any eligible active member of the same restaurant (OWNER, MANAGER, STAFF, DELIVERY_DRIVER), including themselves. Staff and dedicated drivers can read/execute only tasks assigned to their validated JWT UUID. Staff does not change role to deliver. Keep automatic default-driver selection dedicated to DELIVERY_DRIVER unless separately decided. Add narrow assignment-options access for Owner/Manager; do not grant Manager member administration for a picker.

Current manual/default assignment requires DELIVERY_DRIVER. Delivery listing filters only dedicated drivers; Staff and other members with DELIVERY_READ can see wider lists. Staff has DELIVERY_STATUS_UPDATE, and current checks do not uniformly restrict Staff to assigned tasks. Review Manager Order status updates as a possible delivery-state bypass. restaurant_members has no active/suspended flag; initially define eligible as current membership plus enabled Auth account. Preserve COD, atomic payment/order status, delivery history and tenant checks.

## Test evidence, dependencies and order

Existing tests cover role grants, restaurant authorization, delivery services, QR idempotency and customer delivery. They do not establish any-member assignment, manager/owner self-delivery, assigned-only Staff enforcement across all status routes or HTTP/database cross-driver/customer isolation. The previous M2 checkout records frontend and Maven checks, but this documentation audit did not rerun them. No live Supabase SMS/email flow is certified.

Next: (1) review pending M2 Admin separately; (2) harden UUID-based provisioning and decide SMS provider/link/invite contracts; (3) implement/test delivery policy and decide if membership suspension requires a new timestamped migration; (4) make standalone guest QR pages while preserving URLs; (5) start Expo after API/auth/delivery policies are stable; (6) configure and test Supabase, provider, CORS, deep links, FCM and release in staging. This audit changes no code, migration or remote setting.

Consequences: guest checkout stays low-friction; one app serves restaurant teams and customers; backend remains the authorization boundary. SMS, delivery changes, standalone Table QR and mobile still require implementation. No SMS vendor, payment provider or branded-app model is selected.
