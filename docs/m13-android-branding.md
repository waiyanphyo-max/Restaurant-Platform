# M13 restaurant-branded Android builds

Operations and Customer share their respective source trees across restaurants. Each installed variant carries one restaurant UUID, one Spring API origin, an Android application ID, and public branding. Spring independently checks the JWT, staff membership and role, and the tenant or owner of the requested record. The UUID, scheme, and App Link are public routing inputs.

## Prepare a new restaurant

1. Provision through the trusted platform-admin workflow and record its actual restaurant UUID and slug. Confirm the deployed API environments recognize that same UUID and the Owner handoff is ready. Android preparation does not provision a tenant or grant membership. Admin deployment metadata is a review input, separate from the canonical runtime branding API.
2. Prepare a candidate from [the schema v2 template](../configs/restaurants/restaurant.example.json) **outside the active top-level registry**, for example `target/mobile-onboarding/<slug>.candidate.json`. Supply approved fallback name/palette/local logo, both native app labels, all six package IDs, local launcher/splash references, version names/codes, environment API origins, guest hosts and optional approved EAS projects. Assets must already satisfy the existing registry path/dimension/size checks. Do not assign a new ID to replace a reserved or distributed identity.
3. Generate the stdout-only proposal below. It reuses schema-v2 and cross-registry uniqueness validation; derives the six app/environment bindings, schemes and App Links; records a configuration digest and Git HEAD; and lists pending reviews. It cannot create or overwrite an active registry file, save assets, modify app source or start a build. An existing slug cannot change its UUID or package IDs. Missing independent identity history remains `PENDING_EXTERNAL_IDENTITY_REVIEW`; a proposal is never a release plan.
4. Independently review historical/reserved IDs, approved artwork/palette, exact deployed tenant UUID, host ownership/API mapping, version monotonicity, signing and provider/project metadata. Registry uniqueness alone cannot prove an ID has never shipped elsewhere. Only after explicit operator approval may a release owner save the reviewed `<slug>.json` and approved assets. Run uniqueness/config checks again, then resolve **separate Operations and Customer plans**. Saving, committing, cloud builds, credential materialization and publication are not authorized by UXI-06.
5. For EAS, use one approved Expo project per restaurant and app. Add its public `owner` and `projectId` under `android.operations.eas` or `android.customer.eas`. The Expo slug is `<restaurant-slug>-<app>`. Configure `RESTAURANT_SLUG` and the matching public Supabase Auth URL and publishable key in that project's EAS environments. Configure optional Maps, Firebase Android client, and phone flags per app and profile where applicable. Use the same public inputs for preflight and the build worker. The Operations API must serve the existing membership endpoint before installation. See [EAS environment variables](https://docs.expo.dev/eas/environment-variables/usage/).

```powershell
# Read-only validation/proposal; replace paths with existing reviewed input files.
npm run --silent mobile:build -- propose 'target/mobile-onboarding/approved-restaurant.candidate.json'
npm run --silent mobile:build -- propose 'target/mobile-onboarding/approved-restaurant.candidate.json' --identity-history 'target/mobile-onboarding/approved-restaurant.identity-history.json'
```

The external history input has `schemaVersion: 1`, nonempty `reviewedBy`, calendar `reviewedAt` (`YYYY-MM-DD`), an `evidence` reference, and `applications`. Each application row contains `applicationId`, `restaurantId`, `appKind` (`operations` or `customer`), `environment` (`development`, `staging` or `production`) and `status` (`reserved` or `distributed`). Include every proposed binding and relevant historical bindings. Conflicting/reused IDs and attempts to change an existing binding are rejected. Recorded reviewer/evidence is an attestation requiring human review, not automatic proof of complete distribution history. Keep private review material outside client metadata.

## Runtime and native authority

Spring owns the current public restaurant name, in-app logo, palette/revision and menu/prices/photos/Owner-curated Featured selection. Owner/Manager manage supported colors and catalog fields; logo upload and Featured selection retain Owner-only grants. Those changes take effect on supported refresh without a native rebuild. Operations retains its accepted UXI-03 runtime provider. Customer's UXI-06 consumer reads the canonical public branding API using only its embedded UUID and selected API origin, validates tenant/palette/revision, and applies UXI-01 semantic tokens. Launch/foreground and explicit refresh are bounded, obsolete requests are aborted/discarded across account/environment/unmount changes, and loading/offline/invalid results use only the reviewed same-tenant fallback or current validated memory. There is no persistent cross-tenant brand cache or polling loop. Customer visual redesign remains UXI-08.

The installed package ID, native label, launcher icon, splash, signing, release metadata and native links remain release-managed. Operations exposes no editor for them. A package-ID change creates another installed app identity; it is not an ordinary update. Runtime route/query/QR/auth values cannot choose another tenant or API environment. Installed startup additionally checks the actual Android package and the embedded release/tenant/environment/origin binding.

## Profiles and local validation

| Profile | EAS environment | Artifact | Routing |
| --- | --- | --- | --- |
| `development` | `development` | Development-client APK | Environment-specific custom scheme |
| `staging` | `preview` | Internally signed APK | Staging scheme and canonical HTTPS App Links |
| `production` | `production` | Signed AAB | Production scheme and canonical HTTPS App Links |

Run these commands from the repository root with the locked dependencies already installed. The loop evaluates all **12** fictional A/B × Operations/Customer × development/staging/production combinations without rewriting either source tree. Omit `--fixture` only when selecting a reviewed real registry entry. Fixture staging/production is offline inspection, never a distributable release.

```powershell
npm run build:packages
npm run test -w @restaurant-platform/restaurant-config
npm run --silent mobile:build -- validate
foreach ($restaurant in @('restaurant-a', 'restaurant-b')) {
  foreach ($app in @('operations', 'customer')) {
    foreach ($profile in @('development', 'staging', 'production')) {
      npm run --silent mobile:build -- resolve $restaurant $app $profile --fixture
      if ($LASTEXITCODE -ne 0) { throw 'Fixture resolution failed' }
    }
  }
}
```

For safe local Expo evaluation, use an isolated development-fixture PowerShell session with dotenv disabled. Notifications are disabled here **only for the labelled offline JavaScript fixture check**, which establishes no Firebase/device readiness. These settings must not be copied to staging/production to bypass a provider failure. This example changes only the current process environment and writes ignored JavaScript export output; close the session afterwards. It creates no native directory or signed APK/AAB.

```powershell
$env:EXPO_NO_DOTENV = '1'
$env:EXPO_OFFLINE = '1'
$env:EXPO_NO_TELEMETRY = '1'
$env:CI = '1'
$env:OPERATIONS_NOTIFICATIONS_ENABLED = 'false'
$env:CUSTOMER_NOTIFICATIONS_ENABLED = 'false'
$env:RESTAURANT_SLUG = 'restaurant-a'
$env:MOBILE_ENV = 'development'
npm exec -w @restaurant-platform/operations-mobile -- expo config --type public
npm exec -w @restaurant-platform/customer-mobile -- expo config --type public
# Existing starter wrapper fixes the slug/profile to the development starter fixture.
npm run build:starter -w @restaurant-platform/operations-mobile
npm run build:starter -w @restaurant-platform/customer-mobile
```

Repeat public config evaluation with `restaurant-b` as needed. Keep EAS release variables unset in a fixture-only session. `build:starter` exports to the workspace's ignored `dist-starter`; preserve any independently valuable output first. Do not run native prebuild or regenerate/delete existing native directories in the active working tree. Any future approved native generation belongs in an isolated checkout with developer changes preserved.

A later authorized native build needs Android Studio or the matching JDK, SDK and NDK, plus an emulator or device. The recorded SDK 58 template uses Gradle 9.4.1, compile SDK 37, build-tools 37.0.0 and NDK 27.1.12297006, with JDK 21 for that local setup; verify the selected release's actual toolchain. For EAS local builds use a supported host. [Expo local builds](https://docs.expo.dev/build-reference/local-builds/)

## Provider and San Thaw Tar release gates

The ordinary Operations starter export has a pre-existing local Firebase mismatch: the selected client JSON does not match `dev.restaurantplatform.starter.operations.staging.dev` under `MOBILE_FIREBASE_PROJECT_ID`. Report that failure separately from source checks. When notifications are requested, invalid/missing client or project selection fails closed. Do not edit/fabricate provider JSON, private `.env` values or secrets, or disable notifications to pass staging/production. Existing synthetic client tests are not real provider approval. Customer Maps key syntax only controls optional plugin inclusion; package/signature restrictions and installed-device provider behavior need independent review. Manual address behavior remains available without Maps.

San Thaw Tar's registry still uses primary `#234D3C`, secondary `#E8EEDB`, white background; Figma approves tenant-only primary `#A51D22` with gold/cream supporting colors. Keep the current registry until an explicit reviewed fallback-alignment proposal is approved. Its listed UUID, six historical/reserved IDs, versions, domains and future EAS/signing inputs need independent release review. Current `example.com`, `*.example.invalid` and temporary tunnel hosts are not approved release endpoints. Real EAS staging/production rejects known placeholder/reserved/tunnel endpoints; syntax-only local inspection does not establish deployed ownership or readiness.

The candidate `C:\RestaurantManagementSystem\San Thaw Tar Photos\logo\Burmese Red and Gold Food Emblem.png` is 1254×1254, opaque `Format24bppRgb`, SHA-256 `780758f968cde0a6d83ca8dc100f804efd1eb9b94f46f4a3eb27d2b413b90fd1`. It does not meet transparent-logo approval. Obtain reviewed original icon/logo/splash artwork with explicit transparency/crop/dimensions; do not remove its background automatically or use small Figma previews as native assets. The six food originals and their UXI-05 integrity records remain catalog media, with their existing publication/mapping gates. No real San Thaw Tar release is authorized or claimed ready. See the [UXI-06 evidence report](uxi-06-branded-builds.md).

## Build and verify a signed release

**Future release-owner procedure only, requiring separate explicit authorization. UXI-06 performs none of the signed/cloud/distribution operations below.** Review/save the proposal and all deployment/provider/artwork/signing gates first. Known host checks cannot verify ownership or real UUID mappings.

Choose a clean Git revision and install the locked dependencies with `npm ci`. Both workspaces use the same EAS profiles, pinned CLI, Node and Android worker image. Each app's `release.versionName` is displayed to users and its `release.versionCode` is an explicit integer. Increase the version code beyond the last distributed code for each affected package before a new release. EAS automatic version increments and OTA updates are disabled.

In a clean PowerShell session, set the same reviewed public Auth and optional provider inputs the worker will receive. Use a release plan from the intended slug, app, and profile, and keep it with the resulting artifact. These commands prepare an approved staging build.

```powershell
$env:RESTAURANT_SLUG = '<approved-slug>'
$env:MOBILE_ENV = 'staging'
$env:MOBILE_SOURCE_REVISION = (git rev-parse HEAD)
New-Item -ItemType Directory -Force target/mobile-release | Out-Null
npm run --silent mobile:build -- resolve $env:RESTAURANT_SLUG operations staging |
  Set-Content -Encoding utf8 target/mobile-release/operations-staging.json
```

Set `MOBILE_EXPECTED_FINGERPRINT` in the matching **project-scoped** EAS environment to the release plan's `fingerprint` before starting staging or production. Keep one approved plan per project/profile build in progress and wait for the worker to pick up its inputs before changing them. EAS supplies its Git commit and project ID to the worker. The app config rejects a mismatch. The fingerprint covers the selected restaurant/environment/EAS project, Git revision, lockfile, public Auth/API and feature inputs, package/version, routes, registry content, embedded logo/icon/splash hashes, Firebase client hash and Maps/plugin options. UXI-06 also hashes the shared registry/Expo/runtime/plugin implementations, each app config and EAS profile file; normalized text line endings preserve cross-platform review. Changed inputs invalidate the reviewed fingerprint. Identical reviewed inputs reproduce the plan/fingerprint, not necessarily byte-identical signed artifacts. Keep the Git SHA, toolchain and credential identity with the release record. Signing tools and archive timestamps can affect binary bytes.

```powershell
Push-Location apps/operations-mobile
npx eas-cli@27.5.0 build --platform android --profile staging --non-interactive
Pop-Location
```

Use the `apps/customer-mobile` directory for Customer and select its own saved plan/project. For production select the production profile and record an AAB plan. After a separately authorized build, use Android SDK `aapt2` on PATH or set `AAPT2` to its path for APKs. For AABs set `BUNDLETOOL_JAR` to a standalone bundletool JAR and configure Java. Install Python 3 for reading the packaged Expo config. Set `PYTHON` if its executable is unavailable as `python` on Windows or `python3` on macOS/Linux. The verifier checks package, version, label, fingerprint, native link filters, embedded restaurant/API routing and applicable native Firebase resources against the original release plan.

```powershell
npm run --silent mobile:build -- verify target/mobile-release/operations-staging.json <downloaded-apk>
```

## Signing and Android App Links

The staging and production EAS profiles use local credentials supplied by the authorized release owner. Keep the keystore, alias, passwords, and recovery material in an access-controlled secret store with audited access. Materialize an ignored `credentials.json` in the selected app workspace only for the build and remove local copies after use. Choose the existing key for that application ID. Record the public certificate fingerprints and backup/rotation ownership per application ID. For a Play-signed installation use the Play app-signing certificate for App Links. The upload certificate may differ. Development can use debug signing. [EAS local credentials](https://docs.expo.dev/app-signing/local-credentials/)

The first configured HTTPS guest host for staging or production is the canonical App Link host. Operations handles `/app/operations/<route>` and Customer handles `/app/customer/<route>`. Custom schemes are `rp-<slug>-<app>://<route>` in production and append `-staging` or `-development` to the scheme in those profiles. For example, Customer links can open `menu` or `product/<UUID>` and Operations links can open `orders` or `deliveries`. The router accepts only this build's scheme or canonical host and supported paths. It discards query strings and fragments from incoming links and applies normal sign-in and permission gates.

For a future authorized deployment, generate one Digital Asset Links statement per app using the SHA-256 certificate fingerprint that signs the installed APK. Merge both apps' statements into one JSON array for the selected host. The domain owner must separately approve serving it at `https://<canonical-host>/.well-known/assetlinks.json` as `application/json`, with a direct HTTPS 200 response. Browser fallback for published `/app/` URLs also needs review; Guest currently provides its ordinary public menu routes. Generating JSON does not verify a live association. Actual certificate/host/Digital Asset Links and installed-device verification remain deployment gates; UXI-06 changes no DNS or hosted verification file.

```powershell
npm run --silent mobile:build -- assetlinks target/mobile-release/operations-staging.json <certificate-SHA-256>
adb shell pm verify-app-links --re-verify <package>
adb shell pm get-app-links <package>
adb shell am start -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "https://<canonical-host>/app/operations/orders"
```

Check both apps side by side for each restaurant using the intended signing certificates. Confirm the launcher name/icon and splash, a verified HTTPS link and custom-scheme link, sign-in and reopening a link while signed out, and isolation when the same account is authorized in both restaurants. Verify that an A build cannot open a B route or fetch a B order or notification via an A path. A B-only staff member must be denied in A. Customer account settings and saved addresses belong to the signed-in account, while orders and notifications are scoped to the build's restaurant. [Expo Android App Links](https://docs.expo.dev/linking/android-app-links/)
