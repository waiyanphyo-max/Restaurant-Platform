# Restaurant A Android FCM build and device test

Checkpoint recorded 2026-11-10 on `rebuild/build-for-device-testing` at `3a0c009`.

## Configuration checkpoint

The checked-in M13 Restaurant A entry is a fixture. M13 resolves these development package IDs.

| App | Resolved fixture application ID | Reviewed Restaurant A application ID |
| --- | --- | --- |
| Customer | `dev.restaurantplatform.fixturea.customer.dev` | Pending registry entry |
| Operations | `dev.restaurantplatform.fixturea.operations.dev` | Pending registry entry |

The fixture uses tenant `00000000-0000-4000-8000-000000000101` and `http://10.0.2.2:8080`, which targets the development host from the Android emulator. Use the approved Restaurant A tenant UUID and a phone-reachable API origin for this build. [Environment matrix](android-fcm-environment-audit.md) · [M13 build runbook](m13-android-branding.md)

| Phase | Result at this checkpoint |
| --- | --- |
| Environment and M13 audit | Completed for the checkout. Reviewed Restaurant A configuration, development Supabase inputs and phone-reachable API origin still need to be supplied. |
| Firebase client setup | Both Android client JSONs are absent. The intended Firebase project and app registrations are unverified. |
| Mobile and Spring integration | Both apps are wired to register native Android tokens. Spring uses the existing authenticated device routes and per-device outbox. Android alerts carry generic text. The local API environment has no configured Firebase Admin credential. |
| Android toolchain | JDK 21, Gradle 9.4.1, Platform 37.0, Build-Tools 37.0.0, CMake 3.22.1 and ADB were verified. NDK 27.1.12297006 remains pending after the package download stalled. |
| Android APK build and verification | Pending for both apps. APK paths below are planned outputs. Sizes, hashes and signing evidence will be recorded after native compilation. |
| Physical device and Firebase delivery | Pending. Device installation, token issuance, API reachability and Firebase Admin delivery require the configured development environment. |

Local verification passed for 261 Customer tests, 249 Operations tests, 84 API-client tests, 42 focused Spring tests, six artifact verifier tests and all 12 M13 fixture plans. Mobile and web type checks and lint passed. The web suites passed 335 unit tests, and the Guest built-app smoke passed 118 checks. Both fixture Expo introspections and Metro/Hermes exports passed as preflight checks. ADB detected zero devices, and the Docker Desktop Linux engine was unavailable.

1. Supply the reviewed `configs/restaurants/<approved-slug>.json` and its referenced branding PNGs. Start from `configs/restaurants/restaurant.example.json`. Use the slug and UUID approved for Restaurant A in the development backend. The M13 registry reserves `restaurant-a`, `restaurant-b` and `starter-fixture` for its fixtures, so the reviewed slug must be distinct. Choose distinct approved Android IDs for the two apps and each profile, and use the reviewed API origins, guest hosts and branding. Keep the development origin separate from staging and production.
2. Resolve the two reviewed IDs from the repository root. The resolver rejects a fixture unless it is selected explicitly.

   ```powershell
   $env:RESTAURANT_SLUG = Read-Host 'Reviewed Restaurant A slug'
   npm run --silent mobile:build -- validate
   npm run --silent mobile:build -- resolve $env:RESTAURANT_SLUG customer development
   npm run --silent mobile:build -- resolve $env:RESTAURANT_SLUG operations development
   ```

3. In the intended development Firebase project, open **Project settings → General → Your apps → Add app → Android**. Register each resolved `applicationId` exactly as printed. Download `google-services.json` from each registration and keep the two downloads in separate directories. Both must come from the same project. If using existing registrations, check their package names before downloading. [Firebase Android setup](https://firebase.google.com/docs/android/setup)

   ```powershell
   New-Item -ItemType Directory -Force 'target/android-fcm/firebase/customer','target/android-fcm/firebase/operations'
   ```

4. Supply the matching development Supabase Auth URL and publishable key to the Expo build. Supply the Customer Android Maps key if the device test includes map tiles or pin selection. Restrict it to the Customer application ID and the SHA-1 of the certificate used to sign the installed APK. Operations opens Maps over HTTPS and has no native Maps key requirement. [Android Maps key restrictions](https://developers.google.com/maps/api-security-best-practices#restricting-api-keys)

## Build both APKs

Use JDK 21, the repository's Node/npm requirements and Android SDK components required by the Expo SDK 58 Gradle project. Set `JAVA_HOME` and `ANDROID_HOME` to their actual installation directories. Install Android SDK Platform 37, Build-Tools 37.0.0, Platform-Tools, NDK 27.1.12297006 and CMake 3.22.1 through Android Studio's SDK Manager. Use an isolated build checkout or back up and move aside any existing app-local `android` directories after inspecting them for local work. The commands below require those directories to be absent before generating native code. [Android 17 SDK setup](https://developer.android.com/about/versions/17/setup-sdk) · [NDK and CMake setup](https://developer.android.com/studio/projects/install-ndk)

The following command selects the same packages when Android SDK Command-Line Tools are on PATH.

```powershell
sdkmanager.bat --sdk_root=$env:ANDROID_HOME 'platforms;android-37.0' 'build-tools;37.0.0' `
  'platform-tools' 'ndk;27.1.12297006' 'cmake;3.22.1'
```

To retry just the pending NDK in this checkout, use the downloaded SDK Manager after setting `ANDROID_HOME` and `JAVA_HOME`.

```powershell
& '.\target\android-sdk-preflight\cmdline-tools\bin\sdkmanager.bat' "--sdk_root=$env:ANDROID_HOME" `
  --install 'ndk;27.1.12297006'
Test-Path (Join-Path $env:ANDROID_HOME 'ndk/27.1.12297006/source.properties')
```

Run from the repository root in a fresh PowerShell session. Save the client downloads as `target/android-fcm/firebase/customer/google-services.json` and `target/android-fcm/firebase/operations/google-services.json`. Those files are ignored. Paths passed to each Expo app are relative to that app's directory, which keeps workstation paths out of the embedded Expo config. Provide the actual project ID from **Firebase → Project settings → General** and use the same public Supabase inputs for both builds.

```powershell
$env:RESTAURANT_SLUG = Read-Host 'Reviewed Restaurant A slug'
$env:MOBILE_ENV = 'development'
$env:EXPO_NO_DOTENV = '1'
$env:EXPO_PUBLIC_SUPABASE_URL = Read-Host 'Development Supabase HTTPS project URL'
$env:EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = Read-Host 'Development Supabase publishable key'
$env:MOBILE_FIREBASE_PROJECT_ID = Read-Host 'Development Firebase project ID'
$env:CUSTOMER_NOTIFICATIONS_ENABLED = 'true'
$env:CUSTOMER_GOOGLE_SERVICES_FILE = '../../target/android-fcm/firebase/customer/google-services.json'
$env:OPERATIONS_NOTIFICATIONS_ENABLED = 'true'
$env:OPERATIONS_GOOGLE_SERVICES_FILE = '../../target/android-fcm/firebase/operations/google-services.json'
# Set this only when overriding the reviewed development API origin for the test device.
# $env:MOBILE_DEVELOPMENT_API_BASE_URL = Read-Host 'Phone-reachable development API origin'
# Optional for the Customer map tiles and pin test.
# $env:CUSTOMER_GOOGLE_MAPS_ANDROID_API_KEY = Read-Host 'Restricted Android Maps key'

$outputDirectory = (New-Item -ItemType Directory -Force 'target/android-fcm').FullName
$planJson = npm run --silent mobile:build -- preflight-fcm $env:RESTAURANT_SLUG
if ($LASTEXITCODE -ne 0) { throw 'FCM preflight failed' }
$plans = ($planJson -join "`n") | ConvertFrom-Json

npm run build:packages
if ($LASTEXITCODE -ne 0) { throw 'Workspace package build failed' }
foreach ($kind in @('customer', 'operations')) {
  if (Test-Path -LiteralPath "apps/$kind-mobile/android") {
    throw "Existing Android project in apps/$kind-mobile. Inspect and preserve it before prebuild."
  }
}

foreach ($kind in @('customer', 'operations')) {
  $plan = $plans.$kind
  $plan | ConvertTo-Json -Depth 20 | Set-Content -Encoding utf8 (Join-Path $outputDirectory "$kind-development.json")
  $env:MOBILE_EXPECTED_FINGERPRINT = $plan.fingerprint
  npm exec -w "@restaurant-platform/$kind-mobile" -- expo prebuild --platform android --no-install
  if ($LASTEXITCODE -ne 0) { throw "$kind Expo prebuild failed" }
  Push-Location "apps/$kind-mobile/android"
  try {
    .\gradlew.bat :app:assembleRelease
    if ($LASTEXITCODE -ne 0) { throw "$kind Gradle build failed" }
    Copy-Item -LiteralPath 'app/build/outputs/apk/release/app-release.apk' `
      -Destination (Join-Path $outputDirectory "restaurant-a-$kind-development.apk")
  } finally {
    Pop-Location
    Remove-Item Env:MOBILE_EXPECTED_FINGERPRINT -ErrorAction SilentlyContinue
  }
}
```

The M13 `development` profile selects the Android identity and environment. The local `assembleRelease` task packages JavaScript in the APK so it can start without Metro, using the generated development signing configuration. Keep the same development signer for updates. Use the M13 signing runbook for distributed staging and production builds.

## Verify both artifacts

Point `AAPT2` and `$apkSigner` to the installed SDK build-tools. The M13 verifier compares each APK against its own release plan, including Android identity, branding label, fingerprint, tenant/API routing and Firebase resources. It also uses Python 3 to read the packaged Expo config. Set `PYTHON` to the executable if it is absent from PATH. `apksigner` checks APK signing and prints the public certificate digests. Record the expected development signer for each app and compare those digests before installing or updating. [Android apksigner](https://developer.android.com/tools/apksigner)

```powershell
$env:AAPT2 = Join-Path $env:ANDROID_HOME 'build-tools/37.0.0/aapt2.exe'
$apkSigner = Join-Path $env:ANDROID_HOME 'build-tools/37.0.0/apksigner.bat'
foreach ($kind in @('customer', 'operations')) {
  $apk = "target/android-fcm/restaurant-a-$kind-development.apk"
  $plan = "target/android-fcm/$kind-development.json"
  Get-Item -LiteralPath $apk -ErrorAction Stop | Select-Object FullName,Length
  npm run --silent mobile:build -- verify $plan $apk
  if ($LASTEXITCODE -ne 0) { throw "$kind artifact verification failed" }
  & $apkSigner verify --verbose --print-certs $apk
  if ($LASTEXITCODE -ne 0) { throw "$kind signature verification failed" }
  Get-FileHash -Algorithm SHA256 -LiteralPath $apk
}
```

## Spring Boot FCM configuration

Use an authorized credential from the same Firebase project that issued the Android client files. The backend's dispatcher is opt-in and supports either a server-side JSON secret or Google Application Default Credentials. Keep the credential in an access-controlled secret store or protected directory outside the checkout. Run the following in the PowerShell session that starts Spring Boot, after supplying the development backend inputs in the environment matrix. [Firebase Admin setup](https://firebase.google.com/docs/admin/setup) · [API configuration](api.md#firebase-cloud-messaging-setup)

```powershell
$firebaseAdminFile = Read-Host 'Full path to the protected Firebase service-account JSON'
$env:APP_PUSH_FIREBASE_SERVICE_ACCOUNT_JSON = Get-Content -Raw -LiteralPath $firebaseAdminFile -ErrorAction Stop
$env:APP_PUSH_FIREBASE_ENABLED = 'true'
try {
  mvn -f app/api/pom.xml spring-boot:run
} finally {
  Remove-Item Env:APP_PUSH_FIREBASE_SERVICE_ACCOUNT_JSON,Env:APP_PUSH_FIREBASE_ENABLED -ErrorAction SilentlyContinue
}
```

The backend must have the repository's existing push outbox and Customer device-scope schema. Confirm the authorized development database's migration history before running the API. In-app notifications and APK compilation can be checked independently of backend FCM delivery. Use a development database and test accounts when enabling the dispatcher, since it can send previously queued notifications.

## Connect the phone to Spring Boot

For USB testing, select `http://127.0.0.1:8080` in the development registry profile or set `MOBILE_DEVELOPMENT_API_BASE_URL` to that origin. Set `MOBILE_ADB_REVERSE_ENABLED=true` for the FCM preflight. That flag explicitly authorizes only the `127.0.0.1:8080` development route. The API-origin change produces new M13 build fingerprints, so save fresh plans and use those fingerprints for both rebuilds.

~~~powershell
$env:MOBILE_ENV = 'development'
$env:MOBILE_DEVELOPMENT_API_BASE_URL = 'http://127.0.0.1:8080'
$env:MOBILE_ADB_REVERSE_ENABLED = 'true'
npm run --silent mobile:build -- preflight-fcm $env:RESTAURANT_SLUG
adb devices -l
$serial = Read-Host 'Authorized USB device serial'
adb -s $serial reverse tcp:8080 tcp:8080
adb -s $serial reverse --list
~~~

The reverse tunnel sends the phone's `127.0.0.1:8080` traffic to port 8080 on the connected PC. Spring can bind to `127.0.0.1` for this USB workflow. Recreate the reverse mapping after reconnecting the phone, and confirm the API health endpoint from the device before sign-in. Development network security permits the exact loopback host. Staging and production continue to use their HTTPS origins with cleartext denied.

`localhost` on Android is the phone. `10.0.2.2` reaches the host from the Android emulator. To test against local Spring Boot over Wi-Fi, put the phone and PC on the same trusted private network. Use the PC's LAN address from `ipconfig`. For local HTTP, select that private IPv4 address and port explicitly in `MOBILE_DEVELOPMENT_API_BASE_URL`, set `SERVER_ADDRESS` to the same interface and set `PORT` in the Spring shell. That build allows cleartext for the selected development host. For a local TLS reverse proxy, bind Spring to `127.0.0.1`, bind the proxy to the LAN interface and use the LAN-reachable HTTPS hostname with a certificate that chains to a trusted Android system root. Scope the Windows Firewall inbound TCP rule to the chosen port, Private profile and test phone address or trusted subnet. Check that Wi-Fi client isolation permits the connection. Open `<development-api-origin>/actuator/health` in the phone browser and verify `UP` before sign-in. Keep this development service on the private network.

For a direct LAN development connection, set the addresses in the Spring shell. If the firewall blocks it, create the named rule in an elevated PowerShell session using those same addresses and port. Remove the rule after the device session.

```powershell
ipconfig
$lanAddress = Read-Host 'PC private Wi-Fi IPv4 address'
$env:SERVER_ADDRESS = $lanAddress
$env:PORT = '8080'
# In the build shell, set MOBILE_DEVELOPMENT_API_BASE_URL to http://<PC-private-IPv4>:8080.

# In elevated PowerShell, set $lanAddress again to the same PC private IPv4 address.
$phoneAddress = Read-Host 'Phone private Wi-Fi IPv4 address'
New-NetFirewallRule -DisplayName 'Restaurant A API device test' -Direction Inbound `
  -Action Allow -Profile Private -Protocol TCP -LocalPort 8080 `
  -LocalAddress $lanAddress -RemoteAddress $phoneAddress
# Run after testing.
Remove-NetFirewallRule -DisplayName 'Restaurant A API device test'
```

Production web and Android must use their deployed HTTPS origins. Serve the public Spring API through a TLS endpoint with a certificate valid for its hostname and trusted by clients, keep the Spring origin private when terminating TLS at ingress, and enforce HTTPS at the web ingress. Verify certificate trust and that direct HTTP requests cannot reach authenticated API endpoints before release. Use the configured Supabase HTTPS project origin and Firebase SDK endpoints.

## Install, update and capture evidence

Run from the repository root after both APKs have passed verification. Enable USB debugging on the test phone and approve the computer's ADB prompt. Use a phone with Google Play services and internet access for FCM. [Android Debug Bridge](https://developer.android.com/tools/adb) · [Expo notification requirements](https://docs.expo.dev/versions/v58.0.0/sdk/notifications/)

```powershell
if ($env:ANDROID_HOME) {
  $env:Path = "$(Join-Path $env:ANDROID_HOME 'platform-tools');$env:Path"
}
Get-Command adb -ErrorAction Stop
adb version
adb devices -l
$serial = Read-Host 'Serial of the authorized device'
$customerApk = Resolve-Path -LiteralPath 'target/android-fcm/restaurant-a-customer-development.apk'
$operationsApk = Resolve-Path -LiteralPath 'target/android-fcm/restaurant-a-operations-development.apk'
$customerId = (Get-Content -Raw target/android-fcm/customer-development.json | ConvertFrom-Json).applicationId
$operationsId = (Get-Content -Raw target/android-fcm/operations-development.json | ConvertFrom-Json).applicationId

# Use the same commands for updates with the same signing certificate and a compatible version code.
adb -s $serial install -r $customerApk.Path
adb -s $serial install -r $operationsApk.Path
adb -s $serial shell pm path $customerId
adb -s $serial shell pm path $operationsId

# Open the app before collecting its process logs. Substitute $operationsId for Operations.
$appProcessId = (adb -s $serial shell pidof -s $customerId).Trim()
adb -s $serial logcat --pid=$appProcessId -v threadtime
```

Record installation results and the certificate used for future updates. If an update reports a signature mismatch, obtain a build signed with the installed certificate to preserve app data. Review log captures locally and redact tokens, account data and credentials before sharing.

## Physical-device FCM test plan

Use two Customer accounts, at least two distinct Operations users, and a second restaurant or existing isolation fixture. Use synthetic checkout details and record app IDs, version codes, APK SHA-256 hashes, API origin, Firebase project ID, phone model, Android version and test outcome. [M14 physical-device plan](m14-physical-device-test-plan.md)

| Check | Procedure and expected evidence |
| --- | --- |
| Both apps, permission and registration | Sign in on Android 13 or newer and choose **Enable notifications** in Profile. Deny the first permission prompt and check that sign-in and inbox remain usable. Grant notification permission in Android settings, reopen Profile and choose **Enable notifications** again. Confirm a native Android registration on the existing device API. Record device UUID and active state only. Repeat with the app offline during initial registration, then reconnect. |
| Customer, order confirmation and status | Sign into Customer A, place a synthetic delivery order and record the server confirmation. As authorized staff, move it through accepted, preparing and ready. Confirm the corresponding private entries in the Customer A inbox and generic Android alerts. |
| Customer, delivery status | Assign a test worker, then progress the delivery through pickup and a supported completion, failure or cancellation. Verify Customer receives the supported status events and only its order details appear in the inbox. |
| Operations, new order | Place a Customer A order and check that the Operations A Orders screen can see it. An automatic staff FCM alert for every new order has no producer in the current API. Record the push portion as blocked by event coverage. |
| Operations, assignment and reassignment | As Manager, assign a delivery to Worker 1, then reassign it to Worker 2. Check the intended recipients' assignment and reassignment notifications and verify current assignments and role grants in Operations. |
| Both apps, foreground, background and tap | Trigger fresh events with each app open, backgrounded and after swiping it away. Check Android displays the generic text in the configured channel. Tap the alert and confirm the signed-in app opens its authorized inbox. Open from the launcher and check that the inbox reflects updates. Test separately after Android Settings force-stop and record OS delivery behavior. |
| Both apps, refresh, logout and account switch | Confirm registration recovers after an SDK token refresh. For a reinstall, sign in and opt in again. Sign out online and verify deactivation. Repeat offline, reopen, reconnect and sign in as a different user. Check that old responses are discarded, the previous inbox never appears, and late alerts contain only generic text. Opt in with the new account and verify it receives its own events. |
| Backend, initialization, dispatch and retry | Start with the intended credential and confirm Spring initializes the dispatcher. Trigger one event and inspect its outbox state and timestamps without selecting the token. Use a controlled provider failure to verify `PENDING` with delayed retry, then confirm successful recovery or terminal `FAILED`. Exercise an invalidated token and verify `UNREGISTERED` results in inactive device and `SKIPPED`. |
| Backend, tenant and recipient isolation | Trigger A and B events using different recipients. Confirm the Customer device scope, recipient ownership checks, staff membership gate and per-restaurant inbox scope. For a staff user with access to both A and B, also exercise the legacy account-wide Operations device route. It can surface a generic alert on either installation while the authorized inbox remains restaurant-scoped. |

The device test results are pending. The local review and automated checks exercise payload privacy and registration contracts. Native token issuance, device installation and real provider delivery require the configured builds and a physical device.
