# Backend authorization matrix

This matrix describes the Spring Boot rules reviewed through M10 on 2026-11-04. The Android app uses a single embedded restaurant ID and verifies its membership before displaying protected screens. Spring independently checks the requested restaurant and resource on each call. See [`RestaurantRole`](../app/api/src/main/java/com/restaurant/platform/security/RestaurantRole.java), [`RestaurantPermission`](../app/api/src/main/java/com/restaurant/platform/security/RestaurantPermission.java), [`RestaurantAuthorization`](../app/api/src/main/java/com/restaurant/platform/security/RestaurantAuthorization.java), [`PlatformAdminAuthorization`](../app/api/src/main/java/com/restaurant/platform/security/PlatformAdminAuthorization.java), and [`SecurityConfig`](../app/api/src/main/java/com/restaurant/platform/config/SecurityConfig.java).

Spring validates a Supabase JWT signature, issuer, audience, expiry, and UUID subject. Restaurant permissions are looked up from the membership table for the **requested restaurant ID**; JWT role text, a branded hostname, and a client-selected restaurant ID confer no permission. A missing/invalid bearer token normally yields 401; a valid user without the required membership/permission normally yields 403. Resource-specific denials can return 404 to avoid revealing another tenant's record.

## Restaurant membership grants

`✓` means the enum grants the permission for that role. The service may enforce additional record ownership, state, or role checks. Each role has an explicit list of grants in Java. Adding a permission to the enum requires a separate role grant.

| Permission | Owner | Manager | Staff | Driver | Typical backend use |
| --- | :---: | :---: | :---: | :---: | --- |
| `RESTAURANT_READ` | ✓ | ✓ | ✓ | ✓ | Restaurant profile read |
| `SETTINGS_MANAGE` | ✓ | ✓ | — | — | Profile/settings, tables, zones, default driver |
| `MEMBERS_MANAGE` | ✓ | — | — | — | Member list/invite/add/change/remove, ownership transfer |
| `MENU_READ` | ✓ | ✓ | ✓ | — | Private catalog reads |
| `MENU_MANAGE` | ✓ | ✓ | — | — | Catalog writes and image uploads |
| `ORDER_READ` | ✓ | ✓ | ✓ | — | Restaurant order list/detail |
| `ORDER_CREATE` | ✓ | ✓ | ✓ | — | Staff-entered orders and their active table and order-type options |
| `ORDER_STATUS_UPDATE` | ✓ | ✓ | ✓ | — | Order status transitions |
| `ORDER_CANCEL` | ✓ | ✓ | — | — | Cancel through restaurant status route |
| `QUEUE_MANAGE` | ✓ | ✓ | ✓ | — | Queue list/call and queue-changing order transitions |
| `DELIVERY_READ` | ✓ | ✓ | ✓ | ✓ | Restaurant delivery list/detail for Owner and Manager, own assignments for Staff and Driver |
| `DELIVERY_ASSIGN` | ✓ | ✓ | — | — | Eligible assignee lookup, assign, reassign and cancel delivery |
| `DELIVERY_STATUS_UPDATE` | ✓ | ✓ | ✓ | ✓ | Delivery state transitions and some order transitions |
| `PAYMENT_READ` | ✓ | ✓ | ✓ | — | Restaurant order payment list |
| `PAYMENT_COLLECT` | ✓ | ✓ | ✓ | — | Collect cash-at-counter payment |
| `REPORT_READ` | ✓ | ✓ | — | — | Daily operations report |
| `FINANCE_READ` | ✓ | ✓ | — | — | Accounting ledger, shopping/purchases, expenses, cashbook, suppliers, reports, audit, receipts and CSV |
| `FINANCE_MANAGE` | ✓ | ✓ | — | — | Accounting postings, financial payments, refunds, reversals and closing |

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
- Order status writes require `ORDER_STATUS_UPDATE`. Cancellation also requires `ORDER_CANCEL`, delivery transitions require `DELIVERY_STATUS_UPDATE`, and queue-changing transitions require `QUEUE_MANAGE`.
- `GET /api/v1/restaurants/{restaurantId}/settings` requires `SETTINGS_MANAGE`, so Staff and Driver cannot read this management response. Public menu/branding must come from public endpoints and approved tenant config instead.
- `GET /api/v1/restaurants/{restaurantId}/orders/staff/options` uses `ORDER_CREATE` and returns allowed order types and active table IDs and labels. Table management and QR credentials require `SETTINGS_MANAGE`.
- Restaurant-scoped notification reads and read acknowledgements require `RESTAURANT_READ`, the JWT subject as the addressee, and an order or queue ticket in the same restaurant.

See [API coverage and gaps](api-coverage-gap-report.md) for exact implemented route groups and missing phone/identity contracts.

## Delivery scope

| Capability | Backend rule |
| --- | --- |
| Manual assignment | Owner and Manager can assign or reassign to any eligible current Owner, Manager, Staff or Driver in the restaurant, including themselves. The backend revalidates membership and account eligibility on assignment. |
| Default driver | Automatic selection and default-driver settings use eligible `DELIVERY_DRIVER` members. A task waits for assignment when no eligible Driver is available. |
| List, detail and status | Owner and Manager can access the restaurant-wide queue. Staff and Driver can access and update only deliveries assigned to their JWT subject. The order-status route enforces the same assignment check for Staff delivery transitions under lock. Staff can still prepare an unassigned delivery order using its operational fields and item snapshots. |
| Assigned navigation detail | The location-bearing `/deliveries/mine/{deliveryId}` response requires the caller to be the current assignee in the requested restaurant for all four roles. Reassignment revokes the former assignee's access to this detail. Staff and Driver also lose assignment-scoped status writes. Owner and Manager retain their existing management access. |
| Assignment options | `GET /delivery-settings/assignment-options` requires `DELIVERY_ASSIGN` and returns the eligible users' IDs, roles, names and email labels. Member administration remains gated by `MEMBERS_MANAGE`. |
| Eligibility | A user must have a current membership in the target restaurant and a Supabase Auth account without a deletion timestamp or active ban. A restricted Spring database role needs schema `auth` usage and read access to the `id`, `deleted_at` and `banned_until` columns of `auth.users`. See the [Supabase Auth user model](https://github.com/supabase/auth/blob/master/internal/models/user.go). |

The existing `driver_user_id` field stores the assignee's profile UUID for every eligible role. Cash-on-delivery completion still requires explicit cash confirmation, and the delivery, order and payment updates share one transaction.

## Shared finance policy

Owner and Manager have the same reporting and posting permissions for a restaurant under the current configuration. `FINANCE_READ` covers the shared ledger, shopping and purchase history, supplier/payable reports, expenses, cashbook, private receipts and exports. `FINANCE_MANAGE` covers financial posting, audited corrections and closing, including closing reversal subject to the reconciliation rules. The configured role map has no separate Owner approval for these actions. Finalized history is append-only and corrections preserve the actor, reason and original record. Staff and Driver operational order or payment permissions do not confer accounting access. See [shared accounting rules](accounting.md) and [M9 verification](m9-acceptance.md).

## Phone onboarding and identity target

1. Email/password and phone/SMS OTP use Supabase Auth; SMS controls remain disabled until a supported provider is configured and verified.
2. Phone linking starts from the signed-in Auth UUID. Verify the phone-change OTP and confirm the Auth UUID is unchanged before treating the phone as verified.
3. Phone team onboarding requires a role-scoped pending invitation created by an authorized Platform Admin or restaurant Owner. Claim requires a validated JWT subject and trusted server-side Auth Admin confirmation that this same UUID owns the verified phone.
4. Consume a single-use, expiring, hashed claim in the same transaction as membership creation. Rate-limit and audit attempts. Create no membership before claim.
5. Never merge or reparent accounts based on unverified phone/email strings. Current email profile lookup in platform provisioning needs a verified Auth UUID contract.
6. If Supabase returns a different UUID or unexpected linked identity, fail closed and use explicit verified support handling. Test stale phone-change requests and actual provider behavior before rollout.

The [phone authentication design](phone-auth-design.md) records the closed provider gate and exact proposed invitation/claim routes before any backend implementation.
