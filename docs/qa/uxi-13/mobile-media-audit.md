# UXI-13 mobile, provider and original-media evidence

Observed 22 November 2026, Asia/Bangkok. Source revision `c8659e40c27606ae137ae8cb5befa7aadd0079c5`; branch `uxi/13-integrated-qa`. This is offline configuration, synthetic JavaScript and original-file integrity evidence. It is not a signed artifact, installation, native screenshot, provider or deployed-tenant acceptance.

Read completely: UXI-01 through UXI-06 reports, mobile workspace READMEs, registry README, M13 build runbook and relevant FCM build/environment guidance. Current app config, registry, Expo/fingerprint/Firebase helpers and synthetic configuration tests were inspected. Historical counts are not reused as current test results.

## Executed configuration checks

| Command/check | Current outcome | Evidence |
| --- | --- | --- |
| `npm run --silent mobile:build -- validate` | PASS, exit 0; 18 schema-v2 app/environment combinations, zero legacy guest records | [mobile-validation.log](mobile-validation.log) |
| `node docs/qa/uxi-13/mobile-checks.cjs --export` configuration phase | PASS, 12/12 CLI fixture resolves; 12 distinct packages and 12 distinct schemes; every plan has current full HEAD and a SHA-256 fingerprint | [mobile-plan-summary.json](mobile-plan-summary.json), per-plan JSON files and [runner](mobile-checks.cjs) |
| Four isolated A/B Android JavaScript exports | PASS, all four exit 0; Operations 1,739 modules, Customer 1,394 modules per tenant | [mobile-check-results.json](mobile-check-results.json), [artifact sizes/hashes](mobile-js-artifacts.json) and four individual export logs; development fixtures only |
| Ordinary `npm run verify:frontend` | **FAIL, exit 1**, after type/lint/2,084 tests/web builds pass. Operations starter Firebase client/project/package mismatch for `dev.restaurantplatform.starter.operations.staging.dev`; normal Customer export not reached | [frontend-results.json](frontend-results.json), local `verify-frontend.log` |
| SDK/JDK/ADB/emulator inventory | SDK and JDK AVAILABLE; no attached device and no configured AVD | [native-environment.json](native-environment.json) |
| Seven original integrity checks | PASS for observed dimensions and SHA-256; logo transparency FAIL | [original-media-integrity.json](original-media-integrity.json) |

The runner removes public/mobile/EAS selection variables from its child-only environment, disables dotenv/telemetry, uses offline mode and sets notifications false **only for the explicit development fixtures**. It never edits `.env`, Firebase client JSON, active registry assets/identities, existing native projects or production notification settings. It writes isolated export output beneath ignored `target/uxi-13-mobile/`, preserving `dist-starter` and both existing `android/` directories. Source/configuration checks do not contact the synthetic `.test` API hosts or any real restaurant.

All four exports completed in this audit: A Operations 4,980,248 bytes, A Customer 3,861,568 bytes, B Operations 4,980,247 bytes, B Customer 3,861,568 bytes. These are Hermes JavaScript bundles, not APKs. Their source module graphs are shared per app; separate resolved Expo/native plans provide each tenant's configuration. Bundle success alone cannot verify installed package/manifest identity or runtime API behavior.

## Two restaurants, two apps, three environments

The native build fixtures use A UUID `00000000-0000-4000-8000-000000000101` and B UUID `00000000-0000-4000-8000-000000000102`. These are fictional IDs. They do not carry verified Owner/Manager credentials and do not enter Guest host routing.

A's existing embedded fallback is `#8A3C25 / #EDAE49 / #FFF6E7`; B's is `#195954 / #60C8B7 / #EDF8F7`. This audit does not relabel A's brown fallback as the requested runtime red `#A51D22`. Existing Operations and Customer branding tests separately use runtime red, exact UUID guards and later palette refreshes. Backend/bootstrap and browser fixtures are separate evidence slices; they are not one continuous live A/B onboarding-to-installed-device test.

| Tenant | App | Environment | Package | API origin | Guest origin |
| --- | --- | --- | --- | --- | --- |
| A | Operations | development | `dev.restaurantplatform.fixturea.operations.dev` | `http://10.0.2.2:8080` | `http://restaurant-a.localhost:3000` |
| A | Customer | development | `dev.restaurantplatform.fixturea.customer.dev` | `http://10.0.2.2:8080` | `http://restaurant-a.localhost:3000` |
| A | Operations | staging | `dev.restaurantplatform.fixturea.operations.staging` | `https://api.restaurant-a.staging.test` | `https://restaurant-a.staging.test` |
| A | Customer | staging | `dev.restaurantplatform.fixturea.customer.staging` | `https://api.restaurant-a.staging.test` | `https://restaurant-a.staging.test` |
| A | Operations | production | `dev.restaurantplatform.fixturea.operations` | `https://api.restaurant-a.test` | `https://restaurant-a.test` |
| A | Customer | production | `dev.restaurantplatform.fixturea.customer` | `https://api.restaurant-a.test` | `https://restaurant-a.test` |
| B | Operations | development | `dev.restaurantplatform.fixtureb.operations.dev` | `http://10.0.2.2:8080` | `http://restaurant-b.localhost:3000` |
| B | Customer | development | `dev.restaurantplatform.fixtureb.customer.dev` | `http://10.0.2.2:8080` | `http://restaurant-b.localhost:3000` |
| B | Operations | staging | `dev.restaurantplatform.fixtureb.operations.staging` | `https://api.restaurant-b.staging.test` | `https://restaurant-b.staging.test` |
| B | Customer | staging | `dev.restaurantplatform.fixtureb.customer.staging` | `https://api.restaurant-b.staging.test` | `https://restaurant-b.staging.test` |
| B | Operations | production | `dev.restaurantplatform.fixtureb.operations` | `https://api.restaurant-b.test` | `https://restaurant-b.test` |
| B | Customer | production | `dev.restaurantplatform.fixtureb.customer` | `https://api.restaurant-b.test` | `https://restaurant-b.test` |

All twelve resolved plans are offline inspection, including profiles labelled staging/production. `.test` is not a deployed/approved staging environment. Both app source trees remain shared. Versions are `0.1.0`, code `1`; logos/icons/splash paths remain app/tenant specific, and each plan records its selected native label, palette, splash and fingerprint. Development has no HTTPS App Links; the eight staging/production plans use tenant-specific canonical hosts and `/app/operations/` or `/app/customer/` prefixes.

## Immutable identity, runtime refresh and providers

Current source contracts inspected:

- `configs/restaurants/index.cjs`, `mobile-runtime.ts`, `expo.cjs`: fixed restaurant UUID, selected environment/API, duplicate UUID/package/domain checks, embedded release-vs-runtime identity validation and installed package checks. Staging/production deny HTTP/private origins; real EAS release selection also rejects reserved/tunnel/placeholder hosts.
- `apps/{operations,customer}-mobile/src/branding/runtime.ts` and providers: same-scope public canonical branding fetch, foreign UUID/revision rejection, bounded refresh, foreground handling, abort/generation guards and same-tenant fallback. Their existing tests use tenant-only `#A51D22` and prove supported runtime changes without changing embedded native configuration. This is mocked controller/component evidence, not an installed binary fetching a live API.
- `configs/restaurants/expo.cjs`: fingerprint binds HEAD, selected UUID/environment/API, registry, branding/assets, package/version, auth inputs, provider/plugin inputs, lockfile, shared config code and app/EAS source. Fingerprint syntax/current input binding does not establish signing or externally reserved package history.
- `firebase-android.cjs`: when notifications are enabled, exactly one Android client must match the package, expected project, sender/app metadata and key shape. Service-account JSON is rejected. No private client contents were copied into this report.
- Operations `app.config.js` has no native Maps integration. Customer config only enables native Maps for a plausible key and blocks background/foreground-service location permissions. Maps key syntax is not evidence of billing, package/certificate restrictions or working map tiles. Optional manual-address behavior remains available.
- Both EAS files use separate development/staging/production profiles; staging/production require local signing credentials, commit/project/auth/fingerprint gates. Current fixture plans have `easProjectId: null`; neither workspace has an app-local `credentials.json`. Signing ownership, historical package reservations, distributed version codes and release certificates are BLOCKED external review inputs.

The ordinary Operations starter selects `dev.restaurantplatform.starter.operations.staging.dev` and has a historically documented mismatching Firebase client. Keep the current root regression's real outcome visible. Do not fabricate a matching client or turn off production notifications. The separate offline development exports exercise neither FCM registration nor server outbox delivery.

## Native environment and evidence limits

Direct executable inspection found JDK 21.0.2 and the SDK at `C:/Users/DELL/AppData/Local/Android/Sdk`, although `adb`, `emulator`, `sdkmanager`, `java` and `gradle` were absent from this shell's PATH. Sandbox `LOCALAPPDATA` resolves elsewhere, so its default SDK lookup alone was insufficient.

Installed SDK components include platforms 36.1/37.0, Build Tools 36.0.0/36.1.0/37.0.0, NDK 27.1.12297006 and CMake 3.22.1/3.31.6. Existing native Gradle wrappers select 9.4.1. `adb devices` exited 0 with zero connected, unauthorized or offline devices. `emulator -list-avds` exited 0 with zero AVDs. No emulator/device was available for installed acceptance.

No prebuild, Gradle assembly, signed/cloud EAS build, APK/AAB verification, installation, App Link verification, native provider call, TalkBack, device 200% font scale, safe-area/keyboard or native screenshot test was executed. Existing ignored `android/` directories were preserved. Toolkit presence does not certify those projects' current package/provider configuration. Real certificate/host Digital Asset Links and device GPS/Maps behavior remain BLOCKED. JS export PASS is neither signed APK nor installation/native-device PASS.

## Original media and San Thaw Tar pilot gates

Read-only `System.Drawing.Bitmap` inspection and SHA-256 hashing on 22 November reproduced all UXI-05/06 candidate integrity records:

| Candidate | Dimensions | SHA-256 |
| --- | --- | --- |
| Ah-Sein-Kyaw.jpg | 736×920 | `7a98eb6878f199d253197fb4106e343123309c494027dfab76d6ad59f030b01b` |
| Fried-Noodle.jpg | 736×736 | `6f250770ed028360e7adf608702b45f8200e1154b5f13aed9cd12b9375846f11` |
| Fried-Rice.jpg | 736×1104 | `999133ea6750e318a02ccb551fceac8a8acc980f4304e2a3ae424cd2378472b7` |
| Kan-Sone-Plain.jpg | 676×1200 | `87d9ecf522ccb64e05f1f764f1b804ade188eea684533ea9e608d9040db26203` |
| Kyay-Oh-Se-Chat.jpg | 736×861 | `e068f030300e97846aaf2e28bfe7d89dd65c481585e798a43a486e022d70b293` |
| Malar-Xiang-Guo.jpg | 736×981 | `0e10f91ce19af367a2999decfae332bacefc2ee6f4652bd11de4afc2cf3deadd` |
| Burmese Red and Gold Food Emblem.png | 1254×1254 | `780758f968cde0a6d83ca8dc100f804efd1eb9b94f46f4a3eb27d2b413b90fd1` |

All seven decode as `Format24bppRgb`, sampled alpha 255. The logo remains opaque and does not meet transparent-logo approval. Its matching historical hash does not turn it into approved native artwork. The six food candidates stay catalog media; they were neither copied into native assets nor uploaded.

Source `configs/restaurants/san-thaw-tar.json` still contains the real tenant UUID and existing six package IDs; none was used as synthetic fixture data or changed. That record's primary fallback is green `#234D3C`, secondary `#E8EEDB`, white background. The approved tenant-red intention is `#A51D22`; current runtime hosted palette was not inspected or changed. The source's `example.com`, `*.example.invalid` and `trycloudflare.com` tunnel entries do not establish approved deployed API/Guest domains. No candidate was fetched from its configured public Storage URL.

| Gate | Current status | Required next owner/action |
| --- | --- | --- |
| Actual deployed restaurant UUID and exact product/variant mappings for six originals | BLOCKED_EXTERNAL_DEPENDENCY; source registry UUID alone is not hosted mapping evidence | Platform operator + restaurant Owner: read-only authorized mapping review against actual deployed catalog |
| Provenance/ownership/quality, crop/display treatment | PENDING; all historical approvals preserved | Owner: approve originals and intended associations explicitly |
| Manifest and published bytes | PENDING; no new manifest or publication action executed | Operator: approved manifest using verified hashes/UUIDs; separate authorization to upload; then verify returned media bytes and public product projection |
| Featured selection | PENDING Owner approval and exact eligible product UUID | Owner: explicitly review and confirm through Owner-only API after catalog/media readiness |
| Transparent logo/native icon/splash | BLOCKED opaque supplied logo; artwork suitability not accepted | Brand/release owner: obtain approved full-resolution originals and review transparency, crop, safe area and both apps' assets |
| Red fallback vs runtime palette | PENDING approved three-color/native-splash proposal; retained green source unchanged | Owner + release owner: approve runtime palette and separately review fallback/native asset diff preserving package IDs |
| Deployed API/Guest hosts and App Links | BLOCKED unverified placeholders/tunnel in source | Platform/domain owner: approve reachable environment-specific hosts, exact tenant mapping, HTTPS and certificate-bound assetlinks |
| Firebase/Maps/signing/historical identity | BLOCKED external project/package/certificate evidence; known starter mismatch retained | Mobile/provider owner: matching Android clients in approved project, package-restricted Maps key, existing signing key/certificates and package/version history |
| First pilot installed acceptance | BLOCKED no AVD/device and unresolved external gates | QA + release owner + restaurant Owner: signed staging installs, provider/App Link/TalkBack/scaling/keyboard tests, then explicit pilot approval |

No approved mapping, ownership decision, upload result or real Featured selection was invented. Reviewed manifest metadata is not proof of published image bytes. No real restaurant/media/QR/order/payment/finance data, provider record, application identity or native artwork was changed.

Mobile disposition: local synthetic configuration and JS bundling PASS within this scope. Staging and production native release readiness are NO-GO/BLOCKED on the explicitly listed provider, historical identity/signing, domain/artwork and installed-device gates. No deployment or release was attempted.
