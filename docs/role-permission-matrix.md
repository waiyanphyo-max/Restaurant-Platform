# Role and permission matrix

**Scope:** current source grants and target delivery policy for web/mobile.
**Reviewed:** 2026-10-28

Spring Boot derives identity from the validated Supabase JWT UUID subject, loads restaurant membership, and checks permissions. Client role state can guide navigation but cannot grant access. CUSTOMER is not a RestaurantRole; Platform Admin is separate from restaurant membership.

## Current restaurant permission grants

Legend: ✓ granted by the current RestaurantRole enum; — not granted.

| Permission | OWNER | MANAGER | STAFF | DELIVERY_DRIVER |
|---|:---:|:---:|:---:|:---:|
| RESTAURANT_READ | ✓ | ✓ | ✓ | ✓ |
| SETTINGS_MANAGE | ✓ | ✓ | — | — |
| MEMBERS_MANAGE | ✓ | — | — | — |
| MENU_READ | ✓ | ✓ | ✓ | — |
| MENU_MANAGE | ✓ | ✓ | — | — |
| ORDER_READ | ✓ | ✓ | ✓ | — |
| ORDER_CREATE | ✓ | ✓ | ✓ | — |
| ORDER_STATUS_UPDATE | ✓ | ✓ | ✓ | — |
| ORDER_CANCEL | ✓ | ✓ | — | — |
| QUEUE_MANAGE | ✓ | ✓ | ✓ | — |
| DELIVERY_READ | ✓ | ✓ | ✓ | ✓ |
| DELIVERY_ASSIGN | ✓ | ✓ | — | — |
| DELIVERY_STATUS_UPDATE | ✓ | ✓ | ✓ | ✓ |
| PAYMENT_READ | ✓ | ✓ | ✓ | — |
| PAYMENT_COLLECT | ✓ | ✓ | ✓ | — |
| REPORT_READ | ✓ | ✓ | — | — |

OWNER currently receives every permission in the enum. MANAGER, STAFF and DELIVERY_DRIVER use explicit grants, so new permissions are not silently inherited.

## Non-membership identities

| Persona | Identity and authority |
|---|---|
| Platform Admin | Signed-in Supabase user; only UUIDs in server-side PLATFORM_ADMIN_USER_IDS may call /api/v1/platform/... . Restaurant membership and frontend metadata grant no platform access. |
| Signed-in CUSTOMER | Signed-in user; zero restaurant memberships is valid. Customer profile, addresses and orders are scoped to validated JWT sub. |
| Common QR guest | No account/session required; public menu, Common QR checkout and queue tracking use scoped QR/queue credentials. |
| Table QR guest | No account/session required; public menu and Table QR checkout validate table-scoped QR credential. |

Do not trust a client role, user UUID, restaurant UUID, email string or unverified phone as identity proof. profiles.id and memberships reference the Auth UUID.

## Delivery behavior: current versus target

| Capability | Current source behavior | Required target |
|---|---|---|
| Manual assignment | Owner/Manager with DELIVERY_ASSIGN may assign only to a same-restaurant member whose role is DELIVERY_DRIVER. | Owner/Manager may assign/reassign to any eligible active OWNER, MANAGER, STAFF or DELIVERY_DRIVER in that restaurant, including self. |
| Default driver | Default assignment/fallback selects a DELIVERY_DRIVER; otherwise task waits. | Keep dedicated-driver default unless separately decided; manual assignment is broader. |
| Restaurant list | DELIVERY_READ members can list restaurant deliveries; only DELIVERY_DRIVER role is filtered to own assignments. Staff may see the wider list. | Owner/Manager management list; Staff/Driver assigned-to-self list only. |
| Detail | Dedicated driver is assignment-checked; other same-restaurant DELIVERY_READ members may access tasks. | Staff/Driver detail requires assignment UUID equals JWT sub; Owner/Manager access remains permissioned. |
| Status | STAFF and DELIVERY_DRIVER have DELIVERY_STATUS_UPDATE; Staff is not consistently assignment-limited. Manager Order status may also mutate linked delivery state. | Staff/Driver transition assigned tasks only; close order-status bypasses. Owner/Manager self-delivery by assignment to self. |
| Assignee discovery | /members requires MEMBERS_MANAGE (currently Owner-only); no narrow Manager assignment-options API. | Add a small same-restaurant options API for Owner/Manager. Do not grant Manager member administration to populate a picker. |
| Active state | restaurant_members has no active/suspended flag; removal deletes membership. | Initially eligible means current non-removed membership plus enabled Auth account. Add explicit suspension state only if needed, in a new migration. |

Current routes: GET /api/v1/restaurants/{restaurantId}/deliveries, GET .../deliveries/mine, GET .../deliveries/{deliveryId}, PATCH .../deliveries/{deliveryId}/assign, PATCH .../deliveries/{deliveryId}/status, GET/PATCH .../delivery-settings/default-driver, and PATCH .../orders/{orderId}/status.

Delivery assignment is stored in driver_user_id referencing a profile UUID, without a database role constraint. A later migration may rename it to a role-neutral assignee or add audit/status data if warranted; this task makes no migration. Preserve history, actor UUID, tenant/order scope and COD invariants.

## Authentication and phone onboarding requirements

1. Support email/password and Supabase phone/SMS OTP.
2. Linking a phone starts from the signed-in Auth identity. Verify phone-change OTP, confirm Auth UUID unchanged, and persist verified phone only after confirmation.
3. Phone onboarding starts with a role-scoped pending invite created by authorized Platform Admin or restaurant owner. Claim requires verified Supabase phone on the JWT subject and trusted server-side Auth Admin verification.
4. Consume a single-use, expiring, hashed claim in the same transaction as membership creation. Rate-limit and audit. No membership before claim.
5. Never merge/reparent accounts based on unverified phone/email strings. Harden current email profile lookup to use trusted Auth UUID and verification.
6. If Supabase returns a different UUID or unexpected linked identity, fail closed and use explicit verified support handling. Test stale phone-change requests and actual provider behavior.

## Authorization test requirements before delivery rollout

- Owner/Manager assign to each role and self; reject cross-restaurant, removed or disabled members.
- Staff/Driver list, read and update only tasks assigned to their JWT subject.
- Staff cannot mutate unassigned tasks via delivery-status or order-status routes.
- Management and driver COD transitions preserve payment/order atomicity and history.
- Assignment options are restaurant-scoped and do not expose member administration.
- Customer profile/order ownership is self-scoped; non-admin users are denied platform endpoints.
- Common QR/Table QR remain anonymous without bearer auth.
