# M11 Customer Android foundation acceptance

Reviewed on 2026-11-05 in Asia/Bangkok. Checkout: `rebuild/m11-customer-mobile`.

M11 develops `apps/customer-mobile` as the separate restaurant-branded Customer Android application described by [PAD-001](product-architecture-decision.md), [M1](m1-acceptance.md) and [M2](m2-acceptance.md). Home, Menu, Cart, Orders and Profile belong to this app. Operations staff roles and membership are not prerequisites for customer authentication or address ownership.

No checkout, payment processing, marketplace, remote migration, deployment or Git publication is included. The starting worktree contained untracked `.postman/` and `postman/`; those user files are preserved.

## Product and implementation boundaries

| Requirement | Implementation and acceptance boundary |
| --- | --- |
| Independent restaurant branding | Build configuration selects one reviewed restaurant, its customer Android package ID, display name, color and optional logo/icon. Splash configuration uses that brand. Development, staging and production are separate build environments. |
| Restaurant lock | The app captures and freezes validated embedded build metadata. Its storefront and customer API use that restaurant; no selector, route parameter, address form or customer account chooses another tenant. Public menu responses must match the configured restaurant. |
| Customer authentication | Supabase email/password registration and sign-in, SecureStore-backed session restoration, refresh and logout. Account creation with email verification enabled waits for authentication before offering address setup. No staff-membership lookup is required. |
| Phone OTP | Disabled unless explicitly requested for the build and public Supabase Auth settings indicate a configured SMS provider, enabled phone authentication and disabled phone auto-confirmation. SMS verification establishes the Auth session; profile contact text does not. Provider delivery remains a live verification gate. |
| Navigation | Expo Router provides Home, Menu, Cart, Orders and Profile plus the address editor. Cart and Orders are foundations for M12; they do not create delivery orders. Protected screens require an authenticated customer. |
| Profile | Load and edit the authenticated customer's account details through Spring. Display saved addresses and allow creating, viewing, changing and selecting a default owned address. Address saves never submit a profile update. |
| First-time address setup | After registration and authentication, offer address setup immediately when the account has no saved address. Setup may be skipped and revisited in Profile; GPS availability cannot block account creation. |
| Google Maps | Use the native `react-native-maps` Google provider, a tappable map and draggable marker. Show the selected coordinates and require explicit pin confirmation before a new or adjusted point can be saved. Returning to details does not itself confirm a newly selected point. |
| Initial map view | Prefer a valid saved point, then reviewed build-time initial coordinates. Otherwise show the explicitly described approximate Yangon region; it is not an inferred restaurant location or a selected delivery destination. |
| Foreground GPS | Only the explicit current-location action requests foreground permission and one position. A suggested point remains editable and unconfirmed. Permission denial, disabled services, timeout, invalid coordinates and low or unknown accuracy have recovery messages. Manual map selection remains available without permission. |
| Private persistence | Address reads and mutations use the authenticated Spring API and existing `customer_addresses` storage. Responses exclude owner IDs and use `Cache-Control: no-store`. Precise points are not written to logs or a separate mobile address database. |
| Offline, errors and empty states | Show loading, retry, empty and unavailable states for backend-backed views. Failed or ambiguous writes direct the customer to refresh saved data before retrying. No offline write queue is introduced. |
| Notifications | Opt-in device-registration foundation uses the existing authenticated device API and native FCM tokens. Gate permission and registration on provider/build configuration; support token changes and device cleanup before logout. Actual notification delivery is a separate provider verification gate. |

The frozen build identity is an application routing boundary. As PAD-001 states, a build-time restaurant ID is not proof of authorization. A modified binary or an arbitrary external HTTP client can construct another public restaurant URL; this repository has no app-attestation or server-issued per-build customer restaurant credential. Spring remains responsible for authenticated ownership, restaurant resource relationships and future checkout eligibility. M11 does not claim that client configuration cryptographically binds every external API request to a signed restaurant build.

## Verified existing schema and API contracts

The initial migration `20261010204938_create_initial_schema.sql` already defines `customer_addresses.latitude` and `longitude` as nullable `NUMERIC(10,7)` with latitude `[-90, 90]` and longitude `[-180, 180]` checks. The JPA entity and existing `CustomerAddressRequest` / `CustomerAddressResponse` already expose both axes; this was verified independently of the database column names.

| Address information | Existing supported field and limits |
| --- | --- |
| Home, Work or custom label | `label`, required, 50 characters |
| Recipient name | `recipientName`, optional, 150 characters |
| Building, floor or room | `houseNo`, optional, 50 characters |
| Street or detailed address | `street`, optional, 100 characters |
| Ward or neighborhood | `ward`, optional, 100 characters |
| Township or area | `township`, required, 100 characters |
| City | `city`, required, 100 characters |
| Landmark and delivery instructions | `deliveryNote`, optional, API limit 2,000 characters |
| Confirmed map point | `latitude`, `longitude`; both in range, or both omitted for a manual address |
| Default preference | Request `makeDefault`; response `isDefault` |

There is no per-address contact-phone, dedicated landmark or dedicated floor column. The editor uses existing compatible fields and explains that contact phone is edited separately in account details. It does not silently overwrite the profile phone or create duplicate address storage. M12 can supply the existing checkout recipient-phone field after customer confirmation.

Existing routes are `GET/POST /api/v1/customer/addresses`, `PUT/DELETE /api/v1/customer/addresses/{addressId}` and `PATCH /api/v1/customer/addresses/{addressId}/default`. The controller derives the customer from the validated JWT subject. Reads use the owner ID; update, delete and default-selection lookups use both address ID and owner ID. Foreign addresses return the same not-found response as unknown addresses. No request-provided customer UUID grants access.

The first saved address becomes default. Editing an existing default keeps it default. Setting another default clears the owner's earlier default, and deleting a default promotes a remaining address when available. M11 preserves those behaviors.

The minimal backend changes add complete-pair request validation and private response headers. Range and address-field validation already existed. Both-null manual addresses remain supported. No migration was added, changed or applied.

`restaurants` already has nullable latitude and longitude fields and an immutable identifier. `PublicMenuResponse` exposes restaurant ID, name, slug, description, phone, text address, logo, currency and categories; it does **not** expose restaurant coordinates. Initial map coordinates therefore come from explicit reviewed build configuration rather than an assumed API field.

## Supported native integration and Google Maps setup

The installed Expo version inspected before implementation is `58.0.21` (SDK 58), with React Native `0.88.0`. Its local `bundledNativeModules.json` recommends `react-native-maps` `1.29.11`, `expo-location` `~58.0.20`, Expo Router `~58.0.28` and `expo-notifications` `~58.1.7`. Use SDK-compatible dependencies selected through Expo tooling. The map uses `PROVIDER_GOOGLE`; the supported config plugin receives `androidGoogleMapsApiKey`. Native configuration changes require a rebuilt Android binary. See the [Expo map integration guide](https://docs.expo.dev/versions/latest/sdk/map-view/).

Before a live map check:

1. Create or select the restaurant's Google Cloud project, link billing and enable **Maps SDK for Android**. M11 uses native map tiles and markers; it does not call Places, Routes, Directions or the Geocoding web API. Do not enable additional paid APIs merely to select a pin. See [Google's Android SDK setup](https://developers.google.com/maps/documentation/android-sdk/get-api-key).
2. Create separate development and production Android SDK keys. Under **Application restrictions**, select **Android apps** and register the exact resolved customer package name plus the signing certificate **SHA-1** for each authorized installed build. Under **API restrictions**, restrict the key to **Maps SDK for Android**. Repeat for each independently branded restaurant package; never use an unrestricted shared key. See [Google's API security guidance](https://developers.google.com/maps/api-security-best-practices).
3. Obtain the local debug certificate fingerprint for local development, and the actual EAS signing fingerprint for EAS-installed APKs. For Google Play-installed releases, use the **Play app signing key** SHA-1 shown under Play Console app integrity. An upload-key fingerprint can differ from the certificate on the installed Play app. Register the correct package/fingerprint pairs; never invent certificate values. See [Expo Android app credentials](https://docs.expo.dev/app-signing/app-credentials/).
4. Set `CUSTOMER_GOOGLE_MAPS_ANDROID_API_KEY` in the selected build environment. Optional `CUSTOMER_MAP_INITIAL_LATITUDE` and `CUSTOMER_MAP_INITIAL_LONGITUDE` should identify the reviewed restaurant service area. Keep the customer package ID, key restrictions and certificate aligned across development and production. Rebuild after changing a native key or package.
5. Check Cloud usage, quotas, budgets and current SKU pricing before enabling live access. Billing must be enabled. Costs depend on applicable Maps features/SKUs and usage; additional APIs can incur separate charges. Budget alerts do not themselves stop charges. Review [Maps SDK usage and billing](https://developers.google.com/maps/documentation/android-sdk/usage-and-billing) and the linked current pricing rather than assuming historic credits or a permanently free project.

The native Android Maps SDK key is visible in the installed binary and must be constrained by package, certificate and API restrictions. It is not a backend service-account credential. Never put Google service-account JSON, a Supabase service-role key, database credentials or server Firebase credentials into mobile environment variables, app metadata or source control.

Missing or malformed map configuration disables map/GPS actions with a clear manual-entry fallback. A syntactically plausible key is not evidence that billing, API enablement or restrictions are correct. Native Maps authorization failures may present a blank map; loading guidance and the return-to-manual action remain available. No placeholder view is represented as successful Google Maps rendering.

## Verification results

| Check | Result |
| --- | --- |
| Backend full Maven `verify` | **Passed:** 349 discovered, 329 executed, zero failures/errors, 20 skipped. Includes 14 new customer-address HTTP cases. |
| Backend skipped cases | Nine Docker/Testcontainers migration/schema checks: Docker unavailable. Eleven optional local PostgreSQL accounting/procurement cases: explicit database test configuration unavailable. |
| Backend private-address scenarios | Real security filter chain, controller, JWT identity helper, request validation and address service with mocked repositories cover authentication, ordinary customers without staff roles, create/retrieve point, owned update, cross-customer list/update/delete/default isolation, forged identity fields, bounds, incomplete pairs, required fields and legacy manual addresses. |
| Shared/package build | **Passed:** root `npm run build:packages` (also rerun by root typecheck). Dependency installation and lockfile refresh completed; `npm ls --depth=0` exited 0. Map and React Native versions are pinned to the installed SDK recommendation. |
| TypeScript | **Passed:** root `npm run typecheck` across all workspaces. |
| ESLint | **Passed:** root `npm run lint` across all workspaces. |
| Customer mobile tests | **Passed:** 191 tests (183 Vitest behavior/component-boundary tests and 8 native app-configuration tests). Includes 59 address/map checks, auth/secure-storage/refresh/logout, profile validation, customer isolation, navigation/offline states and 24 device-registration lifecycle/native-adapter checks. Native components and sensor boundaries are mocked; these are not installed-device evidence. |
| Full frontend tests | **Passed:** root `npm run test`, 850 tests across all workspaces, including 75 shared API-client tests. The existing real-loopback HTTP integration required execution outside the network-restricted sandbox; the full final run exited 0. |
| Android JavaScript/Hermes export | **Passed:** `npm run build:starter -w @restaurant-platform/customer-mobile`, 1,348 modules, Android Hermes bundle and assets. An export does not produce or install a signed APK/AAB. |
| Android native development build / emulator or device | **Prebuild passed:** `expo prebuild --platform android --no-install` generated the development native project; the manifest declares foreground location and explicitly removes background/foreground-service location permissions. **APK assembly incomplete:** Gradle compiled its Expo/React plugins, then the SDK's automatic NDK download stalled at zero bytes for over seven minutes and the build was stopped. SDK 58 requires compile SDK 37, build-tools 37.0.0 and NDK 27.1.12297006; this machine had platform 36.1 and no NDK. An initial offline build also lacked a cached `foojay-resolver` artifact. No APK/AAB success is claimed. ADB found no attached device and the emulator list contained no AVD. |
| Google Maps live tiles, marker drag and actual GPS permission behavior | **Unverified:** no real map key, enabled billing or successful device run established by this work. |
| Live Supabase email/SMS and push delivery | **Unverified:** requires configured providers, accounts and an installed build. |
| `git diff --check` | **Passed:** whole-worktree check. Existing untracked Postman directories remain untouched; nothing was staged, committed or published. No migration was changed or applied. |

The backend command used cached dependencies with Maven 3.9.9 and JDK 21.0.2:

```powershell
$env:JAVA_HOME='C:\tools\jdk21'
& 'C:\Users\DELL\.m2\wrapper\dists\apache-maven-3.9.9-bin\4nf9hui3q3djbarqar9g711ggc\apache-maven-3.9.9\bin\mvn.cmd' `
  --offline --batch-mode --no-transfer-progress -f app/api/pom.xml `
  '-DargLine=-javaagent:C:\Users\DELL\.m2\repository\net\bytebuddy\byte-buddy-agent\1.18.11\byte-buddy-agent-1.18.11.jar' verify
```

The explicit Byte Buddy agent avoids Mockito self-attachment, which was denied by the local sandbox's JVM attach pipe. This is a machine-specific verification invocation; no project build configuration was changed to embed those paths.

Native assembly was attempted with JDK 21, the local Android SDK and the explicit `starter-fixture` development environment. Gradle caches and the ignored generated Android directory are local build artifacts. Complete the missing SDK components and run `npm run android -w @restaurant-platform/customer-mobile` with the reviewed restaurant environment before claiming an installed build. The native SDK dependency download is an environment verification limit, not a successful APK check.

### Required mobile and device acceptance scenarios

Automated checks use mocked native boundaries; they cannot prove native rendering, actual sensor accuracy or provider delivery. Final test counts belong in the results table above.

| Area | Acceptance scenarios |
| --- | --- |
| Auth | Email registration and login; verification-required registration; SecureStore restoration; refresh and failure recovery; logout and device cleanup; disabled and enabled verified-phone gating. |
| Tenant | Frozen customer build identity; route/form/request override rejection; foreign public-menu identity; separate Customer package; production rejects the development fixture and insecure API origins. |
| Account/profile | No staff membership prerequisite; load owned profile and saved Home; owned address update and default selection; empty/error/retry states; account separation after logout/sign-in. |
| Onboarding | Authenticated new account with no addresses receives setup; skip remains possible; return from Profile; account creation works with location disabled. |
| Map | Open without permission; move/tap/drag; visible numeric coordinates; confirm and return; new pin invalidates earlier confirmation; delayed GPS must not replace a later manual selection. |
| GPS | Foreground granted/denied; services disabled; unavailable/rejected request; timeout; inaccurate/unknown accuracy; suggestion adjustable and explicitly confirmed; no background permissions or watcher. |
| Persistence | Create Home through Spring; retrieve after sign-in/restoration; edit owned address; validate coordinate pair and bounds; handle forbidden/not-found/network/uncertain save outcomes without exposing another customer. |
| Native build | Install development APK; verify splash/brand, real Google tiles and marker movement, debug/release restrictions, permission dialogs, offline fallback, logout and restart. |
| Notifications | Disabled-provider behavior; explicit opt-in; permission denial; native token association with current customer; token rotation; owned deactivation and safe logout; real provider delivery only with configured infrastructure. |

## Remaining M12 dependencies

1. Implement cart contents, fresh menu pricing/availability, server-calculated delivery totals, order creation/history and checkout navigation. M11 does not send delivery checkout requests.
2. Require an owned, eligible, explicitly confirmed delivery address at checkout. A skipped or text-only M11 address must not become a delivery destination automatically. Validate the coordinate pair, required contact/text and same-restaurant delivery-zone eligibility on the server.
3. Establish confirmation provenance. Existing saved-address rows have no confirmation timestamp, source or revision marker; coordinate presence alone does not attest that an old point was customer-confirmed. M11 requires explicit confirmation for newly selected/adjusted points in its editor. M12 must re-confirm the destination and decide whether persisted confirmation/revision metadata is required; never infer it from GPS permission or a historic non-null column.
4. Preserve the immutable order destination snapshot. Migration `20261104100000_add_order_delivery_coordinates.sql` already adds `orders.delivery_latitude` / `delivery_longitude`; the existing checkout copies a valid owned address point. It currently still permits both-null legacy manual addresses. M12 must close that eligibility gap for its checkout while preserving old orders. Editing an address must never move an existing delivery's snapshot.
5. Confirm the recipient phone separately. The address table has no phone field; account contact text is not a verified Supabase phone identity. Use supported checkout recipient fields and any required verification policy without mutating profile data as a side effect of an address save.
6. Decide whether the product requires backend attestation of a restaurant-specific app build. Current global customer accounts and address APIs deliberately do not require restaurant membership; the embedded tenant guard alone cannot constrain arbitrary external clients.
7. Review concurrent address/default changes, stale address versions, uncertain order-create retries and server idempotency before checkout writes. Revalidate restaurant status, enabled delivery, delivery zone, minimums, stock and prices on every checkout.
8. Complete installed-device testing with real Maps/Supabase/Firebase configuration. Verify Android package and all actual signing fingerprints, native network/offline behavior, permission denial, GPS adjustment, token rotation and privacy before a release claim.
