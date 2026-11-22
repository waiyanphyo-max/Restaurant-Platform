# Restaurant build registry

This package validates the public configuration for the guest website and both Android apps. Reviewed `<slug>.json` files at this directory's top level are selected by the guest website's explicit host mapping. Android builds select a reviewed record by slug. See the [M13 Android build runbook](../../docs/m13-android-branding.md) for validation commands, release profiles, signing, and onboarding.

Start with [restaurant.example.json](restaurant.example.json), preparing a candidate **outside this directory's active top-level registry**, for example `target/mobile-onboarding/<slug>.candidate.json`. Use the exact existing UUID and slug returned by trusted Spring provisioning; this tooling creates no tenant. Schema v2 defines build-time fallback name/palette/local logo, guest hosts, development/staging/production API origins, and both Android apps. Each app has its own native display name, three explicit package IDs, launcher icon, splash and version name/code. Optional `android.<app>.eas` contains only the approved Expo `owner` and `projectId`.

Generate a deterministic, stdout-only review proposal with the existing validator:

```powershell
# Replace these paths with the actual reviewed input paths.
npm run --silent mobile:build -- propose 'target/mobile-onboarding/approved-restaurant.candidate.json'
npm run --silent mobile:build -- propose 'target/mobile-onboarding/approved-restaurant.candidate.json' --identity-history 'target/mobile-onboarding/approved-restaurant.identity-history.json'
```

The proposal contains its configuration digest, actual Git HEAD and all six app/environment identities, derived URL schemes and App Links. It never saves/overwrites an active registry entry or changes app source/assets. Missing external history stays `PENDING_EXTERNAL_IDENTITY_REVIEW`; the result always requires review and is not a release plan. An optional history file uses `schemaVersion: 1`, `reviewedBy`, `reviewedAt` (`YYYY-MM-DD`), `evidence`, and `applications` with `{applicationId, restaurantId, appKind, environment, status}`; `status` is `reserved` or `distributed`. Include all six proposed bindings and relevant historical reservations. A recorded attestation does not prove the supplied history is complete.

Uniqueness validation covers slugs, UUIDs, all guest domains, all app/environment package IDs and supplied Expo projects. Derived schemes and app-kind App Link prefixes separate builds. Compare against independently reviewed external distribution/reservation records as well. Existing restaurant UUIDs and package IDs cannot be changed through the proposal helper. Changing a distributed package ID creates another installed app identity. Do not automatically regenerate one.

Operator sequence: trusted provisioning → reviewed proposal/history → approved assets, deployed UUID/origin/host mapping, version/signing/provider review → explicit authorization to save `<slug>.json` with matching filename → registry validation → separate Operations and Customer release-plan resolution. No incomplete proposal automatically enters production routing. See [M13](../../docs/m13-android-branding.md) for the exact procedure and external-history contract. UXI-06 does not authorize real config replacement, commits or releases.

Keep approved assets under `assets/<slug>/`; a later authorized source handoff includes the PNGs with the JSON. The launcher icon must be square. Use a 1024×1024 icon for reviewed brands and a centered transparent splash image, with explicit provenance/crop/transparency/dimension approval. The embedded mobile logo is limited to 96 KiB. Supply a separate public HTTPS logo URL for the guest website. Check both app themes for readable contrast. Staging and production use the first guest host for QR URLs and Android App Links; aliases serve the website. HTTPS origins may contain no credentials, path, query or fragment. Staging/production deny private, IP and single-label hosts; real EAS releases additionally reject known reserved/placeholder/tunnel endpoints. Local schema inspection does not verify deployment or ownership. Development alone permits loopback/emulator HTTP and explicit `MOBILE_DEVELOPMENT_API_BASE_URL` private-LAN override. That opt-in cannot enable production HTTP. A local guest host may be `<slug>.localhost`.

Backend runtime display name, in-app logo/palette/revision and current menu/media/Owner-curated Featured data remain authoritative. Owner/Manager runtime edits do not rewrite this registry, package ID, native label, launcher/splash, signing or release metadata. Operations retains its UXI-03 provider; Customer's UXI-06 bounded public-brand consumer validates its embedded tenant and selected API environment, using UXI-01 semantic tokens and same-tenant fallback on failure. No route, QR value, auth claim or runtime settings field switches an installed build's tenant. Customer storefront redesign remains UXI-08.

All registry fields are public. Keep Supabase service-role keys, database credentials, server Firebase files, signing credentials, and private data in their respective server or release systems.

Schema v1 remains readable by guest web. Migrate a legacy record to v2 before Android builds, preserving any previously reserved package IDs and keeping the same backend UUID. Guest production requires exact configured hosts. Include the registry JSON and asset tree in standalone guest deployments. The [guest domain runbook](../../docs/m5-guest-web-foundation.md) covers local routing and DNS setup.

`fixtures/` contains fictional Restaurants A and B and the legacy starter. They never enter guest host routing. Their development profiles can be evaluated by Expo locally. Staging and production fixture profiles are available only for offline inspection with `--fixture`. A and B use reserved `.test` domains for HTTPS validation.

```powershell
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

The 12 resolves share the same two app source trees. Release fingerprints bind source revision, lockfile, public Auth/API/features, registry/assets, package/environment/project, Firebase/Maps/plugin inputs, shared config/plugin code, each app config and EAS profiles. Review a new fingerprint after any input changes. Real EAS staging/production remains fail-closed on missing/mismatched project/source/fingerprint/Auth and enabled notification provider configuration. Maps key syntax is not proof of package/signature restrictions or device readiness. Never disable notifications for release validation; the explicitly labelled development-only, `EXPO_NO_DOTENV=1` offline JavaScript fixture procedure is in [M13](../../docs/m13-android-branding.md).

To reproduce the ordinary Operations starter Firebase preflight with the same Expo dotenv selection used by `verify:frontend`, run:

```powershell
npm run build:starter -w @restaurant-platform/operations-mobile
```

When notifications are enabled, configuration fails before bundling if Firebase client validation fails. The `Firebase Android preflight status=BLOCKED` diagnostic gives the selected app kind, environment and exact application ID, matching Android client count, expected-project configuration/match, and metadata validity. Project values, client paths, raw JSON and keys are omitted. The legacy starter's development application ID is `dev.restaurantplatform.starter.operations.staging.dev`; the `staging` text inside that historical ID does not change the selected `development` environment.

In the approved Firebase project's **Project settings → General → Your apps**, select or register that exact unchanged Android application ID, download its Android `google-services.json`, set `OPERATIONS_GOOGLE_SERVICES_FILE` to the ignored file relative to the Operations workspace, and set `MOBILE_FIREBASE_PROJECT_ID` to that same approved project. A duplicate client or invalid app/sender/key record requires a fresh client download. Rerun the original command, then `npm run verify:frontend`. Do not edit private JSON, change native package IDs, or disable notifications to bypass this gate. A passing local configuration check still needs separate real device/provider acceptance.

San Thaw Tar is **not release-ready**: the retained green fallback (`#234D3C`) differs from Figma's approved tenant red (`#A51D22`), configured hosts contain placeholders/a temporary tunnel, and the 1254×1254 candidate logo is opaque. Keep the registry/identities unchanged pending explicit palette/artwork/deployed-UUID/domain/history/version/signing review. Do not make red a global default, transform the logo automatically, use low-resolution Figma previews as native assets or repurpose the six UXI-05 food-photo records as launcher/splash assets. The normal Operations starter Firebase client/package mismatch is a separate existing environment blocker. [UXI-06 evidence](../../docs/uxi-06-branded-builds.md) records actual verification and outstanding approvals.
