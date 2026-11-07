# M12 Customer Android delivery ordering

Reviewed on 2026-11-07 in Asia/Bangkok on `rebuild/m12-complete-customer-mobile`.

## Customer and delivery workflows

| Flow | Implementation |
| --- | --- |
| Storefront and cart | The installed customer build selects one restaurant. Home and Menu use its published catalog and branding. Customers can search, filter by category, choose variants and modifiers, change quantities or instructions, and edit or remove cart lines. The cart shows an estimated subtotal. |
| Profile and addresses | Customers edit their account and preferred language, create or edit saved addresses, choose a default and confirm deletion. Spring resolves the address owner from the JWT. An address saved without coordinates can still be edited in Profile. M12 delivery requires a confirmed coordinate pair and complete address. |
| Saved delivery location | Checkout starts with the current default saved address and allows choosing another owned address. The customer reviews its pin, recipient, contact phone and instructions. Edits to checkout contact fields apply to the order. |
| Temporary delivery location | The existing Google Maps picker supports taps and marker adjustment. The customer confirms the pin and enters a complete address, city, township, recipient, phone and optional landmark or instructions. The temporary destination stays in the current checkout until the customer confirms the order. The address book stays intact, and later checkouts start with the current saved default. |
| Current location | The explicit GPS action requests foreground permission and acquires one fix. The picker keeps the result editable and unconfirmed. Denied permission, unavailable positioning and low accuracy have recovery messages. Manual pin selection remains available when the map is configured. |
| Eligibility and totals | Spring checks the active restaurant and delivery settings, ownership, coordinates, city and township, menu, modifiers, stock, restaurant and zone minimums, and prices. The customer reviews server-priced lines, discount, delivery fee and total. Spring repeats those checks before order creation. |
| Cash on delivery | Confirmation creates one pending order and a pending COD payment in one transaction. The receipt shows the order number and amount. Tracking reads the current payment status from Spring. Staff and driver cash confirmation use the existing payment and accounting flow. |
| Retry | The app keeps the exact confirmed body and key in session memory for an ambiguous response. Android SecureStore retains only the opaque key, scoped to the account, restaurant and environment. After restart the app can look up the receipt. If Spring finds no receipt, the customer can recheck or explicitly start a new checkout. |
| History and tracking | The customer sees their delivery orders for this restaurant, historic items and prices, payment status, the recorded destination and pin, and order and delivery timelines. Tracking refreshes while the screen is focused in the foreground. Spring rechecks ownership, pending status and payment before accepting cancellation. |
| Reorder | A completed or cancelled delivery can rebuild a cart from the current menu. Unavailable items are flagged. The rebuilt cart uses current prices and selections and returns through the normal destination confirmation and checkout flow with a new key. |
| Notifications and language | Order creation, preparation, readiness, delivery and cancellation feed a scoped in-app inbox. FCM uses the existing optional per-device outbox, with scoped Android registrations and stale-token deactivation. The ordering, address, tracking and inbox controls support English and Burmese from the saved profile preference. Catalog text and notification body text come from the server. |
| Operations navigation | The existing M10 assigned-task endpoint reads the saved order destination. Restaurant pickup uses the restaurant's stored address and coordinates. `Navigate to Customer` hands the confirmed order point to Google Maps. The assigned worker route rechecks access, and reassignment revokes the former worker's access. |

## API and storage changes

The table uses the authenticated prefix `/api/v1/customer/restaurants/{restaurantId}`. [API contract](api.md#customer-delivery-checkout)

| Method | Suffix | Change |
| --- | --- | --- |
| POST | `/orders/delivery/quote` | Validates a saved address ID or a temporary map/GPS destination and returns server prices, normalized destination, confirmation token and UUID checkout key. |
| POST | `/orders/delivery/checkout` | Requires the confirmed request and `Idempotency-Key`. Revalidates the quote, creates the order atomically, or returns the original receipt for an exact retry. |
| GET | `/orders/delivery/checkout` | Uses the customer JWT, restaurant path and `Idempotency-Key` to recover the order receipt. |
| GET | `/orders`, `/orders/{orderId}` | Returns restaurant-scoped delivery history and order details. Details include destination provenance, order and delivery timelines, currency when stored, and `canCancel`. |
| POST | `/orders/{orderId}/cancel` | Cancels an eligible unpaid pending delivery and returns the updated order. |
| GET, PATCH | `/notifications`, `/notifications/{notificationId}/read` | Lists customer delivery notices and records the first read time. |
| POST, DELETE | `/devices`, `/devices/{deviceId}` | Registers or deactivates an owned Android device for one restaurant. |

- `20261107100000_add_customer_delivery_checkout_snapshot.sql` reuses M10's immutable coordinate pair and existing address, contact and note snapshots on `orders`. It adds the saved-address identifier, city, township, source, checkout UUID, request digest and checkout currency. Order creation time records confirmation. A unique index scopes checkout keys to the customer and restaurant. The database checks saved-address ownership at insert and protects the snapshot on update. Saved-address edits and deletion leave existing order destinations intact. Older orders retain their available historical data. [Snapshot migration](../supabase/migrations/20261107100000_add_customer_delivery_checkout_snapshot.sql)
- `20261107110000_scope_customer_delivery_push_devices.sql` adds a nullable customer restaurant binding to Android device records. It scopes enqueue and dispatch for M12 delivery notifications. The dispatcher rechecks scope before sending queued rows. Existing QR and Operations notification routes continue using their existing contracts. [Push migration](../supabase/migrations/20261107110000_scope_customer_delivery_push_devices.sql)
- Existing saved-address, legacy customer order and assigned-worker APIs remain available. Customer M12 uses the new scoped quote and checkout paths. Delivery coverage follows the configured city and township, with an unrestricted legacy zone available as a fallback when configured. The coordinate pair identifies the entrance for navigation.
- The unmodified build locks requests to its embedded restaurant. Spring checks order and catalog relationships against the path restaurant and authorizes customer records against the JWT. A global Supabase customer JWT can still access another restaurant's public ordering surface if an external client constructs a fully valid request for that restaurant. The repository has no trusted proof that such a request originated from a particular Android build. [Architecture decision](product-architecture-decision.md)

## Verification

| Check | Result |
| --- | --- |
| Workspace frontend tests | `npm test` passed 885 tests. After the final quote precision guard, `npm run test -w @restaurant-platform/customer-mobile` passed 220 tests (8 native configuration cases and 212 Vitest cases). |
| Workspace TypeScript | `npm run typecheck` passed. |
| Workspace lint | `npm run lint` passed. |
| API client | `npm run test -w @restaurant-platform/api-client` passed all 82 tests, including the existing real loopback HTTP test. The default sandbox blocked loopback connectivity. |
| Full Spring Boot verification | `mvn -o -f app/api/pom.xml verify` passed on 2026-11-07 at 16:07 Asia/Bangkok with `ACCOUNTING_TEST_DATABASE_URL` pointed at a disposable loopback database. Of 371 discovered tests, 361 passed with zero failures or errors. Ten Docker/Testcontainers cases were skipped because the Docker Desktop engine was unavailable. |
| Focused Spring checkout | `CustomerDeliveryCheckoutTest` passed 18 cases and `CustomerDeliveryCheckoutControllerHttpTest` passed 3 cases. |
| Disposable PostgreSQL 16.4 | `AccountingLocalPostgresTest`, `AccountingReceiptLocalPostgresTest` and `ProcurementLocalPostgresTest` passed 11 cases covering accounting, JPA schema validation, immutable delivery snapshots and scoped history, notifications and outbox behavior. `mvn -o -f app/api/pom.xml -Dtest=CustomerDeliveryLocalPostgresTest test` passed the separate real Spring checkout and assigned-worker test with two concurrent submissions. The two M12 migrations ran locally. Temporary copies of two older privilege scripts omitted PostgreSQL 17's `MAINTAIN` privilege. |
| Android export | `npm run build:starter -w @restaurant-platform/customer-mobile` exited 0 and exported 1,362 modules, 26 assets and a 3.7 MB Android Hermes bundle with the development restaurant fixture. Windows needed command-local `TEMP` and `TMP` in the ignored workspace target directory for Hermes. |
| Device and emulator | SDK `adb devices -l` and `emulator -list-avds` both exited 0. There were no attached devices or configured AVDs. Local SDK inspection found Android 36.1 and the native template requires compile SDK 37. |

Automated checks exercise saved, manual-map and GPS checkout, denied GPS permission and manual fallback, missing Maps configuration, destination confirmation, route and identity scope, temporary location preservation, stale fees and prices, zone and stock rejection, invalid coordinates and addresses, restart recovery and safe replay, order cancellation, current-price reorder, English and Burmese controls, notification isolation, and assigned-worker destination access and restaurant pickup coordinates.

Live Google Maps tiles and navigation, device GPS, live Supabase Auth and FCM delivery remain unverified. The Android export verifies bundling with the fixture. Native smoke testing needs an installed signed customer build with matching restricted Maps credentials and a configured restaurant. A process-restart receipt lookup reports the committed server state at the time of the check. A request that has yet to reach the server can still arrive later, so the app offers a recheck before the customer chooses a new checkout.
