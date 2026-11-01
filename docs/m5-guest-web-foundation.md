# M5 Guest Ordering Website foundation

`apps/guest-web` provides one restaurant's public landing page, menu and product details for each reviewed hostname. Guests do not sign in to browse a menu or enter a Common/Table QR flow. There is no restaurant marketplace or restaurant-selection screen. This milestone does not implement checkout, change QR credentials, apply migrations or change production infrastructure.

## Backend contract review and missing resolver

The existing Spring Boot public contracts were reviewed before implementation:

| Contract | Available data and behavior |
| --- | --- |
| `GET /api/v1/public/restaurants/{restaurantId}/menu` | Restaurant UUID, name, public slug, description, phone, address, logo, currency, ordered categories, products, variants, product-specific modifier groups/options and availability/stock state. |
| `GET /api/v1/public/restaurants/{restaurantId}/products/{productId}/modifier-groups` | Public modifiers for an available product; the menu already embeds its product-specific modifier groups for a single-request browsing experience. |
| Common/Table QR order endpoints | Remain public. Spring validates QR credentials, restaurant/table scope, selections, stock and final prices when checkout is implemented. |

**Missing backend endpoint:** there is no public verified hostname/slug-to-restaurant resolution endpoint. M4's authenticated platform configuration endpoint stores domain/theme metadata; saving that metadata neither verifies ownership nor activates guest routing. M5 therefore uses the existing reviewed server-side registry in `configs/restaurants`, rather than inventing a public endpoint, reading a protected platform endpoint anonymously, or accepting a client restaurant UUID. No Spring or database change is needed for this foundation.

A future dynamic resolver must use a server-controlled, unique, environment-specific mapping of verified domains to active restaurant UUIDs. It must reject unknown/ambiguous hosts and return only public branding/profile data. Ownership verification, duplicate-domain enforcement, activation/revocation, registry synchronization and cache invalidation need an explicit backend design and cross-tenant tests before replacing this registry.

Other contract limits:

- The public menu has no opening hours, timezone, `isOpen`, `acceptingOrders` or closure reason. An inactive restaurant produces the same HTTP 404 as a missing restaurant. The website can show a closed/unavailable message, but cannot infer a real opening schedule or promise that an order will be accepted.
- Theme colors come from the reviewed registry. Name/logo/contact/catalog data can come from the validated public menu. Platform configuration changes require deliberate registry synchronization and a guest release; they do not automatically update domain routing.
- Menu content has one name/description per item, with no Burmese/English content translations. UI localization is separate from catalog translation.
- A menu price or availability display is informational. Spring's checkout validation remains authoritative; no client calculation reserves stock or guarantees a price.
- Monetary `BIGINT`/Java `long` values use whole currency units, as documented in the database schema and used by checkout arithmetic. Display them directly; do not divide prices by 100. The historical M2 report's minor-unit wording is corrected accordingly.
- Backend-generated Common QR and Owner URLs still use the single `APP_PUBLIC_WEB_BASE_URL`. A multi-restaurant compatibility bridge for an old shared origin remains separate production work.

## Tenant resolution

`GUEST_CONFIG_ENV=staging|production` selects the exact environment-specific hostname lists in real top-level `configs/restaurants/<slug>.json` files. Config validation rejects duplicate domains/UUIDs/slugs and malformed or incomplete configuration. The example and `fixtures/starter.json` are never runtime tenants. No default restaurant is selected when configuration, hostname or slug is missing.

The canonical HTTP `Host` is matched against that registry. Client `X-Forwarded-Host`, restaurant IDs and tenant-context headers do not override it. A legacy `restaurantId` query must match the resolved restaurant. Unknown hosts, mismatched slugs and cross-restaurant legacy IDs fail closed before another restaurant's catalog is requested or rendered.

The public-menu request uses only the UUID returned by this server-side resolution. The response UUID and shape are checked before using its branding/contact/catalog. A response for Restaurant B received while serving Restaurant A is rejected. Requests use the existing public API client without a bearer token or forwarded browser cookies, reject redirects, omit referrers and bypass shared fetch caching. Error output does not include upstream response bodies, credential-bearing URLs or arbitrary backend messages.

## Public pages and state ownership

| Domain URL | Local path equivalent | Behavior |
| --- | --- | --- |
| `/` | `/r/<slug>` | Restaurant welcome, public menu preview/browsing and contact details. |
| `/menu` | `/r/<slug>/menu` | Categories in backend display order and the restaurant's public catalog. |
| `/menu/<productId>` | `/r/<slug>/menu/<productId>` | Product description/image, variant prices/availability and modifier groups/options/selection limits. Product lookup uses only the resolved tenant's menu. |
| `/workspace?...` | `/r/<slug>/workspace?...` | Existing Table QR and safe Owner entry shapes; the URL's restaurant UUID must match the resolved tenant. |

Known tenants retain their own configured name/logo/colors around loading, unavailable, error and not-found content. An unknown domain gets a neutral unavailable screen without an unrelated restaurant's branding. A known restaurant with no catalog shows an empty-menu state. HTTP 404/410/503 from the menu service produce the configured restaurant's unavailable state; network, malformed-response and configuration failures expose a generic retry message. The UI does not invent an opening schedule or a live checkout.

Domain-based navigation uses a persistent branded layout. Local `/r/<slug>` pages scope their branded layout and browser session to that slug so switching local restaurants cannot retain the previous restaurant's shell or QR credential. Credentials stay inside the resolved tenant's client session while navigating with the app's links. The server still resolves and validates the tenant for every rendered public page and for the language action.

## Local development

1. Copy `configs/restaurants/restaurant.example.json` to a real `<slug>.json` record. Use the UUID of an existing restaurant in your local/staging Spring database, reviewed public branding and exact environment-specific hosts. Supply the two required PNG icon paths under `configs/restaurants/assets/`; these are required by the shared registry even when developing only the website. A second restaurant needs a different UUID, slug, hosts and Android application IDs. Never put QR credentials or private keys in these files.
2. Create `apps/guest-web/.env.local` from its `.env.example`. Set `GUEST_CONFIG_ENV=staging`, `GUEST_LOCAL_ROUTING=true` and `GUEST_API_BASE_URL=http://localhost:8080` for a local Spring server. `NEXT_PUBLIC_API_BASE_URL` is a compatibility fallback when the server-only origin is absent. There is no implicit API-origin default. Public pages do not require Supabase configuration.
3. Run `npm run build:packages`, start Spring using the documented backend environment, and run `npm run dev:guest` from the repository root.
4. Visit `http://localhost:3002/r/<slug>` or `http://<slug>.localhost:3002`. Menu/product links remain scoped to the restaurant. The localhost root without a configured mapping does not list available restaurants.

Local routing requires both `GUEST_LOCAL_ROUTING=true` and a non-production Node runtime. Path routing is restricted to loopback hosts (`localhost`, `127.0.0.1`, `[::1]`); the development subdomain form is restricted to a real `<slug>.localhost`. It still resolves only reviewed real configs. Changing an arbitrary public domain's path or query cannot switch tenants. Local routes remain disabled under `next start`/production even if the flag is accidentally retained.

## Production domain configuration

The registry is a Node filesystem package: `configs/restaurants/index.cjs` reads JSON and validates icon paths relative to its own `__dirname`. Bundling it into `.next/server/chunks` changes that directory and can make every real tenant disappear in a production build even though development resolution works. `apps/guest-web/next.config.ts` therefore keeps `@restaurant-platform/restaurant-config` in `serverExternalPackages`. This is the supported Next.js 15 opt-out for packages that require Node-specific behavior. See [Next.js 15 serverExternalPackages](https://nextjs.org/docs/15/app/api-reference/config/next-config-js/serverExternalPackages).

In this npm workspace, symlink resolution still allowed the registry to be bundled despite that setting. The server-only, non-Edge webpack configuration therefore also explicitly externalizes this package as CommonJS while preserving the existing externals. That keeps runtime Node resolution at the registry's CJS export and preserves its filesystem directory. Retain both settings when changing the build pipeline and verify a production server can actually resolve a configured tenant; a compiler-only success would not catch the original failure.

The same config sets `outputFileTracingRoot` to the repository root and explicitly includes `../../configs/restaurants/*.json` and `../../configs/restaurants/assets/**/*.png` in server traces. Next's default tracing root is the app directory, so sibling workspace files otherwise need explicit coverage. Tracing includes help package the registry's runtime files; they do not create restaurant records. The current app uses `next build`/`next start` and does not enable `output: "standalone"`. If standalone packaging is added later, verify the traced external package, real JSON and icon assets in the final artifact, and separately copy/serve `.next/static` and `public` where applicable. See [Next.js 15 output and monorepo tracing](https://nextjs.org/docs/15/app/api-reference/config/next-config-js/output).

1. Verify the restaurant owns or is authorized to use each hostname. Record the exact backend UUID and approved branding in `configs/restaurants/<slug>.json`. Put only staging hosts in `guestDomains.staging` and production hosts in `guestDomains.production`; do not use wildcard hostnames or share a host between restaurants.
2. Synchronize reviewed M4 metadata with this registry explicitly. Validate all registry records before release. Include the real JSON files and referenced assets in the deployed server artifact; a standalone output must package them or provide an equivalent reviewed generated registry. A successful build without real records is not evidence that a domain is configured.
3. Configure the restaurant's DNS record to the chosen ingress/load balancer according to that provider's requirements. Install/verify TLS for each exact hostname. DNS records and certificates are operational configuration, not created by saving platform metadata or editing a JSON file.
4. Configure ingress/CDN virtual hosts with an explicit allowed-host list. Reject unrecognized hosts/SNI combinations and conflicting forwarded-host input. Pass the canonical external hostname as `Host` to Next.js. Do not rewrite every request to an internal service hostname, and do not trust client-supplied forwarding headers. The app deliberately does not use `X-Forwarded-Host` as its tenant authority.
5. Set `GUEST_CONFIG_ENV=production` and server-only `GUEST_API_BASE_URL` to the correct HTTPS Spring origin. Disable local routing. Keep database credentials, Supabase service-role keys, QR tokens and signing material out of guest environment variables and client bundles. Restrict Next's upstream network access to the intended API/media services where the infrastructure supports it.
6. Avoid shared full-page caches for dynamic guest routes. Do not cache a response by path alone across hosts. Preserve `Cache-Control: private, no-store` and isolate any infrastructure-level caches by canonical hostname. Upstream menu fetches are also `no-store`; there is no cross-tenant catalog fallback.
7. Menu reads are server-to-server, so they do not require adding browser CORS origins. If a later browser checkout calls Spring directly, add the exact HTTPS guest origins to `APP_CORS_ALLOWED_ORIGINS`; retain old origins during migration. Do not use `*`. Guest QR entry does not require Supabase login or an Auth redirect change.
8. Verify the same menu/product path under two restaurant hosts. Check UUID/branding/contact/menu identity, unknown hosts, another tenant's query ID/product ID, forged forwarded headers, backend outage, empty/unavailable catalog and local-path denial in production. Test Android Chrome at narrow widths and with throttled bandwidth against real staging data.
9. Preserve the existing production origin and distributed QR/auth paths following the [production URL migration plan](production-url-migration.md). Do not change `APP_PUBLIC_WEB_BASE_URL`, rotate Common/Table QR credentials, replace printed codes or switch production traffic merely because the new guest build succeeds.

## Printed QR links and credential handling

The guest entry shapes remain supported on the matching configured restaurant host:

```text
/?view=customer-pickup&restaurantId=<uuid>#qrToken=<encoded-token>
/workspace?view=table-order&restaurantId=<uuid>#qrToken=<encoded-token>
/workspace?restaurantId=<uuid>
/auth/callback
/auth/accept-invite
```

A QR credential belongs only in the URL fragment. The browser reads it into memory and removes the fragment from visible history. It must never enter server props, a query parameter, analytics, telemetry, local/session storage or logs. The public transport does not attach a Supabase bearer. Keep full-URL analytics/session replay disabled on QR entry pages; infrastructure must redact credentials accidentally submitted in URLs before access logging. No analytics library is added by this foundation.

The tenant-scoped client session captures a QR fragment once, keeps the raw credential in a private React ref and exposes only a checking/ready/invalid status to the QR notice. Only fragments containing a `qrToken` key are removed, including malformed/duplicate credential fragments; ordinary `#contact` and category anchors remain intact. Ordinary client navigation between that tenant's home/menu/product pages retains the session. A full document navigation, reload, tab close or tenant switch clears the credential; rescanning the printed QR restores it. It is neither a persistent cart nor completed checkout. Do not implement a redirect that drops the fragment before the browser captures it. A future cross-domain compatibility handoff must map through trusted configuration and preserve the fragment in browser memory until the verified destination captures it.

**Shared-origin migration limitation:** a previously printed link for Restaurant B on a host now assigned to Restaurant A must not display B through the `restaurantId` query. The new guest app rejects it. Keep the original shared-origin implementation/compatibility service running until a separately tested bridge handles every previously issued restaurant mapping. This task changes no production routing or issued credential, so it does not invalidate existing printed links.

## Localization, accessibility and bandwidth

English and Burmese UI dictionaries provide a structure for adding translations without changing routing. EN/မြန်မာ controls submit a tenant-validated server action and save a host-only `guest-language` cookie (`HttpOnly`, `SameSite=Lax`, `Secure` in production). The selected language sets the document `lang` attribute, UI labels and price-number locale. Invalid/missing language preferences fall back to English. Catalog names/descriptions are displayed as supplied by Spring; translating them requires a future backend content contract.

Controls use semantic links/buttons/form elements, a skip link, visible focus, descriptive labels, availability text and mobile-sized touch targets. Responsive grids start with one column, and reduced-motion preferences disable the loading animation. Burmese headings have adjusted line height and wrapping rules. These implementation choices still require real Android Chrome and assistive-technology acceptance checks.

The server renders the initial public menu, reuses embedded variants/modifier groups instead of issuing per-product modifier requests, and avoids requiring a client session for public reads. System fonts avoid a mandatory font download. Native `<img>` elements load validated public HTTPS media directly in the browser with fixed dimensions, async decoding and `no-referrer`. Menu thumbnails and variant images load lazily; the product-detail hero loads normally. This deliberately avoids introducing an unrestricted server image proxy for tenant-supplied media. Publish appropriately sized/compressed public assets through the approved media service; native images do not provide automatic Next.js resizing. Text and product names remain usable without image data, and menu data is never invented when the API is unavailable.

## Verification and remaining operational evidence

Run from the repository root:

```powershell
npm run build:packages
npm run lint -w @restaurant-platform/guest-web
npm run typecheck -w @restaurant-platform/guest-web
npm run test -w @restaurant-platform/guest-web
npm run build -w @restaurant-platform/guest-web
npm run test:production -w @restaurant-platform/guest-web
```

Verification recorded during this implementation:

| Check | Result |
| --- | --- |
| Shared workspace package build | Passed. |
| Guest lint | Passed with zero warnings. |
| Guest typecheck | Passed. |
| Guest unit/server-rendering tests | Passed: 16 test files, 114 tests. |
| Guest production build | Passed with the explicit CJS registry externalization and tracing configuration. Windows `EPERM` errors while replacing generated build directories required rerunning the build outside the sandbox; this was an environment filesystem restriction, not a compiler failure. |
| Production HTTP smoke | Passed: 33 grouped checks against the final built Next app and synthetic Spring HTTP contract, including 10 correctly denied streamed not-found responses. Unknown hosts returned HTTP 404. Temporary tenant configs/icons and owned test servers were cleaned up. |
| Live Spring/staging and Android Chrome | Not verified; no real tenant/backend environment was supplied and browser bootstrap was unavailable. |

The production smoke command requires a fresh build. It starts the real Next production server against a loopback HTTP fixture implementing the existing Spring menu contract, creates uniquely named synthetic `.test` tenant configs/icons temporarily and cleans them up. It does not contact a real Spring database or change existing restaurant records. Its production-mode requests exercise actual bundled/runtime resolution, two tenants' page identity and denial paths; Next's streamed not-found responses are evaluated by their denial content, `noindex` and absence of another tenant's data as well as HTTP status. This is separate from live staging acceptance.

Cross-restaurant routing/branding tests exercise independent tenants and fail-closed behavior; menu transport tests use the real public route contract with controlled responses. Component/server-rendering checks do not establish live DNS ownership, TLS/ingress policy, production registry contents, a deployed Spring connection, full QR checkout, Android-device behavior or a safe migration of a shared legacy origin. No real runtime restaurant records or backend environment were supplied for this implementation, so live staging menu/branding/contact data and production ingress behavior are not verified. Browser bootstrap was unavailable in this environment, so visual/mobile browser acceptance and Android Chrome verification were not completed. Record the executed checks and any environment limits in the implementation handoff. No commit, push, merge or deployment is part of M5.
