# Operations Android

One Expo/React Native/TypeScript source generates independently branded Android applications for OWNER, MANAGER, STAFF and DELIVERY_DRIVER. The build embeds one restaurant UUID, branding, API origin and environment. There is no restaurant picker or route-based tenant override. Customer Android remains a separate app.

## Structure and boundaries

| Location | Responsibility |
| --- | --- |
| `app/` | Expo Router entry, protected workspace, direct-route guards and error fallback |
| `src/auth/` | Supabase adapter, encrypted native persistence, refresh, membership state machine, optional OTP extension |
| `src/config/`, `src/tenant.ts` | Checked public configuration from Expo metadata |
| `src/navigation/` | Shared role/permission manifest and direct-route policy |
| `src/components/` | Forms, actions, cards, tables, confirmation dialogs, loading/offline/error states, count chart |
| `src/hooks/` | Abortable queries, session-aware mutations and duplicate-tap prevention; no persisted business-data cache |
| `src/features/operations/` | Live dashboard, orders/status/payments, queue, scoped notifications and delivery management |
| `src/features/menu/` | Category/product/variant/modifier CRUD, stock/availability, authenticated image uploads |
| `src/features/management/` | Restaurant profile/settings/logo, Owner team administration, tables and ephemeral QR display/share/export |
| `src/features/profile/` | Verified membership profile, refresh access, logout |
| `src/features/accounting/` | Shared financial views, sales and purchase history, shopping, suppliers and payables, expenses, cash closing, audit and CSV sharing |
| `src/api.ts`, shared `packages/api-client` | Typed Spring REST calls locked to the embedded restaurant |

Owners and Managers share the Operations dashboard, Orders, Menu, Shopping, Sales History, Accounting, Reports, Restaurant settings, Tables & QR, Pickup queue and Deliveries. Owners also manage Team and the restaurant logo. Staff have operational Orders, read-only Menu, Pickup queue and assigned Deliveries. Drivers use assigned Deliveries. All roles have scoped Updates and Profile.

Reports contains Financial Overview, Sales Reports, Financial Summary and Export Reports. Sales History opens individual orders with recorded line prices, timestamps, status events, payments, refunds and reversals. Shopping contains the catalog and purchase plans, confirmed purchase history and details, suppliers and payables. Accounting contains the expense register and correction forms, cashbook, daily closing and audit history. Search, sorting and pagination operate on server-filtered history. Spring checks the current user, restaurant and explicit finance permissions on each read and write. See [accounting contracts](../../docs/accounting.md) and [M8-A acceptance](../../docs/m8-a-acceptance.md).

Owners and Managers can manually assign deliveries to eligible restaurant members in any role, including themselves. Default-driver selection is limited to eligible Drivers. Staff and Drivers see their own assigned deliveries. Owner, Manager and Staff can create dine-in and takeaway counter orders using the published menu and the restaurant's current order and table options. Counter cash collection and COD completion each require explicit confirmation. Catalog removal uses the existing deactivation and availability controls. Team invitations use the server's verified Auth identity flow. See [M9 acceptance](../../docs/m9-acceptance.md).

Staging and production QR URLs use the first registered guest domain for the selected environment. A reviewed development build uses its configured guest origin. The legacy starter can supply it through `PUBLIC_GUEST_BASE_URL`. Without a guest origin, one-time QR creation/rotation is disabled to avoid losing returned credentials. Verify the guest domain serves this same restaurant before sharing codes. QR URLs preserve existing guest routes and keep the credential in the fragment. Existing QR secrets cannot be retrieved; only create/rotate returns them. Rotation invalidates old printed codes. In-memory QR values clear on blur/background, and delayed callbacks cannot restore or share them after leaving the screen. Deliberate PNG exports use timestamp filenames in app-private cache: failed exports are deleted immediately; successful sharing schedules best-effort deletion after five minutes so the recipient has time to copy the image. Each Tables & QR screen mount also purges this feature's exported PNGs older than five minutes. If Android suspends or kills the process, timer cleanup may be delayed until the next screen mount or OS cache cleanup. Sharing intentionally hands the QR credential to the chosen recipient/application. Native picker/QR sharing require a rebuilt Android development client with the added native dependencies.

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

Select a reviewed schema v2 restaurant with `RESTAURANT_SLUG` and `MOBILE_ENV`. The registry owns the API and guest origins, package IDs, names, icons, and splash images. Use the [M13 Android build runbook](../../docs/m13-android-branding.md) for release profiles, Android App Links, and artifact verification. Rebuild an older development client before using the M13 Metro bundle so the app can verify the installed package ID.

## Authentication and authorization

The SDK persists its session only in Android SecureStore, scoped by product, environment, restaurant and Supabase project origin. Android backup exclusions are configured. The SDK process lock serializes authentication; foreground refresh pauses in the background; same-UUID refresh is enforced. Passwords/tokens never enter router parameters or UI membership snapshots.

Before mounting any operation, the provider calls `GET /api/v1/restaurants/{restaurantId}/membership` for the embedded restaurant, checks active restaurant state and recognizes the four supported roles. Membership is not stored on disk. Background/offline events discard workspace access; foreground/reconnection rechecks the server. Logout removes workspace state; requests are aborted and late results discarded. A record-specific 403 stays denied rather than repeatedly rechecking membership; a business request 401 signs out. Spring validates each JWT, current membership, tenant and record permission independently of the frontend manifest. The membership response currently returns a role, not effective permissions; the manifest mirrors the audited Java enum and must be reviewed when backend grants change.

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
