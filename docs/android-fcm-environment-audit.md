# Restaurant A Android and FCM environment audit

## Configuration sources checked

- The repository root has a Spring Boot `.env.example`. Admin, Guest, Customer and Operations have separate `.env.example` files. The audited workspaces and repository root had no active `.env`, `.env.local` or environment-specific dotenv files. The corresponding application settings were absent from the audit shell. The legacy `apps/web/.env.local` belongs to a separate workspace.
- Admin and Guest use Next.js dotenv loading at their respective app roots. Their `next.config.ts` files validate configured production origins. Guest traces the reviewed restaurant registry and assets for server-side tenant resolution. Supply the `NEXT_PUBLIC_*` values during the web build because Next.js can inline those values. Server-only settings are read by the running app. [Next.js environment loading](https://nextjs.org/docs/app/guides/environment-variables)
- Expo CLI loads dotenv from the selected app workspace. The apps' dynamic `app.config.js` files read the process environment and use the same M13 registry. Expo embeds the static `EXPO_PUBLIC_*` values in the bundle. The standalone `mobile:build` plan command reads the calling shell's process environment. Supply the same inputs to the plan, Expo and Gradle bundle steps, and set `MOBILE_ENV` explicitly. The EAS profile supplies its corresponding `MOBILE_ENV`. [Expo environment loading](https://docs.expo.dev/guides/environment-variables/) · [M13 Android build runbook](m13-android-branding.md)
- Spring Boot reads application settings from its process environment and normal Spring configuration sources. `application.yml` defines the app's placeholders and defaults. There is no repository dotenv loader for the API. Inject values in the API process or the hosting secret store. The root example documents Spring inputs.
- Git ignores `.env`, `.env.*`, `google-services.json`, signing credentials and APK/AAB artifacts. Only the safe `.env.example` templates are tracked. Keep the Android Firebase client files in ignored storage and keep server credentials outside the repository. File and process checks recorded presence only.

**Status convention.** `Missing` means absent from this checkout's active configuration and audit shell. `Default` means source code supplies the behavior shown, without confirming any deployed configuration. A requirement is scoped to the named feature or environment. Live provider access, HTTPS certificate validity and device connectivity remain unverified.

## Web-only configuration

| Variable | Application | Requirement | Timing and exposure | Audit status |
| --- | --- | --- | --- | --- |
| `APP_STAGE` | Admin | Required for protected Admin flows. `local`, `staging` or `production`. | Build and runtime, server-only setting | Missing |
| `ADMIN_WEB_ORIGIN` | Admin | Required. Local expects `http://localhost` with the app port. Staging and production require HTTPS. | Build validation and runtime, server-only setting | Missing |
| `NEXT_PUBLIC_API_BASE_URL` | Admin | Required for the Spring platform API. | Build, client-safe origin | Missing |
| `NEXT_PUBLIC_SUPABASE_URL` | Admin | Required for sign-in. Use the approved Supabase HTTPS project origin. | Build, client-safe origin | Missing |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Admin | Required for sign-in. Use the matching `sb_publishable_` key. | Build, client-safe key | Missing |
| `GUEST_CONFIG_ENV` | Guest | Required for tenant lookup. `staging` or `production`. | Build and runtime, server-only setting | Missing |
| `GUEST_LOCAL_ROUTING` | Guest | Optional. `true` enables local path routing on loopback hosts during development. | Runtime, server-only setting | Default off |
| `GUEST_API_BASE_URL` | Guest | Preferred Spring origin. One of this and `NEXT_PUBLIC_API_BASE_URL` is required for menus and guest QR flows. | Build validation and runtime, server-only setting | Missing |
| `NEXT_PUBLIC_API_BASE_URL` | Guest | Optional compatibility fallback if `GUEST_API_BASE_URL` is unset. | Build, client-safe origin | Missing |
| `NEXT_PUBLIC_SUPABASE_URL` | Guest | Required for Guest Auth features. Public menu and QR flows use Spring. | Build, client-safe origin | Missing |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Guest | Required for Guest Auth features. Use the key for the same Supabase project. | Build, client-safe key | Missing |
| `NODE_ENV` | Guest | Framework-managed. Production disables local path routing and sets secure cookies. | Build and runtime, framework setting | Set by Next.js commands |

Use each web app's own ignored dotenv file or deployment variables when that app is needed. A reviewed restaurant record with the correct guest host is also required for Guest. None of these web variables is a mandatory APK input.

## Customer and Operations Android configuration

| Variable | Application | Requirement | Timing and exposure | Audit status |
| --- | --- | --- | --- | --- |
| `MOBILE_ENV` | Both | Required. Use `development` for this build. | Build, client-safe and embedded | Missing in shell. EAS sets this per profile. |
| `RESTAURANT_SLUG` | Both | Required. Select the reviewed Restaurant A schema-v2 record for the intended backend tenant. | Build, client-safe and embedded | Missing in shell. No reviewed Restaurant A record in the registry. |
| `EXPO_PUBLIC_SUPABASE_URL` | Both | Required for an authenticated device test. Use the approved development Supabase HTTPS project origin. | Build, client-safe and embedded | Missing |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Both | Required for an authenticated device test. Use the matching `sb_publishable_` key. | Build, client-safe and embedded | Missing |
| `PUBLIC_API_BASE_URL` | Both | Required only for a config without a versioned mobile API origin, such as `starter-fixture`. A schema-v2 config supplies `mobileProfiles.<environment>.apiBaseUrl`. | Build, client-safe and embedded when selected | Missing. Reviewed development API origin also missing. |
| `MOBILE_DEVELOPMENT_API_BASE_URL` | Both | Optional explicit override for the development API origin. Use a reachable HTTPS origin or opt in to HTTP on the exact private LAN host when the registry origin is unsuitable. | Build, client-safe and embedded when selected | Missing |
| `MOBILE_ADB_REVERSE_ENABLED` | Both | Required as `true` for FCM preflight when USB testing uses exactly `http://127.0.0.1:8080`. Establish `adb reverse tcp:8080 tcp:8080` on the authorized device. | Preflight, client-safe explicit transport selection | Opt-in, off by default |
| `PUBLIC_GUEST_BASE_URL` | Both | Optional development fallback for a registry record without a development guest URL. A schema-v2 development profile supplies its own guest origin. | Build, client-safe and embedded when selected | Missing |
| `CUSTOMER_GOOGLE_MAPS_ANDROID_API_KEY` | Customer | Optional. Required for live Maps SDK tiles and pin selection. Manual entry is supported when Maps is omitted. | Build, embedded client key. Restrict to the exact Android application ID, installed certificate SHA-1 and Maps SDK for Android. | Missing |
| `CUSTOMER_MAP_INITIAL_LATITUDE` | Customer | Optional with longitude. Sets the initial map center. | Build, client-safe and embedded | Missing |
| `CUSTOMER_MAP_INITIAL_LONGITUDE` | Customer | Optional with latitude. Sets the initial map center. | Build, client-safe and embedded | Missing |
| `CUSTOMER_PHONE_OTP_ENABLED` | Customer | Optional. Existing-account SMS sign-in also needs approved Supabase provider settings. | Build, client-safe feature flag | Default off |
| `OPERATIONS_PHONE_OTP_ENABLED` | Operations | Optional. Existing-account SMS sign-in also needs approved Supabase provider settings. | Build, client-safe feature flag | Default off |
| `CUSTOMER_NOTIFICATIONS_ENABLED` | Customer | Required as `true` for this FCM APK. | Build, client-safe feature flag | Missing. Feature off by default. |
| `CUSTOMER_GOOGLE_SERVICES_FILE` | Customer | Required for this FCM APK. Points to the Firebase Android client JSON matching Customer's resolved package. | Build, client-safe metadata and app-relative path may be embedded. | Missing |
| `OPERATIONS_NOTIFICATIONS_ENABLED` | Operations | Required as `true` for this FCM APK. | Build, client-safe feature flag | Missing. Feature off by default. |
| `OPERATIONS_GOOGLE_SERVICES_FILE` | Operations | Required for this FCM APK. Points to the Firebase Android client JSON matching Operations' resolved package. | Build, client-safe metadata and app-relative path may be embedded. | Missing |
| `MOBILE_FIREBASE_PROJECT_ID` | Both | Required for the FCM build preflight. Use the same approved Firebase project ID for both client files. | Build, client-safe project identifier | Missing |
| `MOBILE_SOURCE_REVISION` | Both | Optional for local development. EAS staging/production requires the full Git SHA via this setting or EAS metadata. | Build, client-safe provenance | Missing |
| `MOBILE_EXPECTED_FINGERPRINT` | Both | Required for EAS staging/production. Value comes from an approved M13 release plan. | Build, client-safe provenance | Missing. Local development can resolve the fingerprint. |
| `EAS_BUILD`, `EAS_BUILD_PROFILE`, `EAS_BUILD_PROJECT_ID`, `EAS_BUILD_GIT_COMMIT_HASH` | Both | EAS-provided build metadata. Cloud builds also require the matching approved EAS owner and project ID in the registry. | Build, client-safe provenance | Local build session |

Operations has no Android Maps SDK integration. A Google Maps key is only relevant to Customer map testing. For both apps, take the Project URL from the approved Supabase development project and its publishable key from Dashboard **Settings** → **API Keys**. Use the same Auth issuer in Spring for the development project. The Android config validates input shape. Project ownership, key validity and API reachability need actual developer inputs. [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)

The registry currently contains a schema-v2 example and fictional fixtures. Provisioned tests require the real development restaurant UUID, two approved application IDs, brand assets, and an API and guest origin for the selected profile. Set `RESTAURANT_SLUG` to that reviewed record's filename stem and use a slug distinct from the reserved fixtures. Use separate API origins for development and production. [Registry onboarding](../configs/restaurants/README.md)

Use one approved Firebase project. In Firebase Console, open **Project settings** → **General** → **Your apps** and register an Android app for each of the exact resolved M13 package IDs. Download each registration's `google-services.json`. Use the ignored paths `target/android-fcm/firebase/customer/google-services.json` and `target/android-fcm/firebase/operations/google-services.json`. The file variables can point to these via `../../target/android-fcm/firebase/<app>/google-services.json`, resolved relative to each Expo workspace. Set `MOBILE_FIREBASE_PROJECT_ID` from the project's General settings. APK compilation requires both Android client configurations. [Firebase Android setup](https://firebase.google.com/docs/android/setup)

## Spring Boot runtime configuration

| Variable | Requirement | Timing and exposure | Audit status |
| --- | --- | --- | --- |
| `SUPABASE_DB_URL` | Required PostgreSQL JDBC connection. Use TLS for Supabase Cloud. | Runtime, server-only connection data | Missing |
| `SUPABASE_DB_USERNAME` | Required PostgreSQL username. | Runtime, server-only connection data | Missing |
| `SUPABASE_DB_PASSWORD` | Required PostgreSQL password. | Runtime, server secret | Missing |
| `SUPABASE_AUTH_ISSUER` | Required. Development Supabase Auth issuer ending in `/auth/v1`. | Runtime, server-only setting using a public HTTPS URL | Missing |
| `SUPABASE_JWKS_URL` | Required. Matching Auth JWKS endpoint ending in `/auth/v1/.well-known/jwks.json`. | Runtime, server-only setting using a public HTTPS URL | Missing |
| `APP_SECURITY_JWT_SIGNING_ALGORITHM` | Set when the project does not use the default `ES256`. Match the asymmetric Auth signing configuration. | Runtime, server-only setting | Default `ES256` |
| `APP_SECURITY_JWT_REQUIRED_AUDIENCE` | Optional override for JWT audience. | Runtime, server-only setting | Default `authenticated` |
| `DB_POOL_MAX_SIZE` | Optional pool size. | Runtime, server-only setting | Default `5` |
| `PORT` | Optional server port. | Runtime, server-only setting | Default `8080` |
| `SERVER_ADDRESS` | Optional Spring bind address. Use loopback for USB reverse or a trusted LAN interface for Wi-Fi tests. | Runtime, server-only setting | No explicit source or shell value |
| `APP_CORS_ALLOWED_ORIGINS` | Configure exact permitted browser origins for deployed web clients that call Spring. | Runtime, server-only setting | Default local web and Expo origins |
| `APP_PUBLIC_WEB_BASE_URL` | Required deployment setting for valid owner and Common QR links. | Runtime, server-only setting using a public URL | Default `http://localhost:3000` |
| `SUPABASE_PROJECT_URL` | Required for server-side Auth Admin and Storage operations. | Runtime, server-only setting using a public HTTPS URL | Missing |
| `SUPABASE_SERVICE_ROLE_KEY` | Required for Auth Admin and Storage operations. | Runtime, server secret | Missing |
| `SUPABASE_INVITE_REDIRECT_URL` | Set the approved HTTPS invitation redirect on the deployed API and in Supabase Auth. | Runtime, server-only setting using a public URL | Default loopback invite URL |
| `SUPABASE_STORAGE_BUCKET_RESTAURANT_LOGOS` | Optional override of the restaurant logo bucket name. | Runtime, server-only setting | Default `restaurant-logos` via fallback |
| `SUPABASE_STORAGE_BUCKET` | Optional legacy logo bucket fallback. | Runtime, server-only setting | Default `restaurant-logos` |
| `SUPABASE_STORAGE_BUCKET_MENU_IMAGES` | Optional override of the public menu image bucket name. | Runtime, server-only setting | Default `menu-images` |
| `SUPABASE_STORAGE_BUCKET_CUSTOMER_AVATARS` | Optional override of the private avatar bucket name. | Runtime, server-only setting | Default `customer-avatars` |
| `PLATFORM_ADMIN_USER_IDS` | Required for the platform provisioning workflow. Comma-separated approved Supabase Auth user IDs. | Runtime, server-only access-control setting | Default empty |
| `APP_IDEMPOTENCY_ENCRYPTION_KEY` | Required for keyed guest QR checkout. Base64-encoded 32 random bytes. | Runtime, server secret | Missing |
| `APP_PUSH_FIREBASE_ENABLED` | Required as `true` for backend FCM delivery. | Runtime, server-only setting | Default `false` |
| `APP_PUSH_FIREBASE_SERVICE_ACCOUNT_JSON` | Server credential for the approved Firebase project. Required for backend FCM delivery when no ADC is configured. | Runtime, server secret | Missing |
| `GOOGLE_APPLICATION_CREDENTIALS` | Optional ADC file path when using a local ADC credential file. The backend can also use managed ADC. | Runtime, server-only path. File content is secret. | Missing in shell. Managed ADC unverified. |
| `APP_PUSH_OUTBOX_POLL_INTERVAL_MS` | Optional poll interval. | Runtime, server-only setting | Default `5000` |
| `APP_PUSH_OUTBOX_BATCH_SIZE` | Optional batch size. | Runtime, server-only setting | Default `20` |
| `APP_PUSH_OUTBOX_MAX_ATTEMPTS` | Optional maximum delivery attempts. | Runtime, server-only setting | Default `8` |
| `APP_PUSH_OUTBOX_MAX_RETRY_DELAY_SECONDS` | Optional maximum retry delay. | Runtime, server-only setting | Default `3600` |

Backend FCM credentials gate delivery tests and remain entirely in the Spring runtime. The client builds need their own valid Firebase Android files. Preserve the existing Supabase JWT validation through JWKS. The API consumes a public JWKS, with no JWT signing secret required by the Android apps or the API. [Server FCM setup](api.md#firebase-cloud-messaging-setup)

## HTTPS and device reachability

- Production deployments require HTTPS for Admin, Guest, Spring, Supabase and Firebase. Build and start Admin with `APP_STAGE=production` and Guest with `GUEST_CONFIG_ENV=production`. Next rejects configured non-HTTPS origins in those modes. Give Spring's public origin a certificate trusted by the phone and browsers, using the production HTTPS ingress or Spring TLS configuration. Verify the live deployment through `/actuator/health` with certificate validation enabled. The source has development HTTP defaults and supplies no production TLS certificate or verified deployment settings.
- Use the official Supabase HTTPS project endpoint and Google's Firebase SDK endpoints. Configure any production links and browser CORS origins explicitly. Keep production secrets and dev-local server settings out of client builds and production deployments. [Production URL migration plan](production-url-migration.md)
- From the test phone, open `<development API origin>/actuator/health` before installing. On the phone, `localhost` addresses the phone itself unless a USB debugging session explicitly reverses the port. `10.0.2.2` addresses the host from an Android emulator. The FCM build preflight accepts a LAN or reachable HTTPS address, or explicitly opted-in `http://127.0.0.1:8080` USB testing with `MOBILE_ADB_REVERSE_ENABLED=true`. Establish the reverse mapping on the authorized device before testing. For direct LAN access, bind Spring to the chosen LAN interface and restrict any Windows Firewall rule to the trusted device or local subnet on the Private profile. Use the same Wi-Fi network and keep the backend off public ingress. The exact mobile origin and test-device reachability are pending.
