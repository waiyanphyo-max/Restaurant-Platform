# M6 — Guest QR ordering

`apps/guest-web` now supports restaurant-bound Table QR and Common QR ordering without a Supabase session. It retains the M5 reviewed hostname/restaurant registry, branding and public menu, and adds item configuration, a tenant-scoped cart, checkout, confirmation and Common QR pickup tracking. Spring remains authoritative for credentials, table assignment, stock, modifiers, prices and totals.

## Routes and compatibility

The existing printed URL formats remain entry routes on the configured matching restaurant host:

```text
/?view=customer-pickup&restaurantId=<restaurant-uuid>#qrToken=<credential>
/workspace?view=table-order&restaurantId=<restaurant-uuid>#qrToken=<credential>
```

Development equivalents are `/r/<slug>?view=customer-pickup&restaurantId=...#qrToken=...` and `/r/<slug>/workspace?view=table-order&restaurantId=...#qrToken=...`. The existing local routing restrictions still apply: explicit enablement, non-production runtime, loopback host and a reviewed restaurant config. Production does not enable tenant switching through `/r/<slug>`.

No redirect drops the credential before the browser captures it. Legacy `restaurantId` must match the resolved host/path tenant. Duplicate intent parameters, unknown tenants and mismatched IDs fail closed. The owner-style `/workspace?restaurantId=...` entry remains separate from guest checkout.

There is no shared-origin cross-domain migration bridge. A previously issued Restaurant B link on a hostname now assigned to Restaurant A remains denied. Keep the original shared-origin service or a separately tested compatibility bridge available for those issued links; this implementation changes no DNS, printed credential or production routing.

## Backend contracts and required release pairing

Menu, checkout, queue and notification reads use the existing Spring public contracts. Two additive backend changes close gaps needed by the tenant-bound guest flow:

| Contract | Behavior |
| --- | --- |
| `POST /api/v1/public/restaurants/{restaurantId}/qr-context` | New read-only preflight. Body `{ "kind": "COMMON_QR" or "TABLE_QR", "qrToken": "..." }`. Response `{ restaurantId, kind, tableId, tableNumber }`; Common QR has null table fields. Success is `no-store`. |
| Existing queue `/status`, `/notifications` and `/notifications/{notificationId}/read` endpoints | Continue to require `X-Queue-Token`. An optional `X-Restaurant-Id` additionally scopes the ticket before order/notification data is read. Legacy token-only clients remain compatible. The guest proxy always supplies the resolved restaurant UUID. |

The QR context endpoint and checkout share the same `OrderService` validation helper: active restaurant, order settings, QR ordering permission, Common QR takeaway permission, current Common QR token or active restaurant-bound table token. Preflight reserves neither stock nor prices. Checkout checks current validity again.

Release the updated backend and guest application together, with the backend additions available before guest traffic uses them. An old backend lacks QR preflight and ignores the new tenant-scoping header, so it does not meet this guest release's validation/isolation requirements. No new database migration is introduced by M6; the existing QR idempotency schema must already be available.

All guest checkouts send an `Idempotency-Key`. Configure Spring's existing `APP_IDEMPOTENCY_ENCRYPTION_KEY` with a valid Base64-encoded 32-byte key. Despite the backend's support for unkeyed legacy callers, this key is required for the guest flow. Preserve it across instances/restarts and for the response-retention window so an original Common QR response, including its queue tracking token, can be decrypted on replay. Missing configuration produces an ordering-unavailable response; the frontend never falls back to an unkeyed checkout.

## Browser, proxy and order state

`GuestSession` owns one private `GuestOrderController` per resolved tenant. App navigation keeps the credential/cart within that tenant; switching tenants creates a fresh session. Product detail controls support variants, distinct modifier selections and each selected option's quantity, item quantity and a kitchen note. Limits mirror Spring: up to 50 lines, item quantity 1–999, at most 20 modifier selections per line, modifier quantity 1–10, and notes up to 500 characters. Modifier-group min/max counts distinct options, not modifier units. Cart stock checks aggregate quantities of the same product across lines. These checks improve feedback; Spring revalidates the submitted selection.

Browser requests use the same-origin `POST /api/guest`, or the development `/r/<slug>/api/guest` equivalent. Supported actions are `validate`, `checkout`, `status`, `notifications` and `read`. The server resolves the restaurant through the existing trusted host/path resolver; browser restaurant IDs and spoofed tenant headers are not accepted as authority. It rejects query strings, unexpected request fields, oversized/malformed input, and mismatched cross-origin requests. Public upstream calls omit cookies and bearer tokens, disable redirects/referrers/caching, use bounded timeouts and validate response identities/shapes. Backend error bodies, credentials and arbitrary exception text are not returned to the UI.

Table QR submits to the existing `/orders/table-qr` endpoint. The backend assigns the table from the credential and creates a `DINE_IN` / `TABLE_QR` order; the browser cannot choose a table ID. Common QR submits to `/orders/common-qr` and creates a `TAKEAWAY` / `COMMON_QR` order. Confirmations display Spring's subtotal, discount, fees and total directly in whole currency units. Cart prices do not override checkout amounts.

Table QR's public checkout response supports its initial order status only. The confirmation displays that supported status, verified table number and guidance to ask staff for later updates. There is no invented public Table QR polling or status capability.

Common QR keeps the returned queue token privately and polls the existing status/notification contracts every five seconds while the page is visible. Returning to the page or regaining a network connection refreshes tracking; a manual refresh remains available. Failed tracking preserves the confirmed order and shows a recovery notice. Queue number/display code and order/queue status come from Spring. The displayed restaurant business date comes from the existing `ORD-YYYYMMDD-...` order number, avoiding a UTC/browser-timezone conversion of `createdAt` that could show the wrong queue day.

English/Burmese labels cover configuration, checkout, errors, statuses and pickup controls. Catalog names/descriptions remain the backend's supplied content. Restaurant branding continues to come from the reviewed tenant registry and validated public menu. No account or Supabase environment configuration is required for public guest ordering.

## Duplicate prevention and recovery

Before the first checkout, the controller creates one cryptographically random idempotency key and an immutable selection snapshot. While a request is pending, repeated clicks cannot start another submission. Timeout, connection loss, malformed successful responses and ambiguous backend conflicts lock cart editing and retain the original key/body. A retry submits exactly that attempt; it does not generate a new key. Successful replay restores the original order and Common QR queue token. A definitive rejection of a fresh attempt allows the guest to correct the cart; an already ambiguous attempt remains protected from accidental replacement.

Only a pending attempt's key, timestamp, kind, table context and cart/selection snapshot may be stored in per-tab `sessionStorage`, under a restaurant-specific key. No QR credential or queue token is stored there. This permits recovery after a reload only when the guest rescans the **same original QR credential**: the original QR is part of Spring's request fingerprint. Replaying the original attempt happens before fresh QR preflight, so a committed response can still be recovered after the restaurant rotates/revokes that original credential. Scanning a newly issued credential cannot substitute for the original fingerprint.

The frontend refuses pending-attempt replay after 23 hours, conservatively inside the backend's existing 24-hour idempotency retention. It keeps the cart locked and asks the guest to confirm with restaurant staff before placing another order. A changed device clock, disabled/cleared storage, tab closure or lost original QR can limit recovery; the UI does not promise durable cross-device guest order history. Ordinary unsubmitted carts and successful queue capabilities stay in memory. Keep the confirmed page open for tracking; reloading it clears the memory-only queue token.

QR credentials currently have no timestamp-based expiry in Spring. Rotation, revocation, table disablement, restaurant disablement or order-setting changes invalidate them. The UI handles those denials and asks for the current QR. Queue tokens also have no new expiry policy in this milestone. Existing token authorization and idempotent token replay behavior are preserved.

## Credential handling and sound

QR credentials enter through `#qrToken=...`, are captured into private memory and removed from visible history, including malformed/duplicate credential fragments. Ordinary section anchors remain usable. Tokens are never added to query strings, markup, client storage, analytics or application logs. Browser-to-proxy credentials travel in JSON bodies; queue tokens travel from the proxy to Spring in `X-Queue-Token`. Queue capabilities are removed from the public React state used to render the receipt.

Guest responses use private/no-store caching and `Referrer-Policy: no-referrer`. Credential-shaped query parameters are rejected with a generic response rather than echoed into rendering. Incoming URLs can reach infrastructure logs before application middleware runs: ingress/access logging must redact accidental credential query parameters, and request/response body/header capture must omit QR and queue credentials. Keep full-URL analytics and session replay disabled on guest QR routes. No analytics integration is added.

Pickup sound requires an explicit button gesture that enables/resumes Web Audio. The page plays an optional short sound for ready/called transitions, with visible status as the primary feedback and an unavailable message if audio cannot start. This is browser-page audio, not OS push notifications; closed/suspended/background pages may not play. No login, Firebase registration or notification permission prompt is required.

## Verification and remaining environment limits

Run frontend verification from the repository root:

```powershell
npm run build:packages
npm run typecheck -w @restaurant-platform/guest-web
npm run lint -w @restaurant-platform/guest-web
npm run test -w @restaurant-platform/guest-web
npm run build -w @restaurant-platform/guest-web
npm run test:production -w @restaurant-platform/guest-web
```

The production smoke command requires a fresh guest build and no other guest server using that build directory. It starts the actual built Next production application and two temporary restaurant registry fixtures, with a loopback HTTP server implementing the Spring menu, QR-context, checkout, queue and notification contracts. It exercises both restaurants' Common/Table QR flows, backend-fixture variant/modifier totals, correct table assignment, duplicate checkout/replay, lost checkout responses, invalid/cross-tenant tokens and products, stock/modifier rejections, queue tenant scope, status transitions and notification read behavior. It also retains the M5 route/branding/unknown-host/legacy-path checks and cleans up owned servers and synthetic configs/assets.

This is real HTTP against built Next and synthetic contract fixtures. It does **not** run a live Spring/PostgreSQL service or establish browser hydration, Android/device audio behavior, real tenant data, production DNS/TLS/ingress policy or a deployed shared-origin migration. Controller/state tests separately exercise item configuration, cart lifecycle, double-click protection, safe retry/reload recovery and token boundaries. Spring service/controller/security tests separately exercise its actual public authorization and order-validation code.

| Check | Recorded result |
| --- | --- |
| Guest typecheck and lint | Passed. |
| Guest tests | Passed: 206 tests across 19 files. |
| Frontend package build and guest production build | Passed, including the final checkout recovery fixes. Windows sandbox `EPERM` while generating `.next` required running the build with filesystem access. |
| Production HTTP smoke | Passed: 117 grouped checks, 4 successful orders across both QR modes and two restaurants, including 10 correctly denied streamed not-found responses. Sandbox loopback `EACCES` required running the owned test servers with network access. Temporary fixtures and servers were cleaned up. |
| Relevant Spring backend tests | 70 passed, zero failures/errors; 5 PostgreSQL/Testcontainers tests skipped because Docker is unavailable. |
| Browser/device acceptance | Browser bootstrap failed in this environment; no live browser, Android, staging or production acceptance is claimed. |

The backend checks ran from the repository root with Java 21.0.6 and Maven 3.9.9. These are the executed PowerShell commands:

```powershell
$env:JAVA_HOME='C:\Program Files\java\jdk-21'
& 'C:\Users\DELL\.m2\wrapper\dists\apache-maven-3.9.9-bin\4nf9hui3q3djbarqar9g711ggc\apache-maven-3.9.9\bin\mvn.cmd' --batch-mode --no-transfer-progress -o -f app/api/pom.xml '-DargLine=-javaagent:C:\Users\DELL\.m2\repository\net\bytebuddy\byte-buddy-agent\1.18.11\byte-buddy-agent-1.18.11.jar' '-Dtest=QrGuestCheckoutTest,QrOrderIdempotencyServiceTest,QueueTrackingServiceTest,NotificationServiceTest,PublicQrGuestHttpIntegrationTest,SecurityConfigHttpIntegrationTest' test
& 'C:\Users\DELL\.m2\wrapper\dists\apache-maven-3.9.9-bin\4nf9hui3q3djbarqar9g711ggc\apache-maven-3.9.9\bin\mvn.cmd' --batch-mode --no-transfer-progress -o -f app/api/pom.xml '-DargLine=-javaagent:C:\Users\DELL\.m2\repository\net\bytebuddy\byte-buddy-agent\1.18.11\byte-buddy-agent-1.18.11.jar' '-Dtest=PostgresMigrationSchemaTest,CustomerDeliveryCheckoutTest,ManagerOrderServiceTest,QueueManagementServiceTest,DiningTableManagementServiceTest,RestaurantSettingsServiceTest' test
```

The first command passed 42 tests; the second passed 28 with 5 skipped, giving 70 passed and 5 skipped overall, with zero failures/errors. The offline run uses the existing local Maven cache and an explicit Byte Buddy agent for Mockito because this Windows sandbox blocks dynamic runtime self-attachment. Environments without cached dependencies should omit `-o` and resolve dependencies normally; adjust Java/Maven/cache paths for the host. Docker's executable was present but its Linux engine pipe was unavailable, so the five PostgreSQL/Testcontainers schema tests did not execute. Rerun those tests with a working Docker/PostgreSQL environment. No live Spring database or staging test was run.

No commit, push, deployment, DNS change, QR rotation or production database migration is part of M6.
