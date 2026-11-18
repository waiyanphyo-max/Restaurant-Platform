# Text-only Customer Android delivery checkout

Customer delivery checkout supports an owned saved address or a temporary `MANUAL_TEXT` address without Google Maps, GPS, location permission, latitude, or longitude. The customer reviews a server-calculated quote and places a Cash on Delivery order. Operations can fulfill it using the address and contact details. Text coverage establishes eligibility for a configured City/Township; it does not verify geographic proximity.

## Root cause

The previous contract required a confirmed coordinate pair at several independent layers: Customer Android disabled quote review without a pin, destination validation rejected saved addresses without coordinates, Spring rejected every coordinate-free destination, and the database checkout-snapshot constraint required coordinates and recognized only saved/map/GPS sources. Enabling the button alone would still fail quote validation or order persistence.

## Changed files

Paths below are relative to the repository root. The adjacent tests cover the changed behavior.

| Area | Implementation and tests |
| --- | --- |
| Customer checkout | `apps/customer-mobile/src/features/checkout/CheckoutScreen.tsx`, `destination.ts`, `CheckoutScreen.test.tsx`, `destination.test.ts`, `CheckoutProvider.test.tsx` |
| Saved address compatibility | `apps/customer-mobile/src/features/addresses/AddressScreen.tsx`, `AddressScreen.test.tsx` |
| Shared API contract/client | `packages/shared-types/src/customer-api.ts`, `member-api.ts`; `packages/api-client/src/clients.ts`, `customer.test.ts` |
| Spring destination validation | `app/api/src/main/java/com/restaurant/platform/service/CustomerDeliveryCheckoutService.java`; `dto/order/CustomerDeliveryCheckoutRequest.java`, `CustomerDeliveryQuote.java`; `app/api/src/main/resources/messages.properties`, `messages_en.properties` |
| Operations API address fields | `app/api/src/main/java/com/restaurant/platform/dto/delivery/DeliveryTaskDto.java`, `dto/order/ManagerOrderDetailDto.java`; `service/DeliveryService.java`, `ManagerOrderService.java` |
| Spring tests | `app/api/src/test/java/com/restaurant/platform/service/CustomerDeliveryCheckoutTest.java`, `AssignedDeliveryServiceTest.java`, `ManagerOrderServiceTest.java`; `controller/CustomerDeliveryCheckoutControllerHttpTest.java`, `AssignedDeliveryControllerHttpTest.java`; `integration/CustomerDeliveryLocalPostgresTest.java` |
| Operations screens/tests | `apps/operations-mobile/src/features/operations/DeliveriesScreen.tsx`, `DeliveryDetailScreen.tsx`, `OrderDetailScreen.tsx`, `assigned-delivery.test.ts`, `delivery-screens.test.tsx`, `screens.test.tsx` |
| Database | `supabase/migrations/20261116090000_allow_text_only_customer_delivery_checkout.sql` |
| Handoff | `apps/customer-mobile/README.md`, `docs/api.md`, `docs/m12-acceptance.md`, this document |

## API contract and delivery rules

All customer checkout routes remain bearer authenticated and restaurant scoped:

- `GET /api/v1/customer/restaurants/{restaurantId}/delivery-zones`
- `POST /api/v1/customer/restaurants/{restaurantId}/orders/delivery/quote`
- `POST /api/v1/customer/restaurants/{restaurantId}/orders/delivery/checkout`
- `GET` or `DELETE /api/v1/customer/restaurants/{restaurantId}/orders/delivery/checkout`

A temporary text quote request has this shape. Replace every placeholder with the authenticated test account's details, a configured active coverage pair, and an available product UUID:

```json
{
  "temporaryDestination": {
    "source": "MANUAL_TEXT",
    "address": "<street, building/floor and ward details>",
    "city": "<configured city>",
    "township": "<configured township>"
  },
  "recipientName": "<test recipient name>",
  "recipientPhone": "<controlled valid test contact number>",
  "deliveryNote": "<optional delivery instructions>",
  "items": [{ "productId": "<available product UUID>", "quantity": 1 }]
}
```

`MANUAL_TEXT.latitude` and `.longitude` are optional and nullable. A coordinate-free destination must omit both or send both as `null`. Every supplied pair must be complete and within latitude -90..90 and longitude -180..180. `MANUAL_MAP` and `GPS_CONFIRMED` retain required coordinate pairs. Owned saved addresses still use `addressId` instead of `temporaryDestination`; they may have no coordinates. Quote destination coordinates are nullable in the shared TypeScript response. The server never substitutes coordinates for a text address.

Street/building/ward detail, City, Township, recipient name, and a structurally valid contact phone are required. Optional notes remain supported. Existing profile/saved-recipient fallback behavior is retained; the Customer UI presents the effective name and phone for review. Saved-address ownership remains checked against the authenticated customer.

The new quote/checkout flow considers only active zones with both a nonblank configured `coverageCity` and `coverageTownship`. Matching retains the established trimmed, case-insensitive City-and-Township comparison. An unknown pair cannot fall through to a legacy unrestricted zone. Existing delivery fees, eligible-zone minimums, restaurant minimums, authoritative product/modifier prices, availability, and stock checks still apply. The legacy order endpoint keeps its existing behavior.

The quote returns the normalized destination, authoritative totals, `confirmationToken`, and `idempotencyKey`. Confirm using the same destination, recipient, notes, and items, plus the returned `confirmationToken`, and send the returned key in the `Idempotency-Key` header. Changes to the reviewed destination, pricing, fees, or selected zone require a fresh review; confirmation also rechecks current eligibility, availability, and sufficient stock. Repeating the same confirmed request with the same key returns the original receipt; reusing that key with a different request is rejected. Recovery and abandonment remain server controlled, including late submissions and duplicate prevention.

Operations delivery tasks and permitted manager order details now expose `deliveryCity` and `deliveryTownship`. Stored recipient name, phone, full address, and notes are retained. A missing destination pin displays an explicit navigation-unavailable message and no destination Map/Navigation actions. Valid restaurant pickup coordinates can still have independent navigation actions. Existing membership, assignment, permission, and restaurant boundaries remain in force.

## Database handoff

`Order` already maps nullable coordinate columns; no entity column or nullability change is needed. The forward-only migration replaces `chk_customer_delivery_checkout_snapshot` to recognize `MANUAL_TEXT` and allow null coordinates for `MANUAL_TEXT` and `SAVED_ADDRESS`. Map/GPS sources still require coordinates.

The existing complete-pair/range coordinate constraint, owned-address insert trigger, immutable address/coordinate snapshot triggers, tenant foreign keys, checkout-key uniqueness, and request-hash requirements remain intact. Historical orders are not rewritten.

The migration is supplied for review and controlled application to the intended backend before checkout acceptance. No hosted migration, hosted database, or Supabase setting was changed by this work. Use only a disposable local database for migration tests; do not point test runners at a hosted database.

## Verification record

These checks have passed during implementation:

- API client: 104 automated tests.
- Customer Mobile: 8 Node tests and 349 Vitest tests.
- Operations Mobile: 6 Node tests and 321 Vitest tests.
- Shared/package builds and the relevant API client, Customer Mobile, and Operations Mobile TypeScript and lint checks.
- Maps-disabled Customer Android Hermes JavaScript export. This validates bundling and configuration, not APK assembly or real-device behavior.
- Full offline Spring Boot `verify`: **BUILD SUCCESS**, 511 discovered tests, 490 passed, zero failures/errors, 21 skipped. The skips were 13 Docker migration tests because Docker was unavailable and 8 owner-onboarding tests requiring a separate opt-in database.
- All 29 repository migrations, including the new forward migration, applied successfully to a fresh disposable PostgreSQL 16.4 database on loopback. Two older privilege scripts used temporary fixture copies omitting PostgreSQL 17's `MAINTAIN` privilege; repository SQL was unchanged. Hibernate schema validation and the actual customer checkout database tests ran successfully.

The executed `CustomerDeliveryLocalPostgresTest` passed all 9 tests, including saved text-address null persistence, snapshot immutability and malformed-coordinate guards, plus concurrent duplicate checkout, fulfillment, and COD accounting for `MANUAL_TEXT`, `MANUAL_MAP`, and `GPS_CONFIRMED`. `CustomerDeliveryCheckoutTest` passed 37 service cases and `CustomerDeliveryCheckoutControllerHttpTest` passed 6 HTTP cases. These local authenticated service/HTTP checks use controlled fixtures; no real-device, real Supabase login, live map, or hosted order acceptance was performed.

The initial API-client loopback and Java Mockito attachment checks were restricted by the sandbox; final runs passed outside it. PostgreSQL 18 initialization crashed on this machine, so persistence verification used the installed PostgreSQL 16.4. The disposable database was stopped after verification. The final Spring log is retained at `target/text-delivery-qa-20261116/backend-verify.log`.

Run the relevant JavaScript checks from the repository root:

```powershell
npm run build:packages
npm run typecheck -w @restaurant-platform/api-client
npm run lint -w @restaurant-platform/api-client
npm run test -w @restaurant-platform/api-client
npm run typecheck -w @restaurant-platform/customer-mobile
npm run lint -w @restaurant-platform/customer-mobile
npm run test -w @restaurant-platform/customer-mobile
npm run typecheck -w @restaurant-platform/operations-mobile
npm run lint -w @restaurant-platform/operations-mobile
npm run test -w @restaurant-platform/operations-mobile
npm run build:starter -w @restaurant-platform/customer-mobile
```

With JDK 21 and Maven available, run `mvn test` from `app/api`. Database integration tests require their documented disposable local database configuration or Docker; report skipped database tests separately from executed tests.

## APK and JavaScript updates

This change adds no native dependency and changes no native configuration. A compatible installed development client can load the new JavaScript through Metro without rebuilding its APK:

```powershell
# Use the reviewed test restaurant/environment and the existing ignored local app configuration.
# adb must be available from the Android SDK and the test device must be connected.
$env:RESTAURANT_SLUG = '<reviewed test restaurant slug>'
$env:MOBILE_ENV = 'development'
npm run build:packages
adb reverse tcp:8081 tcp:8081
npm run start -w @restaurant-platform/customer-mobile -- --localhost
```

Reload the Customer development client connected to the localhost Metro server. The currently generated native network-security configuration permits HTTP Metro on localhost, `127.0.0.1`, and `::1`; use the ADB reverse tunnel instead of default LAN Metro. Keep the restaurant/environment equal to the installed client's embedded configuration. In a second terminal with the same restaurant/environment, use a separate port for Operations:

```powershell
adb reverse tcp:8082 tcp:8082
npm run start -w @restaurant-platform/operations-mobile -- --localhost --port 8082
```

Reload the Operations development client connected to its localhost Metro server. An older incompatible native development client still needs its normal compatibility upgrade.

An already installed standalone APK cannot acquire changed local source files by reloading. This repository has no configured over-the-air update service, so distributing these JavaScript changes to standalone users requires a new packaged app release/APK using the existing build process. If an independently configured compatible update mechanism exists in a deployment, use its approved process. Enabling or changing the native Google Maps key later still requires the normal native rebuild.

## Manual acceptance procedure

This procedure has not been claimed as a completed real-device or live-order test. Use a designated test environment and controlled test accounts; record the build/bundle version, restaurant UUID, chosen zone, quote total, order number, and outcome when executing it.

### Prepare the environment

1. Run the updated Spring API against the intended test database after the forward migration has been reviewed and applied there. Verify that both apps target that API and the same existing restaurant UUID and Supabase Auth project. The `starter-fixture` export contains no live restaurant/account data and cannot establish authenticated acceptance.
2. Use a restaurant that is active, accepts orders, permits delivery, and has an active zone with both City and Township explicitly configured. Record the exact pair, zone fee and minimum, restaurant minimum, currency, and available menu prices. Ensure the cart will meet both minimums and the product is available with enough stock.
3. Use an authenticated customer from that Auth project with a controlled valid contact number. Prepare an owned saved address with street/building/ward detail, City, Township, recipient, and both coordinates null. Use the existing Customer address UI/API, not direct hosted database editing.
4. Use an authorized Operations test account for the same restaurant and an eligible driver/staff assignee. Confirm that the assignee can sign in and access assigned deliveries.
5. For the Maps-disabled case, use a compatible Android test build whose embedded `mapsConfigured` capability is false. The selected test environment has no Google Maps key. Keep Android location permission denied and location services off throughout this case; no permission prompt should be needed.

### Place and fulfill a temporary text-address order

1. Sign into Customer Android, add an available item to the cart, and tap **Continue to checkout**.
2. Tap **Enter a text delivery address**. Verify that the configured delivery areas are shown and that Map/GPS selection is absent in the Maps-disabled case.
3. Enter a detailed street/building/floor/ward address. Tap the configured **Township, City** choice to fill both fields. Enter the recipient name and a valid controlled contact phone, and optionally add delivery instructions.
4. Verify that the form states that navigation coordinates are unavailable. **Check delivery and review total** becomes enabled only after required fields are valid. There must be no Maps, location-service, GPS, or permission requirement.
5. Tap **Check delivery and review total**. Verify the server review shows the full address, chosen City/Township, recipient, normalized phone, notes, line prices, subtotal, configured delivery fee, total, and **Cash on delivery**. Verify the text-only disclosure says geographic proximity has not been verified. Check that total equals subtotal plus fee minus discount.
6. Tap **Confirm and place order**. Verify **Order confirmed**, a single order number, the reviewed total/currency, and Cash on Delivery. Open **Track this order** and confirm the new order appears once in this customer's history.
7. In Operations, open the same order number. Verify the full address, City, Township, recipient name, phone, and delivery instructions. Use **Accept order**, **Start preparation**, and **Mark ready**, confirming each update, to move the order through **ACCEPTED**, **PREPARING**, and **READY** using an authorized role.
8. Open Deliveries and assign the task if no configured default driver has already been assigned. Sign in as the assignee and open the assigned delivery. Verify the same address/contact/notes and explicit map-pin/navigation-unavailable message. No **View Delivery Location** or **Navigate to Customer** action should appear for the coordinate-free destination. A valid pickup pin may still expose pickup navigation.
9. Mark the assigned task **picked up**, then confirm the update. Verify the order becomes **OUT_FOR_DELIVERY** without requiring Maps. Confirm that **Mark delivered** requires the COD cash-collected confirmation. Using the controlled test payment procedure, select **I collected the cash due for this delivery**, mark delivered, and confirm.
10. Refresh Operations and Customer tracking. Verify delivery **DELIVERED**, order **COMPLETED**, and the one COD payment recorded as paid for the reviewed amount. Confirm that no second order or second payment was created.

### Saved addresses, validation, retries, and Maps regression

1. Repeat checkout with the owned saved address containing null coordinates. Verify the saved address remains selectable and unchanged, the quote uses `SAVED_ADDRESS`, the persisted order has both coordinates null, and Operations can process it normally. Editing and saving a text-only address must remain possible without opening Maps.
2. Clear the temporary detailed address, City, Township, and recipient name one at a time, then enter an invalid phone. Verify clear validation feedback and a disabled review action. Restore valid fields between checks. Confirm optional notes can be empty.
3. Enter a City/Township pair that is not configured and request a quote. Verify delivery is rejected and no order is created. An unrestricted legacy zone must not make the pair eligible. Also verify a cart below a required minimum and an unavailable/out-of-stock product cannot be confirmed successfully.
4. During a controlled test checkout, double tap confirmation or retry the same confirmed request with the same `Idempotency-Key`. Verify one order number, one stock reservation, and one pending COD payment. A repeat response must refer to the original order. Changing request details while reusing the committed key must be rejected.
5. Simulate a lost response after confirmation using the test environment's network controls. Reconnect and use **Retry this checkout** or **Check again**. Verify recovery returns the original receipt when committed. If starting again, use **Start a new checkout** so the server retires the previous unrecorded key or returns its existing receipt; verify a late retry cannot create a second order.
6. Inspect test API responses or the disposable test database, where authorized: saved/text coordinate-free quotes and orders retain null/null coordinates; full text/contact/notes remain stored; `MANUAL_TEXT` is preserved as the temporary source. Never substitute 0,0 or restaurant coordinates.
7. In a separately configured compatible Maps-enabled test build, verify saved addresses with map pins, **Choose another location on map**, and explicitly confirmed GPS suggestions still quote and place orders with valid points. Also repeat a text-only order in that Maps-enabled build. Denied GPS permission must not block the text-address path. Record actual map rendering separately; unit tests and exports do not verify Google billing, credentials, or a device map.

No commit, push, deployment, hosted migration, hosted database update, or Supabase configuration change is part of this handoff.
