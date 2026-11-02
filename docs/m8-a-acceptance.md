# M8-A acceptance — Restaurant Owner Operations

Date: 2026-11-02 (Asia/Bangkok). Application: `apps/operations-mobile`. Branch: `rebuild/m8-owner-accounting`.

Implemented M8-A only. M8-B financial backend and M8-C accounting UI remain deferred. No applied/new SQL migration, remote database operation, deployment, Git stage, commit, push or merge was performed. The two pre-existing untracked `.postman/` and `postman/` directories were left untouched.

## Delivered operations

| Area | Implemented behavior |
| --- | --- |
| Dashboard | Server restaurant identity/logo; authoritative pending/accepted/preparing/ready order counts using paginated totals; current-local-day active pickup tickets; latest deliveries; personal unread restaurant updates; quick navigation. Independent failures show unavailable rather than invented zero values. Authentication failures still revoke the session. Pull-to-refresh and explicit refresh. |
| Restaurant | Profile name/description/phone/address and supported structured location fields, validated coordinates; Owner-only logo picker/upload; currency/timezone and ordering/delivery preferences with confirmation. Public slug remains read-only. |
| Menu | Category create/edit/deactivate/reactivate; product create/edit/details/price/stock tracking/quantity/availability; variants and their prices/availability/images; modifier groups/rules/options/availability; attach/detach groups on products. Image selection and authenticated Spring multipart upload preserve existing image URLs on ordinary edits. Search covers the full catalog returned by the API; category/availability filters and 12-item local pages. Owner/Manager writes, Staff reads. |
| Tables/QR | Table list/search/create/update/deactivate/reactivate; create/rotate one-time table QR and Common QR rotation; responsive QR display; native URL sharing and PNG export. Rotation warns that printed codes become invalid. Guest aliases and token fragments match the existing Guest website. Missing approved guest origin disables creation/rotation to prevent losing one-time credentials. |
| Team | Owner member search/details, email invitations for MANAGER/STAFF/DELIVERY_DRIVER, role changes, removal and explicitly confirmed ownership transfer. Owner rows protected. Ownership transfer revalidates current membership/navigation. Provider configuration/failure and already-registered-account errors have specific guidance. Acceptance/account activation status is explicitly unavailable. |
| Orders | Paginated list, server status filter, explicitly page-local order search/channel filter; details with table/queue/delivery identity, snapshot item/variant/modifier prices, notes, totals, timestamps and status history. Only supported status transitions are offered. Owner/Manager cancellation requires confirmation; historical records are retained. Delivery pickup/completion uses the delivery workflow for cash safety. |
| Queue | Current restaurant-local queue day; ACTIVE means WAITING/READY/CALLED; individual terminal/active status filters; ready-ticket call with confirmation. Ready/completed transitions stay tied to authorized order transitions. |
| Delivery | Owner/Manager restaurant queue, Staff/Driver assigned-to-self list, status filter, pagination/details, eligible DRIVER-role assignment/reassignment, failure reason, pickup, explicit COD cash confirmation and delivery completion, and task cancellation confirmation. Owner/Manager zone create/edit/deactivate, paired city/township coverage, whole-amount fees/minimums and default-driver selection. |
| Payments | Authoritative per-order method/status/amount/paidAt for Owner/Manager. Pending counter cash can be explicitly confirmed collected; already-paid and cancelled-order actions suppressed. COD remains a separate explicit delivery confirmation. Existence/COMPLETED never implies paid. No derived cash balances, gateway, refund engine or profit. |
| Notifications | Current JWT user's existing notification records scoped to the embedded restaurant; unread/read/all filters, mark-read and permitted order/delivery navigation. No separate messaging provider. |
| Shared UX | Accessible fields, reusable cards/actions/toggles, responsive single-column forms, skeleton/loading, empty/denied/offline/error views, retries, pull-to-refresh and destructive confirmations. Synchronous mutation gate prevents duplicate taps before render. Writes are not automatically retried; ambiguous network outcomes tell users to refresh before retrying. Late mutation callbacks are discarded after workspace unmount/identity revocation. |

Existing daily operational Reports and Sales History remain available. They do not become accounting dashboards. Shared Owner/Manager components use the same guarded routes; Manager cannot open Team or upload logos. Shopping and Accounting remain hidden and denied on direct links.

## Spring endpoints used

Paths below are relative to `/api/v1/restaurants/{embeddedRestaurantId}` except membership discovery. Every call uses the current Supabase bearer token through the immutable-tenant shared client; there are no direct mobile PostgreSQL/Storage writes.

| Routes | Use |
| --- | --- |
| `GET /api/v1/my/restaurants` | Existing verified membership/build-tenant gate. |
| `GET /`, `PUT /profile`, `POST /logo` | Profile and authorized logo upload. |
| `GET/PUT /settings`, `POST /settings/common-qr-token/rotate` | Operational configuration and explicit Common QR replacement. |
| `GET/POST /categories`, `PUT /categories/{categoryId}` | Category management. |
| `GET/POST /products`, `PUT /products/{productId}` | Product/stock/availability management. |
| `GET/POST /products/{productId}/variants`, `PUT /products/{productId}/variants/{variantId}` | Variant management. |
| `POST /products/{productId}/image`, `POST /products/{productId}/variants/{variantId}/image` | Multipart PNG/JPEG/WebP uploads; existing 5 MB server checks remain. |
| `GET/POST /modifier-groups`, `PUT /modifier-groups/{groupId}` | Modifier rules. |
| `POST /modifier-groups/{groupId}/options`, `PUT /modifier-groups/{groupId}/options/{optionId}` | Modifier options. |
| `GET /products/{productId}/modifier-groups`, `PUT/DELETE /products/{productId}/modifier-groups/{groupId}` | Product links. |
| `GET/POST /tables`, `PUT /tables/{tableId}`, `POST /tables/{tableId}/qr-token/rotate` | Table/QR lifecycle. |
| `GET /members`, `POST /members/invitations`, `PUT/DELETE /members/{memberId}`, `POST /members/transfer-ownership` | Existing Owner-only membership/verified Auth invitation service. |
| `GET /orders`, `GET /orders/{orderId}`, `PATCH /orders/{orderId}/status` | Order list/detail/transitions. |
| `GET /queue-tickets`, `PATCH /queue-tickets/{ticketId}/call` | Current local queue and call. |
| `GET /deliveries`, `GET /deliveries/mine`, `PATCH /deliveries/{deliveryId}/assign`, `PATCH /deliveries/{deliveryId}/status` | Delivery queue/details from the existing task DTO, assignment and lifecycle. |
| `GET/POST /delivery-zones`, `PUT /delivery-zones/{zoneId}` | Coverage and fee configuration. |
| `GET/PATCH /delivery-settings/default-driver` | Existing default DRIVER configuration. |
| `GET /orders/{orderId}/payments`, `PATCH /orders/{orderId}/payments/{paymentId}/collect` | Existing payment records/idempotent counter collection. |
| `GET /reports/daily?date=YYYY-MM-DD` | Preserved daily operational report. |
| `GET /delivery-settings/assignment-options` | New narrowly authorized current DRIVER selection. |
| `GET /notifications`, `PATCH /notifications/{notificationId}/read` | New restaurant-scoped view/update of existing personal notifications. |

## Minimal backend and contract changes

1. Added `DeliveryAssignmentOptionsService` and `GET /delivery-settings/assignment-options`, requiring existing `DELIVERY_ASSIGN`. Returns only current same-restaurant DELIVERY_DRIVER user IDs/display names/emails. Manager gets a picker without member administration. Manual assignment/default driver validation remains unchanged.
2. Added `RestaurantNotificationController`/service and scoped repository queries. Require existing `RESTAURANT_READ`, derive recipient from JWT, and require linked order/queue to belong to the restaurant. If both links exist they must match the same scoped order. Mark-read returns 404 for other-user/tenant/unscoped records. Existing global personal inbox stays compatible.
3. Shared TypeScript DTOs/client methods now cover the existing operational writes and the two additions. Explicit native multipart bodies let Fetch generate the boundary without JSON-encoding URI-backed file parts. Tenant-bearing management responses, UUID paths and payment order IDs are checked. Uploads/invitations/status writes do not automatically retry.

No permission enum, role grant, existing financial service, database entity/schema or applied migration changed. API/security documentation was updated.

## Unsupported workflows and existing limitations

- There are no category/product/variant/modifier hard-delete APIs. Use existing deactivation/availability controls; historical order snapshots remain intact.
- Existing table/Common QR credentials cannot be fetched from management GETs. View/share/export is available when create/rotate returns a credential once. Re-viewing an old code requires a retained printed/exported copy; no recovery API or fabricated token was added.
- QR values clear on blur/background/unmount; delayed responses and exports are generation-checked. Intentional PNG export puts the QR in app-private cache for five minutes to allow Android receivers to copy it. Timer cleanup is best effort; process death can leave the file until stale-feature-file cleanup on the next Tables screen mount. Recipient copies are controlled by the selected recipient/app. No token is placed in logs, query strings or platform responses.
- Development QR creation needs `PUBLIC_GUEST_BASE_URL`; staging/production derive the first registered guest domain. No real production config or domain was fabricated. Guest app routing and native scanning still require deployment/device verification.
- Invitation APIs do not provide pending/accepted/disabled-account status or invitation history/revoke/resend. Existing-account onboarding needs an authorized verified-identity flow; editable profile email/phone is never used as proof of identity.
- Assignment remains limited to current DRIVER-role members. The broader all-role assignment target in older planning documents is not implemented. Current membership has no suspension flag or enabled-Auth-account capability for the picker; the existing backend assignment service remains the authority.
- Existing backend Staff delivery permissions are broader than the M7 assigned-only mobile surface. This milestone preserves the narrower UI, adds no role grants and does not claim to fix that pre-existing policy gap. Owner/Manager behavior follows current backend rules.
- Manager-order cancellation currently leaves stock/pending-payment reconciliation different from customer cancellation. M8-A exposes only allowed cancellation states and warns to review stock/payments; it does not silently change historical financial behavior or implement refunds. Delivery-task cancellation leaves the order/payment unchanged and is labelled accordingly.
- Server order search/channel/date filtering is unavailable; search/channel are visibly page-local. Catalog reads return the whole catalog. There is no claim of server catalog pagination or full-history search.
- Notifications are the signed-in user's related restaurant updates, not an all-member activity/audit feed. Records without a resolvable restaurant order/queue link are withheld. Push provider configuration remains separate.
- Existing monetary JSON uses Java long/number without universal scale metadata. Inputs require safe whole integers; unsafe display values remain unavailable. No dividing by 100, currency conversion, invented balances or accounting recognition was introduced.

## Verification executed

| Check | Actual result |
| --- | --- |
| Root `npm run typecheck` | Passed across shared packages and all workspaces. |
| Final Operations TypeScript | Passed after integrating native dependencies and QR cache helper. |
| Operations lint | Passed. |
| Operations tests | 3 Node build-config tests and 140 Vitest tests passed (15 files). |
| Full API-client suite | 53 passed. Existing loopback HTTP test needs approved unsandboxed networking; sandbox-only invocation failed with ApiNetworkError, and the approved full run passed. |
| API-client/shared-types lint/build/typecheck | Passed. |
| Focused Spring suites | Main run: 108 discovered, 102 executed passed, 0 failures/errors, 6 Docker-dependent PostgreSQL tests skipped. Additional queue/tracking/upload-validation run: 16 passed. Combined: 118 executed passed and 6 skipped. New scopes: 8 service/real-authorization tests and 5 MockMvc HTTP tests. Relevant existing role/JWT/tenant/catalog/table/team/order/queue/delivery/payment/settings/logo suites included. |
| PostgreSQL query/migration integration | New tenant/user/conflicting-link test added to existing Testcontainers suite, not executed because Docker Desktop Linux engine is unavailable. No live RLS/database claim. |
| Expo dependency check | Installed SDK offline compatibility check says dependencies up to date; offline check is not a remote package-health guarantee. |
| Expo native config introspection | Passed with development fixture; fixed operations Android ID, Router/SecureStore/build-properties/image-picker plugins. No camera/microphone permission requested by picker config. |
| Android JavaScript export | Metro/Hermes Android export passed with the development fixture and new native imports. This is **not** a signed APK/AAB build or device test. |
| ADB | Approved daemon start/device enumeration succeeded; no devices/emulators attached. No UI, picker, accessibility/font-scale, scanning, native-share recipient or actual secure-storage test was performed on a device. |
| Live Supabase/Spring/provider | Not run; no reviewed live restaurant/provider credentials/session supplied. No emails/invitations sent, real orders/payments changed, Storage objects uploaded or remote migrations applied. |
| Whitespace | `git diff --check` passed. |

Coverage includes role/deep-link policy, wrong/inactive/malformed restaurant membership, M7 expiry/logout/network/session races, menu validation and CRUD contracts, variants/modifier links, upload cancellation/size/type/picker/provider failures, table/QR URL security/cache cleanup, invitations and ownership boundaries, order/delivery transitions, assignment checks, counter/COD separation, duplicate taps, no retry of ambiguous writes, mutation unmount/expiry behavior and loading/denied/offline/empty rendered management states. Mocked native adapters and MockMvc JWT injection are not evidence of real Android rendering or live Supabase JWT signature validation.

Backend runs used installed JDK `C:\tools\jdk21` and Maven `C:\Users\DELL\Downloads\apache-maven-3.9.11-bin\apache-maven-3.9.11\bin\mvn.cmd`, offline mode and approved process access for Mockito instrumentation. The main `-Dtest` selector included OwnerOperationsScopeTest, OwnerOperationsHttpIntegrationTest, PostgresMigrationSchemaTest, NotificationServiceTest, DeliveryServiceTest, RestaurantRoleTest, RestaurantAuthorizationTest, SecurityConfigHttpIntegrationTest, SecurityConfigJwtValidatorTest, ManagerOrderServiceTest, PaymentServiceTest, CatalogManagementServiceTest, CatalogImageServiceTest, DiningTableManagementServiceTest, RestaurantMemberServiceTest, RestaurantSettingsServiceTest, DeliveryZoneManagementServiceTest and RestaurantLogoServiceTest. CatalogImageServiceTest has no matching class and contributes no tests. The second run selected QueueManagementServiceTest, QueueTrackingServiceTest and ImageUploadValidatorTest. Both invoked `--offline --batch-mode --no-transfer-progress -f app/api/pom.xml ... test` and ended BUILD SUCCESS.

## M8-B/M8-C prerequisites

See [accounting-readiness.md](accounting-readiness.md) and the existing [accounting API gap report](accounting-api-gap-report.md). M8-B needs authoritative sale/collection/refund events, immutable money/timezone policy snapshots, collector/audit identity, durable idempotency and narrowly permissioned shopping/purchase/expense/supplier/cashbook contracts. M8-C then activates shared Owner/Manager accounting views, complete-range reports/exports and reconciliation/correction flows. All advanced journal/COA/trial-balance/balance-sheet/bank-reconciliation/tax/valuation work stays optional and deferred.

## Git working-tree status

Initial status: branch `rebuild/m8-owner-accounting`, only `?? .postman/` and `?? postman/`. Final `git status --short` output is recorded below after all deliverables were created. Nothing is staged.

```text
 M app/api/src/main/java/com/restaurant/platform/controller/DeliverySettingsController.java
 M app/api/src/main/java/com/restaurant/platform/repository/AppNotificationRepository.java
 M app/api/src/test/java/com/restaurant/platform/integration/PostgresMigrationSchemaTest.java
 M apps/operations-mobile/.env.example
 M apps/operations-mobile/README.md
 M apps/operations-mobile/app.config.js
 M apps/operations-mobile/app/(workspace)/[screen].tsx
 M apps/operations-mobile/package.json
 M apps/operations-mobile/src/components/ui.tsx
 M apps/operations-mobile/src/config/embedded.test.ts
 M apps/operations-mobile/src/config/embedded.ts
 M apps/operations-mobile/src/features/operations/DashboardScreen.tsx
 M apps/operations-mobile/src/features/operations/DeliveriesScreen.tsx
 D apps/operations-mobile/src/features/operations/ManagementScreens.tsx
 M apps/operations-mobile/src/features/operations/OrderDetailScreen.tsx
 M apps/operations-mobile/src/features/operations/OrdersScreen.tsx
 M apps/operations-mobile/src/navigation/policy.test.ts
 M apps/operations-mobile/src/navigation/policy.ts
 M apps/operations-mobile/tests/app-config.test.cjs
 M docs/api.md
 M docs/role-permission-matrix.md
 M package-lock.json
 M packages/api-client/src/clients.ts
 M packages/api-client/src/transport.ts
 M packages/shared-types/src/member-api.ts
?? .postman/
?? app/api/src/main/java/com/restaurant/platform/controller/RestaurantNotificationController.java
?? app/api/src/main/java/com/restaurant/platform/dto/delivery/DeliveryAssignmentOption.java
?? app/api/src/main/java/com/restaurant/platform/service/DeliveryAssignmentOptionsService.java
?? app/api/src/main/java/com/restaurant/platform/service/RestaurantNotificationService.java
?? app/api/src/test/java/com/restaurant/platform/config/OwnerOperationsHttpIntegrationTest.java
?? app/api/src/test/java/com/restaurant/platform/service/OwnerOperationsScopeTest.java
?? apps/operations-mobile/src/components/forms.tsx
?? apps/operations-mobile/src/components/imageUpload.test.ts
?? apps/operations-mobile/src/components/imageUpload.ts
?? apps/operations-mobile/src/features/management/
?? apps/operations-mobile/src/features/menu/
?? apps/operations-mobile/src/features/operations/NotificationsScreen.tsx
?? apps/operations-mobile/src/features/operations/QueueScreen.tsx
?? apps/operations-mobile/src/features/operations/workflows.test.ts
?? apps/operations-mobile/src/features/operations/workflows.ts
?? apps/operations-mobile/src/hooks/mutation.test.ts
?? apps/operations-mobile/src/hooks/mutation.ts
?? apps/operations-mobile/src/hooks/useApiMutation.test.ts
?? apps/operations-mobile/src/hooks/useApiMutation.ts
?? docs/accounting-readiness.md
?? docs/m8-a-acceptance.md
?? packages/api-client/src/owner-operations.test.ts
?? postman/
```
