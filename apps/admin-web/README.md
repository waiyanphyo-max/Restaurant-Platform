# Platform Admin web · M3

A standalone Next.js administration workspace with a responsive sidebar, account controls, accessible forms, paginated tables, confirmation dialogs and explicit loading/error states. It does not import the retired `apps/web` interface.

## Run locally

From the repository root:

```powershell
Copy-Item apps/admin-web/.env.example apps/admin-web/.env.local
# Fill in this environment's public Supabase configuration and API origin.
npm run build:packages
npm run dev:admin
```

Use `http://localhost:3001`. Set `APP_STAGE=local`, `ADMIN_WEB_ORIGIN=http://localhost:3001`, `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. HTTPS is required for deployed origins. The app shows setup requirements and fails closed when required configuration is absent or invalid. Never put Supabase secret/service-role keys or the platform allowlist in browser variables.

Configure `PLATFORM_ADMIN_USER_IDS` **on Spring only**, with approved Supabase Auth UUIDs. The frontend has no email/metadata allowlist. Spring validates the bearer JWT and enforces authorization on each platform endpoint. Existing backend and database contracts are unchanged.

## Routes and capabilities

| Route | Behavior |
| --- | --- |
| `/login` | Supabase email/password sign-in with a restricted local return destination. |
| `/` | Actual database overview counts; zero remains zero. |
| `/restaurants` | Authorized registry with server search, pagination, empty/error states and detail links. |
| `/restaurant-details` | Select from the directory; shows only the selected summary from a fresh, authorized registry response. |
| `/provisioning` | Validate and review an unsaved preparation form. Creation and invitations are explicitly unavailable. |
| `/settings` | Verified Auth UUID, backend permission, environment, connection and sign-out. |
| `/access` | Configuration, permission or service recovery screen; logout remains available when Auth is configured. |
| `/auth/callback`, `/auth/accept-invite` | Existing verified Supabase authentication return flows. |

There is no platform restaurant-detail or settings-mutation endpoint. Detail URLs retain the directory's search/page context; if a record moves out of that page, the user selects it again. The member-scoped restaurant API is not substituted for a platform API.

Provisioning is intentionally a preparation preview. The existing shared client withholds the legacy provisioning endpoint because its existing-owner path can assign ownership through a profile email lookup without verified Auth UUID identity. See [the contract gap report](../../docs/api-coverage-gap-report.md). The form makes no mutation requests and stores no draft in browser storage. It creates no restaurant, sends no invitation and requests no QR credential.

## Authentication and permission boundary

- Middleware refreshes Supabase cookies and verifies claims before protected requests. Refreshed cookies and private/no-store headers are propagated.
- A request-scoped server context verifies the UUID identity, obtains the current SDK token and calls the shared `createPlatformAdminApiClient().getOverview()`. Only a successful backend authorization check permits the workspace.
- Both layout and every protected page call the guard, including during client navigation. A middleware-overwritten request path preserves the destination across expired sessions without trusting an incoming header or external return URL.
- Missing/expired identity or API **401** leads to sign-in; **403** shows restricted access; `503 PLATFORM_ADMIN_NOT_CONFIGURED` explains backend setup; unavailable services show recovery actions. Registry/detail requests apply the same error policy after their own API call.
- Tokens are neither serialized into page props nor logged. Business data uses the shared authenticated Spring client with caching disabled. Supabase is used only for authentication.
- SDK logout/account changes leave the workspace with a full navigation to discard the client router cache. Token refresh and visibility changes recheck the server; restored browser-history pages reload. Explicit logout asks for confirmation and reports failure.

## Checks

```powershell
npm run lint
npm run typecheck
npm test
npm run build -w @restaurant-platform/admin-web
```

Tests exercise actual protected page functions, backend permission denial, current-token forwarding, cookie refresh, safe redirects, missing configuration, expiry, HTTP 401/403, registry errors/selection and provisioning validation. API responses in tests are fixtures only; production has no test identity, authorization bypass or seeded statistics.

For live acceptance, use one allowlisted Auth account and one valid non-allowlisted account. Verify login/logout, reload restoration, direct and client navigation, cross-tab logout, expired/rejected tokens, missing backend allowlist, unavailable API, keyboard dialog cancellation, and desktop/mobile layouts. Live acceptance requires a running Spring service and provisioned Supabase accounts; unit tests do not replace it.
