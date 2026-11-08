# Restaurant build registry

This package validates the public configuration for the guest website and both Android apps. Reviewed `<slug>.json` files at this directory's top level are selected by the guest website's explicit host mapping. Android builds select a reviewed record by slug. See the [M13 Android build runbook](../../docs/m13-android-branding.md) for validation commands, release profiles, signing, and onboarding.

Start with [restaurant.example.json](restaurant.example.json) and keep the slug equal to the filename. Use the exact UUID from Spring provisioning. Schema v2 defines the public brand, guest hosts, development/staging/production API origins, and both Android apps. Each app has its own display name, three package IDs, icon, splash, and Android version. Every package ID must be unique across restaurants, apps, and profiles. An optional `android.<app>.eas` object contains only the Expo `owner` and the approved `projectId`.

Keep assets under `assets/<slug>/` and commit the PNGs with the JSON. The launcher icon must be square. Use a 1024×1024 icon for reviewed brands and a centered transparent splash image. The embedded mobile logo is limited to 96 KiB. Supply a separate public HTTPS logo URL for the guest website. Check both mobile themes for readable contrast. Staging and production use the first guest host for QR URLs and Android App Links. Additional guest host aliases serve the website. Development can use HTTPS or a loopback/emulator API origin. A local guest host may also be `<slug>.localhost`.

All registry fields are public. Keep Supabase service-role keys, database credentials, server Firebase files, signing credentials, and private data in their respective server or release systems.

Schema v1 remains readable by guest web. Migrate a legacy record to v2 before Android builds, preserving any previously reserved package IDs and keeping the same backend UUID. Guest production requires exact configured hosts. Include the registry JSON and asset tree in standalone guest deployments. The [guest domain runbook](../../docs/m5-guest-web-foundation.md) covers local routing and DNS setup.

`fixtures/` contains fictional Restaurants A and B and the legacy starter. They never enter guest host routing. Their development profiles can be evaluated by Expo locally. Staging and production fixture profiles are available only for offline inspection with `--fixture`. A and B use reserved `.test` domains for HTTPS validation.
