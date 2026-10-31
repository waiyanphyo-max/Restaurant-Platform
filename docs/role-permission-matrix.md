# Backend authorization matrix (M2)

This is a map of the **current Spring Boot enforcement**, not a grant implemented by a client. Source: [`RestaurantRole`](../app/api/src/main/java/com/restaurant/platform/security/RestaurantRole.java), [`RestaurantPermission`](../app/api/src/main/java/com/restaurant/platform/security/RestaurantPermission.java), [`RestaurantAuthorization`](../app/api/src/main/java/com/restaurant/platform/security/RestaurantAuthorization.java), [`PlatformAdminAuthorization`](../app/api/src/main/java/com/restaurant/platform/security/PlatformAdminAuthorization.java), and [`SecurityConfig`](../app/api/src/main/java/com/restaurant/platform/config/SecurityConfig.java). Source audit date: 2026-10-30; M2 implementation review: 2026-10-31.

Spring validates a Supabase JWT signature, issuer, audience, expiry, and UUID subject. Restaurant permissions are looked up from the membership table for the **requested restaurant ID**; JWT role text, a branded hostname, and a client-selected restaurant ID confer no permission. A missing/invalid bearer token normally yields 401; a valid user without the required membership/permission normally yields 403. Resource-specific denials can return 404 to avoid revealing another tenant's record.

## Restaurant membership grants

`✓` means the enum grants the permission for that role. The service may enforce additional record ownership, state, or role checks. `OWNER` currently receives all enum permissions; `MANAGER` grants are listed explicitly in Java, so a new enum permission is **not** automatically granted to managers.

| Permission | Owner | Manager | Staff | Driver | Typical backend use |
| --- | :---: | :---: | :---: | :---: | --- |
| `RESTAURANT_READ` | ✓ | ✓ | ✓ | ✓ | Restaurant profile read |
| `SETTINGS_MANAGE` | ✓ | ✓ | — | — | Profile/settings, tables, zones, default driver |
| `MEMBERS_MANAGE` | ✓ | — | — | — | Member list/invite/add/change/remove, ownership transfer |
| `MENU_READ` | ✓ | ✓ | ✓ | — | Private catalog reads |
| `MENU_MANAGE` | ✓ | ✓ | — | — | Catalog writes and image uploads |
| `ORDER_READ` | ✓ | ✓ | ✓ | — | Restaurant order list/detail |
| `ORDER_CREATE` | ✓ | ✓ | ✓ | — | Staff-entered orders |
| `ORDER_STATUS_UPDATE` | ✓ | ✓ | ✓ | — | Order status transitions |
| `ORDER_CANCEL` | ✓ | ✓ | — | — | Cancel through restaurant status route |
| `QUEUE_MANAGE` | ✓ | ✓ | ✓ | — | Queue list/call and queue-changing order transitions |
| `DELIVERY_READ` | ✓ | ✓ | ✓ | ✓ | Delivery list/detail; driver gets assigned-only scope |
| `DELIVERY_ASSIGN` | ✓ | ✓ | — | — | Assign/reassign driver; cancel delivery |
| `DELIVERY_STATUS_UPDATE` | ✓ | ✓ | ✓ | ✓ | Delivery state transitions and some order transitions |
| `PAYMENT_READ` | ✓ | ✓ | ✓ | — | Restaurant order payment list |
| `PAYMENT_COLLECT` | ✓ | ✓ | ✓ | — | Collect cash-at-counter payment |
| `REPORT_READ` | ✓ | ✓ | — | — | Daily operations report |

## Product boundaries outside the restaurant role enum

| Boundary | Current backend rule | Client consequence |
| --- | --- | --- |
| Platform Admin | `/api/v1/platform/**` controller methods require a validated JWT UUID in the server-only `PLATFORM_ADMIN_USER_IDS` allowlist. An empty allowlist returns 503. Restaurant roles do not grant platform access. | Admin UI may hide controls for usability, but must rely on 401/403/503 responses. Do not use a restaurant membership as a platform grant. |
| Restaurant Member | Paths under `/api/v1/restaurants/{restaurantId}/**` generally require the matching membership permission above; services additionally verify target resource scope and transition rules. | Operations app is build-locked to one restaurant. A role name from the client is only display state. |
| Customer | `/api/v1/customer/**` requires a JWT subject; profile, address, and order services use that UUID for ownership. There is no separate backend `CUSTOMER` restaurant role. | Customer app is build-locked to its restaurant for ordering, while the backend checks saved-address ownership, zone scope, and order ownership. Existing global customer history spans restaurants and is withheld from the branded M2 client pending an explicit restaurant-scope contract. |
| Guest | Only the method/path pairs explicitly listed in `SecurityConfig` are unauthenticated: public menu/modifiers, Common/Table QR order, and queue status/notifications. QR checkout validates `qrToken` in the body; queue tracking validates `X-Queue-Token`. | Public client must never attach a bearer token. No guest account or restaurant role is inferred from a QR URL. |
| Authenticated personal APIs | `/api/v1/my/restaurants`, `/api/v1/notifications`, and `/api/v1/devices` use the JWT subject and return only that user's records. | Do not substitute a user ID from the browser/mobile UI. Membership lookup returns only the configured restaurant to Operations UI. A user's personal notification inbox may span restaurants, so M2 does not expose it in a branded client. |

## Additional checks that a permission table alone misses

- `POST /api/v1/restaurants` allows any authenticated UUID to create a restaurant and become OWNER. This is separate from allowlisted Platform Admin provisioning at `POST /api/v1/platform/restaurants`.
- `POST /api/v1/restaurants/{restaurantId}/logo` requires the actual OWNER member role, even though both Owner and Manager have `SETTINGS_MANAGE`.
- Ownership transfer requires the current OWNER and an existing member as target. Adding/updating a member cannot assign `OWNER`; transfer uses its dedicated route.
- Driver list/detail/status is restricted to deliveries assigned to the authenticated driver and to the restaurant-scoped order. Other roles with `DELIVERY_READ` currently see the restaurant-wide queue. Assignment targets must currently have `DELIVERY_DRIVER` role.
- Order status writes require `ORDER_STATUS_UPDATE`; cancellation also requires `ORDER_CANCEL`, delivery transitions require `DELIVERY_STATUS_UPDATE`, and queue-changing transitions require `QUEUE_MANAGE`.
- A Staff member currently has restaurant-wide delivery read/status permission, and the order-status route does not uniformly enforce assigned-only Staff delivery work. This is a **backend policy gap** if the product requires Staff to deliver only assigned tasks. A frontend filter is insufficient; propose and test server-side assigned-user checks in `DeliveryService` and `ManagerOrderService` before exposing that workflow.
- `GET /api/v1/restaurants/{restaurantId}/settings` requires `SETTINGS_MANAGE`, so Staff and Driver cannot read this management response. Public menu/branding must come from public endpoints and approved tenant config instead.

See [API coverage and gaps](api-coverage-gap-report.md) for exact implemented route groups and missing phone/identity contracts.

## Delivery behavior: current source versus approved target

| Capability | Current source behavior | Required target |
| --- | --- | --- |
| Manual assignment | Owner/Manager with `DELIVERY_ASSIGN` may assign only a same-restaurant `DELIVERY_DRIVER`. | Owner/Manager may assign or reassign to any eligible active Owner, Manager, Staff, or Driver in that restaurant, including self. |
| Default driver | Automatic selection uses a dedicated `DELIVERY_DRIVER`; otherwise the task waits. | Keep dedicated-driver default unless separately decided; broaden only authorized manual assignment. |
| Restaurant list | `DELIVERY_READ` members list restaurant deliveries; only `DELIVERY_DRIVER` is filtered to own assignments. | Owner/Manager get the management list; Staff/Driver see assigned-to-self tasks only. |
| Detail and status | Driver detail/status checks assignment; other `DELIVERY_READ` members can access the task, and Staff can update an unassigned task. Order status may also mutate delivery state. | Staff/Driver detail and transitions require assignment to the JWT UUID; close the order-status bypass. Owner/Manager access remains permissioned. |
| Assignment options | `/members` requires `MEMBERS_MANAGE` (Owner only); no narrow Manager picker endpoint exists. | Add a same-restaurant assignment-options API for Owner/Manager without granting Manager member administration. |
| Active state | `restaurant_members` has no active/suspended flag; removal deletes membership. | Initially eligible means a current membership plus enabled Auth account. Add suspension state only if later needed, through a new migration. |

Assignment is stored in `driver_user_id` referencing a profile UUID, without a database role constraint. A later schema revision may rename it to a role-neutral assignee or add audit/status data if warranted. Preserve history, actor UUID, tenant/order scope, and cash-on-delivery invariants.

## Phone onboarding and identity target

1. Email/password and phone/SMS OTP use Supabase Auth; SMS controls remain disabled until a supported provider is configured and verified.
2. Phone linking starts from the signed-in Auth UUID. Verify the phone-change OTP and confirm the Auth UUID is unchanged before treating the phone as verified.
3. Phone team onboarding requires a role-scoped pending invitation created by an authorized Platform Admin or restaurant Owner. Claim requires a validated JWT subject and trusted server-side Auth Admin confirmation that this same UUID owns the verified phone.
4. Consume a single-use, expiring, hashed claim in the same transaction as membership creation. Rate-limit and audit attempts. Create no membership before claim.
5. Never merge or reparent accounts based on unverified phone/email strings. Current email profile lookup in platform provisioning needs a verified Auth UUID contract.
6. If Supabase returns a different UUID or unexpected linked identity, fail closed and use explicit verified support handling. Test stale phone-change requests and actual provider behavior before rollout.

The [phone authentication design](phone-auth-design.md) records the closed provider gate and exact proposed invitation/claim routes before any backend implementation.

## Authorization tests needed before delivery-policy rollout

- Owner/Manager assign to each eligible role and self; reject cross-restaurant, removed, or disabled members.
- Staff/Driver list, read, and update only tasks assigned to their JWT subject, including through order-status routes.
- Management and driver cash-on-delivery transitions preserve payment/order atomicity and history.
- Assignment options are restaurant-scoped and do not expose member administration.
- Customer profile/order ownership is self-scoped; non-admin users are denied platform endpoints.
- Common QR/Table QR remain anonymous without bearer auth.
