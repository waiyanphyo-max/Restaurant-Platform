# Customer Android foundation (M11)

Separate Expo SDK 58 / React Native / TypeScript / Expo Router app for one restaurant's customers. The build selects the restaurant, package ID, branding and splash color. Home and Menu use that restaurant's real public API. Cart and Orders provide navigation foundations for M12; M11 does not create orders or process payments. Customer accounts need no staff role or restaurant membership.

## Local development

From the repository root, install dependencies with `npm ci`, then run `npm run build:packages`. Copy this app's `.env.example` to an ignored `.env` file in this directory and set the public Supabase URL/publishable key and API origin. For a local emulator, the host API is `http://10.0.2.2:8080`; physical devices require a reachable HTTPS API. The registry's `starter-fixture` is only for development/export and has no live restaurant data.

Real builds select `RESTAURANT_SLUG=<reviewed-slug>` from [the restaurant registry](../../configs/restaurants/README.md), `MOBILE_ENV=development|staging|production`, and `PUBLIC_API_BASE_URL`. Each restaurant and product has distinct Android package IDs. Production requires real reviewed restaurant metadata and local PNG icons; splash uses the customer icon and brand color. Configure environment values independently for each restaurant/build profile in `eas.json`; never assume EAS injects a restaurant or API origin automatically.

```powershell
npm run typecheck -w @restaurant-platform/customer-mobile
npm run lint -w @restaurant-platform/customer-mobile
npm run test -w @restaurant-platform/customer-mobile
npm run build:starter -w @restaurant-platform/customer-mobile
npm run android -w @restaurant-platform/customer-mobile
```

The starter export uses an explicit development fixture and produces an Android Hermes JavaScript bundle. `android` generates and builds a development client with the installed Android SDK/JDK and an emulator or device. `npm run start:customer` starts Metro for that client. Maps, notification and package configuration changes require a rebuilt native binary; Expo Go is not this app's acceptance target. EAS development produces an internal APK, staging an internal APK, and production an AAB. Build/publish services and Play upload are manual release steps outside M11.

The inspected SDK 58 native template resolves Gradle 9.4.1, Android compile SDK 37, target SDK 36, build-tools 37.0.0 and NDK 27.1.12297006 (minimum Android API 24). Local native assembly needs those SDK components and JDK 21; a machine with only Android 36.1 installed cannot validate this build without obtaining the missing components. Keep the restaurant/API environment values set during both prebuild and Gradle assembly. Do not lower native dependency versions merely to match an older local SDK.

## Google Maps configuration

Enable **Maps SDK for Android** in Google Cloud and link billing. Set `CUSTOMER_GOOGLE_MAPS_ANDROID_API_KEY` in the appropriate restaurant/build environment. This app uses the SDK's native map, tappable pin and draggable marker via `react-native-maps` `1.29.11`, selected from the installed SDK 58 compatibility metadata. It does not need Places, Routes, Geocoding web services, or Google service-account credentials. See [Expo's map integration](https://docs.expo.dev/versions/latest/sdk/map-view/) and [Google's setup guide](https://developers.google.com/maps/documentation/android-sdk/get-api-key).

Apply **Android apps** application restrictions using the exact resolved package name and installed signing certificate **SHA-1**. Use the local debug certificate for local builds, actual EAS signing certificate for EAS APKs, and **Play app signing** certificate for Play-installed production releases; the upload certificate may differ. Development package IDs include `.dev` after the staging ID. Restrict allowed APIs to **Maps SDK for Android**. Use separate restricted development and production keys and repeat configuration for each branded restaurant package. Never commit an unrestricted key. Review [Google's key security guidance](https://developers.google.com/maps/api-security-best-practices).

The Android SDK key is public in the native binary; package/certificate/API restrictions are essential. Billing must be configured, and costs depend on current SKUs, services and usage. Check [current Maps usage/billing](https://developers.google.com/maps/documentation/android-sdk/usage-and-billing), quotas and budget alerts; additional APIs can have separate charges. Budget alerts do not cap spending.

Optionally set `CUSTOMER_MAP_INITIAL_LATITUDE` and `CUSTOMER_MAP_INITIAL_LONGITUDE` to a reviewed restaurant service-area center. Restaurant coordinates exist in PostgreSQL but are not exposed by the public menu API. Without an embedded center or saved point, the map starts at an explicitly labeled approximate Yangon region. This does not select or save a destination.

Missing/malformed keys show a manual-address fallback. A plausible key cannot establish valid billing or certificate restrictions; blank maps show return-to-manual guidance. Live rendering remains unverified until real credentials and an installed device build pass the acceptance matrix.

## Authentication, addresses and privacy

Email registration supports projects requiring email verification: the customer verifies email through the project's existing approved confirmation flow, then signs into this app. After authentication, accounts without saved addresses immediately receive optional Home Address setup. They can choose a map without GPS permission, request one foreground GPS position, enter address details manually, confirm and save, or skip until later. GPS is a suggestion; a new/adjusted point requires explicit map confirmation before saving. No background permission, continuous tracking or direct database write is used.

Spring reads/writes existing `customer_addresses` through bearer-authenticated `/api/v1/customer/addresses`. Profile phone edits are separate, explicit account actions; no per-address phone column exists. Building/floor/room uses `houseNo`; landmark/instructions use `deliveryNote`. Manual addresses may omit both coordinates. Default selection and owned updates use existing endpoints. The API verifies JWT ownership and validates fields and both coordinate axes. Address responses use `no-store`, and precise locations remain in screen memory until explicitly saved to Spring.

Supabase sessions use Android SecureStore, segregated by restaurant/product/environment/Auth project, preserving M2 storage compatibility. Foreground refresh pauses in the background. A durable logout barrier prevents failed deletion from restoring an old account. Service-role keys, database credentials and server Firebase/Google credentials must never enter the mobile app.

`CUSTOMER_PHONE_OTP_ENABLED=false` by default. Existing-account SMS login requires this flag **and** live Supabase Auth settings reporting a phone provider with auto-confirm disabled. Request uses `shouldCreateUser:false`; verification checks trusted Auth user data and a matching confirmed phone before publishing a session. This does not link/merge phone and email identities or alter staff membership. Complete provider, expiry, rate-limit and abuse testing before enabling a production build; profile phone remains unverified contact text. See [Supabase phone authentication](https://supabase.com/docs/guides/auth/phone-login).

The immutable embedded restaurant constrains this app's routes/API factories. Spring authorization remains authoritative. It does not authenticate an arbitrary modified binary or external HTTP request as a particular branded app; stronger attestation/per-build credentials would require a separate backend design.

## Notification foundation

Leave `CUSTOMER_NOTIFICATIONS_ENABLED=false` unless client and server Firebase configuration is ready. Supply `CUSTOMER_GOOGLE_SERVICES_FILE` as the local path to that restaurant package's Android `google-services.json` client configuration and rebuild. Configuration rejects service-account JSON, missing project metadata and a mismatched Android package. Server FCM credentials remain server-only, with existing `APP_PUSH_FIREBASE_ENABLED`/outbox configuration. The mobile Firebase project must match the backend provider.

Permission is requested only through Profile's opt-in action. Registration uses a native FCM token with the existing JWT-owned `/api/v1/devices` API, not an Expo push token. Restoration never prompts; token updates and logout cleanup preserve account association. Pending cleanup metadata contains only owner/device IDs and is retried under the same authorized account. Offline/provider failures do not establish notification delivery. See [the acceptance record](../../docs/m11-acceptance.md) for remaining device/provider checks and M12 address eligibility/snapshot dependencies.
