# M13 restaurant-branded Android builds

Operations and Customer share their respective source trees across restaurants. Each installed variant carries one restaurant UUID, one Spring API origin, an Android application ID, and public branding. Spring independently checks the JWT, staff membership and role, and the tenant or owner of the requested record. The UUID, scheme, and App Link are public routing inputs.

## Prepare a new restaurant

1. Provision the restaurant through the platform-admin workflow. Record the resulting restaurant UUID and slug and confirm the owner can sign in. The Android build handoff uses that exact UUID. Admin configuration is metadata for review. A release owner copies the approved values into the source registry.
2. Copy [the schema v2 template](../configs/restaurants/restaurant.example.json) to `configs/restaurants/<slug>.json`. Set the restaurant name, reviewed colors and logo, the API origin for each profile, and the canonical guest hosts for staging and production. Confirm the API environments recognize the provisioned UUID and the guest hosts serve that same restaurant. Keep Operations and Customer names, icons, and splash assets in the config and asset tree. Assign separate package IDs for both apps in all three profiles.
3. Review the package IDs against the registry and any previously shipped package. Run `npm run --silent mobile:build -- validate` and review each resolved release. Commit the reviewed JSON and PNGs with the source. Release separately for each app and profile. The Operations API must already serve `GET /api/v1/restaurants/{restaurantId}/membership` before installing the new Operations build.
4. For EAS, use one approved Expo project per restaurant and app. Add its public `owner` and `projectId` under `android.operations.eas` or `android.customer.eas`. The Expo slug is `<restaurant-slug>-<app>`. Configure `RESTAURANT_SLUG` and the matching public Supabase Auth URL and publishable key in that project's EAS environments. Configure optional Maps, Firebase Android client, and phone flags per app and profile where applicable. Use the same public inputs for preflight and the build worker. See [EAS environment variables](https://docs.expo.dev/eas/environment-variables/usage/).

## Profiles and local validation

| Profile | EAS environment | Artifact | Routing |
| --- | --- | --- | --- |
| `development` | `development` | Development-client APK | Environment-specific custom scheme |
| `staging` | `preview` | Internally signed APK | Staging scheme and canonical HTTPS App Links |
| `production` | `production` | Signed AAB | Production scheme and canonical HTTPS App Links |

Run these commands from the repository root to validate the two fictional restaurants. The matrix covers two apps and all three profiles. Omit `--fixture` when selecting a reviewed restaurant.

```powershell
npm ci
npm run build:packages
npm run --silent mobile:build -- validate
npm run --silent mobile:build -- resolve restaurant-a operations staging --fixture
npm run --silent mobile:build -- resolve restaurant-a customer staging --fixture
npm run --silent mobile:build -- resolve restaurant-b operations staging --fixture
npm run --silent mobile:build -- resolve restaurant-b customer staging --fixture
```

For local Expo validation or a development APK, choose a development fixture or a reviewed restaurant. Select the same slug and profile when starting Metro for that development client. If changing variants in a checkout, regenerate the Android directory from the config. `prebuild --clean` replaces generated native files, so use it in a clean checkout with no native edits to preserve.

```powershell
$env:RESTAURANT_SLUG = 'restaurant-a'
$env:MOBILE_ENV = 'development'
npm exec -w @restaurant-platform/operations-mobile -- expo config --type introspect
npm exec -w @restaurant-platform/operations-mobile -- expo prebuild --platform android --clean --no-install
npm run android -w @restaurant-platform/operations-mobile
```

Substitute `@restaurant-platform/customer-mobile` and then `restaurant-b` to check the other variants. A local native build needs Android Studio or the matching JDK, SDK and NDK, plus an emulator or device. The SDK 58 native template in this repository uses Gradle 9.4.1, Android compile SDK 37, build-tools 37.0.0 and NDK 27.1.12297006. Use JDK 21 for that local Gradle setup. Set `ANDROID_HOME` and `JAVA_HOME` accordingly. For EAS local builds use a supported macOS or Linux host. [Expo local builds](https://docs.expo.dev/build-reference/local-builds/)

## Build and verify a signed release

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

Set `MOBILE_EXPECTED_FINGERPRINT` in the matching **project-scoped** EAS environment to the release plan's `fingerprint` before starting staging or production. Keep one approved plan per project/profile build in progress and wait for the worker to pick up its inputs before changing them. EAS supplies its Git commit and project ID to the worker. The app config rejects a mismatch. The fingerprint covers the selected restaurant and profile, Git revision, public Auth and feature inputs, package/version, routes, brand assets, and npm lockfile. Identical reviewed inputs reproduce the same release plan and fingerprint. Keep the Git SHA, toolchain and credential identity with the release record. Signing tools and archive timestamps can affect binary bytes.

```powershell
Push-Location apps/operations-mobile
npx eas-cli@27.5.0 build --platform android --profile staging --non-interactive
Pop-Location
```

Use the `apps/customer-mobile` directory for Customer and select the corresponding saved plan. For production select the production profile and record an AAB plan. After downloading the built artifact, use Android SDK `aapt2` on PATH or set `AAPT2` to its path for APKs. For AABs set `BUNDLETOOL_JAR` to a standalone bundletool JAR and configure Java. Install Python 3 for reading the packaged Expo config. Set `PYTHON` if its executable is unavailable as `python` on Windows or `python3` on macOS/Linux. The verifier checks the package, version, label, build fingerprint, native link filters, and embedded restaurant/API routing against the original release plan.

```powershell
npm run --silent mobile:build -- verify target/mobile-release/operations-staging.json <downloaded-apk>
```

## Signing and Android App Links

The staging and production EAS profiles use local credentials supplied by the authorized release owner. Keep the keystore, alias, passwords, and recovery material in an access-controlled secret store with audited access. Materialize an ignored `credentials.json` in the selected app workspace only for the build and remove local copies after use. Choose the existing key for that application ID. Record the public certificate fingerprints and backup/rotation ownership per application ID. For a Play-signed installation use the Play app-signing certificate for App Links. The upload certificate may differ. Development can use debug signing. [EAS local credentials](https://docs.expo.dev/app-signing/local-credentials/)

The first configured HTTPS guest host for staging or production is the canonical App Link host. Operations handles `/app/operations/<route>` and Customer handles `/app/customer/<route>`. Custom schemes are `rp-<slug>-<app>://<route>` in production and append `-staging` or `-development` to the scheme in those profiles. For example, Customer links can open `menu` or `product/<UUID>` and Operations links can open `orders` or `deliveries`. The router accepts only this build's scheme or canonical host and supported paths. It discards query strings and fragments from incoming links and applies normal sign-in and permission gates.

Generate one Digital Asset Links statement per app using the SHA-256 certificate fingerprint that signs the installed APK. Merge both apps' statements into one JSON array for the selected host. Have the domain owner serve it at `https://<canonical-host>/.well-known/assetlinks.json` as `application/json`, with a direct HTTPS 200 response. Configure browser fallback for the published `/app/` URLs at the host if needed. Guest web currently provides its ordinary public menu routes.

```powershell
npm run --silent mobile:build -- assetlinks target/mobile-release/operations-staging.json <certificate-SHA-256>
adb shell pm verify-app-links --re-verify <package>
adb shell pm get-app-links <package>
adb shell am start -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d "https://<canonical-host>/app/operations/orders"
```

Check both apps side by side for each restaurant using the intended signing certificates. Confirm the launcher name/icon and splash, a verified HTTPS link and custom-scheme link, sign-in and reopening a link while signed out, and isolation when the same account is authorized in both restaurants. Verify that an A build cannot open a B route or fetch a B order or notification via an A path. A B-only staff member must be denied in A. Customer account settings and saved addresses belong to the signed-in account, while orders and notifications are scoped to the build's restaurant. [Expo Android App Links](https://docs.expo.dev/linking/android-app-links/)
