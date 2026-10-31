# M2 API coverage and contract gaps

Audit date: 2026-10-30; M2 implementation review resumed 2026-10-31. This report compares the current Spring Boot controllers and Java DTOs with the typed frontend API boundary. [`docs/api.md`](api.md) remains the complete route reference. Source files under `app/api/**` and `supabase/**` are unchanged in M2. A typed client is a transport contract; only Spring Boot and Supabase Auth decide whether a request is authorized.

**M4 update (2026-10-31):** The route counts and gaps below are the historical M2 audit. M4 resolves the platform Owner identity gap, exposes secure provisioning in the typed client, and adds platform detail, active status and branding/configuration endpoints. Platform responses now withhold raw QR credentials. The additive configuration-table migration is supplied for review and has not been applied remotely. See [M4 acceptance and remaining gaps](m4-acceptance.md) for the current contracts, retry behavior and verification limits. Phone invitation/claim and automated domain/app deployment remain unavailable.

## Existing Spring route inventory

There are **85** `@GetMapping`/`@PostMapping`/`@PutMapping`/`@PatchMapping`/`@DeleteMapping` methods in the current controllers. The groups below account for all 85; a path with alternatives represents separate methods.

| Boundary | Implemented Spring routes | Count | Server rule |
| --- | --- | ---: | --- |
| Guest/public | Menu and product modifiers GET; Common/Table QR order POST; queue status and notifications GET; queue notification read PATCH | 7 | Exact method/path allowlist in `SecurityConfig`. QR order validates body `qrToken`; queue routes validate `X-Queue-Token`. No bearer required. |
| Platform Admin | `GET /api/v1/platform/overview`, `GET /api/v1/platform/restaurants`, `POST /api/v1/platform/restaurants` | 3 | Valid JWT UUID plus server `PLATFORM_ADMIN_USER_IDS` allowlist; restaurant role is irrelevant. |
| Restaurant setup/management | Personal membership list and restaurant create/profile (4); member management/invite (6); settings (3); logo (1); tables (4); management delivery zones (3); default driver (2); catalog (17); catalog images (2); daily report (1) | 43 | Exact restaurant membership permissions and additional owner/resource checks. `POST /api/v1/restaurants` bootstraps OWNER for any authenticated UUID. |
| Operations | Restaurant order list/detail/status (3); staff order create (1); payments (2); queue management (2); deliveries (5) | 13 | Membership, role permissions, restaurant-scoped records, transition rules; driver deliveries are assigned-only. |
| Authenticated personal | Notification inbox/read (2); device list/register/deactivate (3) | 5 | Valid JWT UUID; records scoped to that subject. |
| Customer | Profile (2); avatar (1); addresses (5); delivery zones/checkout (2); order history/detail/cancel/reorder (4) | 14 | Valid JWT UUID; ownership checks on addresses/orders, restaurant/zone checks on delivery checkout. No separate CUSTOMER restaurant role. |

The separate [role-permission matrix](role-permission-matrix.md) lists every current restaurant permission and special rule. No Spring `/api/v1/auth/**` route exists: email/password sessions and token refresh belong to Supabase Auth, not this API.

## Wire-shape checks for typed clients

| Contract | Java source and compatibility rule |
| --- | --- |
| Error response | `ApiErrorResponse` is `{timestamp,status,code,message,path,errors:[{field,message}]}`. The security filter emits 401 `UNAUTHORIZED` and 403 `FORBIDDEN`; services may emit more specific codes. UI should branch on status/code, never localized message text. |
| Pagination | Platform restaurant list, restaurant order list, delivery list/mine, and customer order list return Spring `Page<T>` objects, not bare arrays. `GET /api/v1/my/restaurants` and public queue notifications return arrays. |
| Money and time | Java `long` amounts serialize as integer numbers in minor units; `OffsetDateTime` serializes as an ISO offset date-time string. Avoid floating-point money calculations in clients. |
| Nullability | `CreateOrderResponse.queue` is absent as an active queue for delivery orders and can be `null`. Queue timestamp fields can be `null`. Manager order/customer order/delivery DTOs contain optional association/contact/timing fields; `CustomerOrderDetailDto.delivery` can be `null`. Java constructors normalize detail item/history/payment lists to empty arrays. |
| Customer address flag | `CustomerAddressResponse` declares `boolean isDefault`. A local Jackson 3.1.5 serialization probe of an equivalent record emitted `{"isDefault":true}`; the typed field is `isDefault`, while the request field is `makeDefault`. |
| Platform provisioning | `PlatformRestaurantProvisionRequest` nests `restaurant: CreateRestaurantRequest`; the response includes `ownerUserId`, invitation metadata, `RestaurantResponse`, `ownerWorkspaceUrl`, `commonQrUrl`, and a **raw one-time** `commonQrToken`. Never log, persist in analytics, or cache this response. |
| Public QR/queue | `CreateQrOrderRequest` has `qrToken` and `items`. The optional `Idempotency-Key` may be reused only for an identical checkout retry. Queue tracking requires `X-Queue-Token` in the header, not in a URL. Public methods must never attach a Supabase bearer. |

## M2 typed-client coverage

| Backend surface | M2 typed coverage | Remaining scope |
| --- | --- | --- |
| Public guest | Separate public factory: menu, product modifiers, Common/Table QR checkout, queue status, queue notifications/read (7 routes). | Full guest feature UI remains later work. No auth provider is accepted by this client. |
| Platform Admin | Authenticated factory: overview and paginated restaurant list (2 routes). | Provisioning is withheld until the existing-email identity issue below is resolved server-side. |
| Restaurant Member/Operations | Fixed-restaurant factory: configured membership, restaurant profile, order list/detail/status, staff order create, queue list/call, delivery list/mine/detail/assign/status (13 routes). | Settings, tables, catalog, media, member management, payments, reports, and self-onboarding remain later feature clients. Current Staff delivery policy still requires a backend decision. |
| Customer | Fixed-restaurant delivery zones/checkout plus own profile and address CRUD/default selection (9 routes). | Global order history/detail/reorder/cancel are withheld from the branded client until the restaurant-scope contract below is designed. Avatar upload remains later work. |
| Personal notification/device | No M2 callable client. | Notification DTOs lack restaurant context; a branded Operations/Customer app must not display an unfiltered cross-restaurant inbox. Native push registration needs a real provider token. |
| Spring Auth | No endpoint to call. | Use separate supported Supabase Auth adapters for web/native sessions. Phone/SMS remains gated. |

The M2 factories currently cover **31 of the 85 route methods**. This counts the configured-membership method once even though it reads the personal membership endpoint. Method inventory in `packages/api-client/src/clients.ts`:

| Factory | Callable methods |
| --- | --- |
| `createPublicRestaurantApiClient` | `getPublicMenu`, `getProductModifierGroups`, `createCommonQrOrder`, `createTableQrOrder`, `getQueueStatus`, `getQueueNotifications`, `markQueueNotificationRead` |
| `createPlatformAdminApiClient` | `getOverview`, `listRestaurants` |
| `createRestaurantMemberApiClient` | `getConfiguredMembership`, `getRestaurant`, `listOrders`, `getOrder`, `updateOrderStatus`, `createStaffOrder`, `listQueue`, `callQueueTicket`, `listDeliveries`, `listMyDeliveries`, `getDelivery`, `assignDriver`, `updateDeliveryStatus` |
| `createCustomerApiClient` | `getProfile`, `updateProfile`, `listAddresses`, `createAddress`, `updateAddress`, `setDefaultAddress`, `deleteAddress`, `getDeliveryZones`, `createDeliveryOrder` |

Typed DTOs are hand-maintained mirrors of the inspected Java records. M2 does not introduce OpenAPI generation or claim that a TypeScript assertion validates arbitrary JSON at runtime; future endpoint additions must include Java DTO review and contract tests.

## Missing or incompatible contracts requiring a later backend decision

1. **Verified identity for existing owner provisioning — incompatible now.** [`PlatformRestaurantProvisioningService`](../app/api/src/main/java/com/restaurant/platform/service/PlatformRestaurantProvisioningService.java) may select a profile with `findFirstByEmailIgnoreCase` and attach OWNER based on email text, including its retry fallback. This is not proof that the intended Auth UUID owns a verified email. The M2 callable Platform Admin client must omit `POST /api/v1/platform/restaurants`. Proposed backend revision: accept an explicit existing owner Auth UUID or a server-issued verified invitation reference; use trusted Supabase Auth Admin data to confirm that exact UUID and verified email; for a new invite, attach only the UUID returned by Auth Admin. Remove profile-by-email fallback as an authorization decision, add conflict/race tests, and only then expose provisioning in the client.
2. **Phone/SMS OTP and verified phone linking — missing.** No Spring phone invitation, phone claim, verified phone status, or SMS-provider health contract exists. `PUT /api/v1/customer/profile` accepts plain phone text and must not be treated as identity verification. Proposed server contract: an authorized Owner can create a short-lived, one-time pending phone invitation for a restaurant/role without creating membership; after Supabase verifies the phone, an authenticated claim route verifies the current JWT UUID against trusted Auth Admin verified-phone state for that **same UUID**, atomically consumes the invitation, and adds membership. Store claim material hashed, rate-limit/audit attempts, and reject missing, expired, reused, mismatched, or unverified claims. A signed-in phone-change flow must verify the post-OTP Auth UUID equals the pre-change UUID. Do not merge by email/phone string or create a replacement account. Do not enable client OTP controls until a supported SMS provider and staging flow are configured and tested.
3. **Staff assigned-only delivery policy — incompatible with a strict assigned-work requirement.** `DeliveryService` filters assigned deliveries for `DELIVERY_DRIVER`, while Staff has restaurant-wide `DELIVERY_READ` and `DELIVERY_STATUS_UPDATE`; the restaurant order-status route may also affect delivery state without an assigned-Staff check. If Staff delivery must be assigned-only, define a server-side assignee model/contract (and migration if needed), enforce it across list/detail/status and order-status transitions, then add cross-user HTTP tests. Client filtering cannot enforce this rule.
4. **Per-restaurant backend-generated web links — incompatible with direct domain cutover.** `PlatformRestaurantProvisioningService` builds Common QR and owner links from one `APP_PUBLIC_WEB_BASE_URL`. Keep the old origin working as a compatibility bridge for distributed links. A future per-tenant URL contract or validated server domain registry requires a separate backend design and migration plan; M2 must not change production URL configuration.
5. **Restaurant-scoped customer history and inbox — missing for branded clients.** [`CustomerOrderHistoryController`](../app/api/src/main/java/com/restaurant/platform/controller/CustomerOrderHistoryController.java) exposes `GET /api/v1/customer/orders`, returning the authenticated customer's orders across restaurants. Order detail/cancel/reorder paths accept only `orderId`, and the personal notification DTO does not expose a restaurant ID for a reliable client context check. Proposed backend revision: add explicit `/api/v1/customer/restaurants/{restaurantId}/orders` list/detail/cancel/reorder contracts, preserving the existing global routes for compatibility; require both customer ownership and matching restaurant on every record and zone lookup. Add a restaurant-scoped notification endpoint or explicit validated restaurant association before exposing an inbox. Test same-customer cross-restaurant IDs and unrelated-customer IDs. M2 omits these global history/inbox calls from the branded clients; silently filtering after downloading all records does not provide the desired boundary.

These are proposed changes only. This milestone does not modify Spring behavior, database schema, Supabase policy, live credentials, or production routing.
