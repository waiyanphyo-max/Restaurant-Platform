# Operations Android foundation (M7)

One Expo/React Native/TypeScript source generates independently branded Android applications for OWNER, MANAGER, STAFF and DELIVERY_DRIVER. The build embeds one restaurant UUID, branding, API origin and environment. There is no restaurant picker or route-based tenant override. Customer Android remains a separate app.

## Structure and boundaries

| Location | Responsibility |
| --- | --- |
| `app/` | Expo Router entry, protected workspace, direct-route guards and error fallback |
| `src/auth/` | Supabase adapter, encrypted native persistence, refresh, membership state machine, optional OTP extension |
| `src/config/`, `src/tenant.ts` | Checked public configuration from Expo metadata |
| `src/navigation/` | Shared role/permission manifest and direct-route policy |
| `src/components/` | Forms, actions, cards, tables, confirmation dialogs, loading/offline/error states, count chart |
| `src/hooks/` | Abortable screen queries; no persisted business-data cache |
| `src/features/operations/` | Read-only orders, historical detail, private menu, daily report, deliveries, team and settings |
| `src/features/profile/` | Verified membership profile, refresh access, logout |
| `src/features/accounting/` | Nine M8 boundaries and **proposed-only** DTOs; no working accounting endpoints |
| `src/api.ts`, shared `packages/api-client` | Typed Spring REST calls locked to the embedded restaurant |

Owner navigation prepares Dashboard, Orders, Menu, Shopping, Sales History, Accounting, Reports, Team and Settings. Manager prepares Dashboard, Orders, Menu, Shopping, Sales History, Accounting, Reports and Deliveries. Shopping and Accounting remain absent from runnable navigation until backend contracts exist. Both use the same feature modules. Staff has Dashboard/Orders/Menu and assigned deliveries; Driver has Dashboard and assigned deliveries. All roles have Profile. Financial report/payment-history screens are narrowed to Owner/Manager; Staff order prices remain operational data authorized by `ORDER_READ`.

Sales History currently shows paginated operational orders, snapshot product/variant/modifier prices and quantities, discounts, channel, exact timestamps, creator UUID, status history and separate payment records. Search, server date filters, dated refunds and accounting recognition require M8. The daily report distinguishes orders created from payments collected and makes no revenue or profit claim. No missing accounting result is presented as zero. See [the detailed accounting audit](../../docs/accounting-api-gap-report.md) and [acceptance evidence](../../docs/m7-acceptance.md).

## Local development

From the repository root:

```powershell
npm ci
npm run build:packages
Copy-Item apps/operations-mobile/.env.example apps/operations-mobile/.env
```

Set the ignored local `.env` public Supabase URL and `sb_publishable_` key to the development project. The example uses the explicit development fixture and `http://10.0.2.2:8080` for an Android emulator accessing Spring on the host. The fixture represents no real restaurant or backend membership. For real authenticated testing, select a reviewed restaurant config whose UUID exists on the chosen backend, and use an invited account from that Supabase project.

```powershell
npm run android -w @restaurant-platform/operations-mobile
npm run start:operations
```

`android` requires a local JDK/Android SDK and generates the native project using Expo prebuild. `start:operations` starts Metro for a development client. `build:starter` exports Android JavaScript with the fixture; it does **not** build an APK or exercise a live sign-in. Do not release its output.

## Branded builds and environments

Use [the restaurant registry runbook](../../configs/restaurants/README.md) to add a reviewed `<restaurant-slug>.json` with the backend UUID, separate Operations/Customer application IDs, public brand/logo and approved PNG icons. No real restaurant config is fabricated in M7.

| Profile (`eas.json`) | Mobile environment | EAS environment | Output |
| --- | --- | --- | --- |
| development | development | development | Internal development-client APK |
| staging | staging | preview | Internal APK |
| production | production | production | Android App Bundle |

Set `RESTAURANT_SLUG`, `PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` separately for each build environment and restaurant. `MOBILE_ENV` is set by the profile. Outside development, API/Auth origins require HTTPS; Android cleartext traffic is disabled. Development/staging/production application IDs and encrypted session namespaces differ. The fixture cannot resolve in staging/production. A locally selected real config may be used in development with its `.dev` application ID.

When authorized for a later release, configure the restaurant's EAS project/credentials, select its public variables and invoke `eas build --platform android --profile development|staging|production` from this workspace. M7 supplies the configuration only; it does not create an EAS project, upload code or build/deploy a release. Expo `extra` and `EXPO_PUBLIC_*` are public client metadata. Never place service-role keys, database credentials, signing secrets or private backend configuration there. Production must select its own Supabase/backend projects and approved brand assets.

## Authentication and authorization

The SDK persists its session only in Android SecureStore, scoped by product, environment, restaurant and Supabase project origin. Android backup exclusions are configured. The SDK process lock serializes authentication; foreground refresh pauses in the background; same-UUID refresh is enforced. Passwords/tokens never enter router parameters or UI membership snapshots.

Before mounting any operation, the provider calls the real `GET /api/v1/my/restaurants`, matches the configured restaurant, checks active restaurant state and recognizes only the four supported roles. Membership is not stored on disk. Background/offline events discard workspace access; foreground/reconnection rechecks the server. Logout removes workspace state; requests are aborted and late results discarded. A record-specific 403 stays denied rather than repeatedly rechecking membership; a business request 401 signs out. Spring validates each JWT, current membership, tenant and record permission independently of the frontend manifest. The membership response currently returns a role, not effective permissions; the manifest mirrors the audited Java enum and must be reviewed when backend grants change.

Phone OTP is disabled by default. `OPERATIONS_PHONE_OTP_ENABLED=true` records a build request only. No real Spring provider-readiness/capability/invitation contract exists, so the native availability gate remains closed even with that flag. The tested injectable extension uses real Supabase request/verify methods with `shouldCreateUser:false` and same-UUID verification, but is not a live login screen. Enabling it later requires provider verification, server capability/membership contracts, rate limits, invitation/claim handling, SDK-event suppression during identity verification and device/provider tests. A matching phone/email cannot create or transfer membership. See [phone auth design](../../docs/phone-auth-design.md).

## Verification

```powershell
npm run typecheck -w @restaurant-platform/operations-mobile
npm run lint -w @restaurant-platform/operations-mobile
npm run test -w @restaurant-platform/operations-mobile
npm run test -w @restaurant-platform/api-client
npm run build:starter -w @restaurant-platform/operations-mobile
```

The implementation follows [Expo Router setup](https://docs.expo.dev/router/installation/), [protected routes](https://docs.expo.dev/router/advanced/protected/) and [EAS profiles](https://docs.expo.dev/build/eas-json/). Native device, provider, real-tenant and production acceptance remain separate from TypeScript/unit/bundle checks.
