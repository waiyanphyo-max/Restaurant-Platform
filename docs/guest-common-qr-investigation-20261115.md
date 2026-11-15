# Guest Common QR investigation — 15 November 2026

## Confirmed defect and implemented correction

`apps/guest-web/src/lib/guest-api.ts` compared the browser's `Origin` protocol with `Request.url`'s protocol. An HTTPS browser request delivered to Next over HTTP after TLS termination was rejected with `403 invalid-qr` before QR validation, checkout, or queue tracking reached Spring. A regression test reproduced that response before the fix.

The BFF now validates a serialized browser origin against the exact request `Host`, accepts HTTPS for a reviewed tenant, and permits HTTP only on loopback development hosts. Tenant selection still uses the reviewed registry and canonical `Host`; neither forwarded host nor forwarded protocol authorizes a tenant. Different hosts/ports, public HTTP origins, forged forwarded headers, and cross-origin requests remain rejected. The production HTTP smoke now simulates an HTTPS browser origin with an internal HTTP Next connection.

This is a confirmed application defect under the reproduced ingress conditions. It is **not evidence that the user's previously failing phone request used these conditions**. No live failing request, application server, or real Common QR credential was available in this execution, so its exact historical cause remains unconfirmed.

## Inspection of the existing flow

- Operations `createGuestQrUrl` generates the legacy Common QR entry `/?view=customer-pickup&restaurantId=<restaurant UUID>#qrToken=<credential>`. Table QR uses `/workspace?view=table-order&restaurantId=<restaurant UUID>#qrToken=<credential>`.
- `GuestSession.tsx` captures the fragment in browser memory, derives the QR mode from the validated route/query intent, and scrubs credential fragments from the address bar. A persistent tenant layout retains the controller while browsing products. No sign-in is requested for guest ordering.
- The same-origin BFF resolves the tenant again for every request, validates the request and the upstream response, then calls the existing anonymous Spring public endpoints. QR credentials travel in JSON; queue capabilities travel to Spring in headers. Query credentials, arbitrary restaurant IDs in BFF bodies, cookies, and bearer tokens are not forwarded.
- `OrderService` revalidates the current QR credential and restaurant settings, checks tenant-scoped products, variants, modifiers, prices and inventory, then saves the order/payment disposition and, for Common QR, its restaurant/date-scoped daily queue ticket in one transaction. Table QR remains dine-in without a fabricated queue ticket.
- The controller locks simultaneous submission, retains an immutable pending body/key when the result is uncertain, and clears the cart after receiving a valid receipt. The BFF's shared API transport reuses the same key for network retries. Pending recovery stores no QR or queue credential; after reloading, the guest must rescan the same original QR to retry an uncertain checkout. Credentials remain in memory only.
- The backend idempotency replay precedes current QR validation so an already committed order can be recovered using its original key/body after rotation. A new order with an old credential is still rejected. Common QR credentials currently have no time-based expiry in the schema; disabled/rotated credentials are rejected, and browser retries stop before the 24-hour idempotency retention window ends.

## Observed local configuration and remaining setup

The local Guest environment selects `staging`, enables local routing, and points the server-side API origin to `http://localhost:8080`. The reviewed `san-thaw-tar` staging host in `configs/restaurants/san-thaw-tar.json` is `gardening-enemies-robinson-solo.trycloudflare.com`. An arbitrary replacement tunnel hostname is denied until that exact authorized host is deliberately reviewed and registered. The production host remains a placeholder and must be configured before deployment.

No Guest listener on port 3002 or Spring listener on port 8080 was reachable in direct loopback probes. `adb devices -l` could not start/connect to its daemon in the execution environment. These observations prevented real backend/device ordering verification.

Required manual checks, without changing hosted configuration automatically:

1. Start the API with its existing database/JWT configuration. Verify `san-thaw-tar` is active and its `accepts_orders`, `allow_qr_order`, and `allow_takeaway` settings permit ordering. Do not rotate credentials during diagnosis.
2. Check `APP_IDEMPOTENCY_ENCRYPTION_KEY` on the running API. This must be a stable Base64-encoded 32-byte secret. Guest checkout always sends `Idempotency-Key`; an absent/invalid key deliberately returns `IDEMPOTENCY_ENCRYPTION_NOT_CONFIGURED` (503). Do not remove idempotency or use a dummy key to conceal that configuration error. Preserve an already configured key so outstanding encrypted receipts remain recoverable. Have the operator provision a random secret through their normal secret management if it has never been set.
3. Verify existing migration `20261024083000_add_qr_order_idempotency.sql` and the queue/order migrations are already present in the target database. No hosted migrations were run and this fix adds no QR schema migration.
4. Check the actual API `APP_PUBLIC_WEB_BASE_URL`; source fallback is `http://localhost:3000`, while Guest runs on 3002. This variable still affects legacy owner/workspace URL generation; current Operations QR generation uses the embedded `guestBaseUrl`. Changing one does not change the other. Use an explicitly approved HTTPS Guest origin for public links and preserve existing distributed links during any planned cutover. No environment or hosted value was changed by this work.
5. Public HTTPS ingress must preserve the exact canonical external `Host`, use an allowed-host list, and forward only sanitized ingress-controlled metadata. Do not select a restaurant from `X-Forwarded-Host`. Keep server-only `GUEST_API_BASE_URL` reachable from the Next server; the phone does not need direct access to that upstream for Guest BFF calls.

## Windows/Android manual verification

From the repository root, after providing the established API secrets in the API terminal:

```powershell
# API terminal — use the installed Maven command or its full path
$env:JAVA_HOME = 'C:\tools\jdk21'
& 'C:\Users\DELL\.m2\wrapper\dists\apache-maven-3.9.9-bin\4nf9hui3q3djbarqar9g711ggc\apache-maven-3.9.9\bin\mvn.cmd' -f app/api/pom.xml spring-boot:run
```

```powershell
# Guest terminal
$env:GUEST_CONFIG_ENV = 'staging'
$env:GUEST_LOCAL_ROUTING = 'true'
$env:GUEST_API_BASE_URL = 'http://localhost:8080'
npm run dev:guest
```

```powershell
# USB Android — use the selected authorized device when more than one is attached
$adbPath = 'C:\Users\DELL\AppData\Local\Android\Sdk\platform-tools\adb.exe'
& $adbPath devices -l
& $adbPath reverse tcp:3002 tcp:3002
& $adbPath reverse tcp:8080 tcp:8080
& $adbPath reverse tcp:8082 tcp:8082
& $adbPath reverse tcp:8083 tcp:8083
```

For localhost/ADB Reverse, browse `http://127.0.0.1:3002/r/san-thaw-tar`. To test a Common QR, use the **existing** valid Common QR entry and retain its query intent and credential fragment while substituting the local base/path in the browser: `http://127.0.0.1:3002/r/san-thaw-tar`. Table QR's local path is `/r/san-thaw-tar/workspace`. Do not print credentials in console output, add them to query strings, paste them into logs, or rotate a code merely to obtain a test URL. A localhost root without `/r/san-thaw-tar` does not implicitly choose a restaurant. Local path routing is deliberately disabled under `next start`/production, even with the local-routing flag set.

For public staging, open the exact reviewed HTTPS host; use the root Common QR or `/workspace` Table QR path, without `/r/<slug>`. Verify that the current tunnel/ingress still owns that hostname and forwards its canonical host. The compiled Operations development profile currently embeds the reviewed staging host; any deliberate embedded-origin change must follow the existing development/release build configuration process.

Using an existing authorized QR, select a currently available product, variant and required modifiers; submit twice rapidly; verify one order ID/order number, a daily queue ticket for Common QR, and the same restaurant's order in Operations. Disconnect/reconnect during submission, retry the same order, and verify receipt recovery with no second order or extra stock deduction. Progress the Common QR order through READY/CALLED/COMPLETED and check guest tracking. Use existing invalid/previously rotated test credentials or isolated fixture tests for negative cases; do not rotate live restaurant credentials for testing. Verify another restaurant's credential/product cannot order into this restaurant. Keep test purchases/orders confined to an authorized staging restaurant or an isolated test database.

## Verification record

- New TLS-termination regression initially failed with actual BFF 403 (expected 200), then passed after correction.
- Guest typecheck: passed after building the updated shared contract package.
- Guest unit/server-rendering tests: **19 files, 214 tests passed**, including QR validation, selection/checkout, queue transport, idempotency, invalid/rotated QR, two-tenant isolation, local routing, and ingress-origin regressions.
- Guest lint: passed after all Guest changes.
- Guest production build: passed, including bundled/server type validation and runtime route generation.
- Guest synthetic production HTTP smoke: **119 checks passed**, covering four synthetic orders, ten correctly denied streamed not-found responses, real built Next routing/BFF behavior, two-tenant QR modes, server fixture selection/pricing/inventory, duplicate/replayed order receipt, queue/status/notifications, rotated credentials and HTTPS browser Origin over internal HTTP. The first sandbox attempt could start Next but loopback connections failed with `EACCES`; the identical test passed under an approved escalation. Temporary test configs/icons and owned servers were cleaned up, and no temporary `qa-*` registry files remained.
- Live Spring/database order creation, existing `san-thaw-tar` settings/credentials, Android Chrome, public DNS/TLS/tunnel, and Operations visibility: **not verified**. Automated synthetic success must not be described as live end-to-end success.

Modified files for the QR fix: `apps/guest-web/src/lib/guest-api.ts`, `apps/guest-web/src/lib/guest-api.test.ts`, `apps/guest-web/scripts/smoke-production.mjs`, and this report. Existing staged smoke changes were preserved. No customer data, shopping records, financial history, QR credentials, hosted settings, or hosted migrations were changed. No APK rebuild is required for this Guest BFF change; restart/rebuild the Guest web process to load the changed server code.
