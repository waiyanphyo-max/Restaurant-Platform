# M10 Staff and assigned delivery acceptance

Reviewed on 2026-11-04 in Asia/Bangkok on `rebuild/m10-staff-android`.

## Android workflows

| Role | Workflow |
| --- | --- |
| Staff | Use Orders for restaurant order lists, item snapshots, preparation instructions and permitted status changes. Create dine-in or takeaway counter orders using active tables and the published menu. Confirm eligible counter cash separately. Use Pickup queue to call a ready ticket and open its linked order to complete pickup. Use Deliveries in the same account for assigned work. |
| Delivery Driver | Use the delivery dashboard, assigned task list, assigned detail, restaurant-scoped updates and profile. Open restaurant pickup and customer destination details. Confirm pickup, delivery or failure as allowed by the current task state. Enter an optional update note and a required failure reason when marking failed. Confirm cash receipt when a COD payment is due. |
| Owner and Manager | Keep the existing restaurant-wide order, delivery management and finance workflows. Choose an eligible current restaurant member to assign or reassign a task. Select your own account when eligible to use the same assigned delivery detail and navigation. |

Staff order actions and pickup calls refresh after a save or failed attempt. The app confirms mutations and blocks duplicate taps while a request is in flight. Spring remains authoritative for the order, queue, delivery and payment transitions. Assigned delivery detail rechecks assignment before opening a map or sending a write, and every 30 seconds while the detail is open in the foreground and idle. Updates report new assignments and reassignment. The detail clears private fields and shows an unavailable state when reassignment is detected.

## Delivery locations and privacy

- Pickup uses the configured restaurant's stored address and valid coordinate pair. The destination uses the checkout recipient, address, instructions and coordinate snapshot on that exact order.
- The assigned task has **View Pickup on Map**, **Navigate to Pickup**, **View Delivery Location** and **Navigate to Customer**. Supported modes are driving, motorcycle, bicycling, walking and transit, subject to Google Maps availability for the location. The HTTPS Maps link hands off to the app or browser. Google Maps determines the current origin using its own foreground location access. [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started)
- Incomplete or out-of-range coordinates leave the text visible and disable navigation. Zero is valid. Maps errors surface on the assigned task.
- Spring scopes location-bearing responses to the requested restaurant, delivery ID and current JWT assignee for every role. Legacy management access is retained. General order responses redact delivery contact, address and related private fields for unassigned Staff. Private delivery responses use `Cache-Control: no-store`. The mobile detail keeps these fields in screen-local memory.
- Delivery writes check assignment and state under a consistent order-then-delivery lock. The optional task revision precondition guards writes after a refresh. A repeated transition cannot duplicate payment, status history or notifications. Assignment history records the actor and the old and new assignees on reassignment.

## Database and M12 boundary

The initial schema stores nullable `latitude` and `longitude` as `NUMERIC(10,7)` on `restaurants` and `customer_addresses`. The existing restaurant and customer-address write DTOs validate each field's range, and their respective read DTOs expose both fields. M10 also requires a complete valid pair before returning a point for navigation. Earlier delivery orders store text, recipient and notes but lack a historical point and a saved-address reference.

The forward migration [20261104100000_add_order_delivery_coordinates.sql](../supabase/migrations/20261104100000_add_order_delivery_coordinates.sql) adds a nullable, range-checked immutable pair on `orders`. The current customer checkout copies a valid pair from the selected customer-owned address on insert. Older orders retain their textual snapshots. Their navigation stays unavailable because the confirmed historical point cannot be recovered from the current address book.

M12 checkout must resolve and validate the customer's confirmed delivery point on the server, then insert it into `orders.delivery_latitude` and `orders.delivery_longitude` with the matching textual destination, recipient and notes. This applies to temporary checkout locations as well as saved addresses. The assigned delivery API and Android navigation already consume those order fields.

## Verification and operational limits

| Check | Result |
| --- | --- |
| Frontend workspace tests | 667 passed, including 243 Operations Android checks and 72 API-client tests. The API-client suite includes a real loopback HTTP integration test. |
| TypeScript and lint | Workspace checks passed. |
| Spring Maven verify | 326 passed with zero failures or errors. Nine Docker-only tests were skipped because the Docker engine was unavailable. |
| Final order-detail privacy check | All 14 `ManagerOrderControllerTest` and `ManagerOrderServiceTest` cases passed after masking customer identity in the creator and status-history fields. |
| Disposable PostgreSQL 16.4 | All 11 local checks passed, including assignment eligibility, concurrent pickup, stale revision rejection, reassignment, audit history and the immutable order point. The M10 migration ran unchanged. Temporary copies of two older privilege scripts omitted PostgreSQL 17's `MAINTAIN` privilege. |
| Operations Android export | Metro and Hermes exported the Android bundle with the development tenant fixture. |

The Android tests cover Staff role and route boundaries, counter order inputs, preparation and pickup actions, reassignment updates, Maps URL construction and fallback handling, missing and invalid coordinates, assignment rechecks, COD confirmation, duplicate taps, offline requests and expired sessions.

Offline or expired access closes the protected workspace. If connectivity drops during a delivery write, the app reports the uncertain result and refreshes from Spring before offering another action.

Opening Google Maps backgrounds the Operations app. The existing session flow revalidates restaurant membership on return. Workers may return to the dashboard and need to reopen the task. Unsaved delivery notes are cleared when the workspace closes.

The counter-order POST retains its existing request contract. The app blocks duplicate taps in the mounted workspace and prompts Staff to check the refreshed Orders list after an ambiguous response before submitting again. Counter-order replay protection is limited to that UI guard and verification step.

Android device smoke testing was unavailable. ADB found no attached device and the SDK reported no configured virtual device. Live Google Maps handling, live Supabase sign-in and provider notification delivery remain unverified.

See the [delivery API contract](api.md#delivery-management-and-driver-workflow) and [permission matrix](role-permission-matrix.md#delivery-scope).
