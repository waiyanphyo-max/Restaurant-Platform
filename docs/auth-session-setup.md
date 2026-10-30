# Auth and invitation setup

**Status:** M1 foundation. The previous `apps/web` browser session and invitation UI was removed in M0. The new Admin and Guest starter routes are not complete Supabase auth flows and must not receive production callbacks or invitations. Preserve the existing working production origin and settings until the replacement passes the [URL migration plan](production-url-migration.md).

## Current backend contract

Supabase Auth remains the identity provider. Spring Boot validates the bearer JWT signature, issuer, audience, expiry, and UUID subject. Spring is the enforcement boundary for platform administrator allowlists, restaurant membership/roles, customer ownership, and delivery assignment policy; any remaining backend authorization gaps must be resolved there. A frontend role label or restaurant hint never grants access. `docs/api.md` remains the HTTP contract.

The backend invitation flow uses the server-side values `SUPABASE_PROJECT_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_INVITE_REDIRECT_URL`. The Auth Admin client sends the redirect value as `redirect_to`. The default in `app/api/src/main/resources/application.yml` is `http://localhost:3000/auth/accept-invite`; this is a local source default, not evidence that production has been migrated. Service-role and database credentials must never enter a browser/mobile bundle or `NEXT_PUBLIC_*` variable.

## M1 browser configuration

The new web starters expose local API-origin examples, but they do not yet include a Supabase browser session SDK or functional auth callbacks:

| Starter | Local nonsecret settings | Current auth state |
| --- | --- | --- |
| `apps/admin-web` | `APP_STAGE=local`, `ADMIN_WEB_ORIGIN=http://localhost:3001`, `NEXT_PUBLIC_API_BASE_URL=http://localhost:8080` | Platform Admin shell only; callback/invite entry is not a working sign-in. |
| `apps/guest-web` | `GUEST_CONFIG_ENV=staging`, `NEXT_PUBLIC_API_BASE_URL=http://localhost:8080` | Guest tenant/legacy route foundation only; callback/invite entry is not a working sign-in. |

No real restaurant configuration is bundled. The M1 `.env.example` files are examples, not deployment credentials. When auth is implemented, a web browser may receive the Supabase project URL and publishable key; the service-role key remains API-only. Reuse an official supported Supabase SDK/session adapter and keep private requests bound to a trusted Spring API origin.

## Supabase Auth URL configuration

In Supabase Dashboard, inspect **Authentication → URL Configuration** for the actual project/environment. Keep exact redirect entries for the current working origin, including:

- `https://CURRENT_WEB_HOST/auth/callback`
- `https://CURRENT_WEB_HOST/auth/accept-invite`

The prior local-development examples were `http://localhost:3000/auth/callback` and `http://localhost:3000/auth/accept-invite`. Add exact staging/production Admin or Guest callback URLs only after those routes perform real code/token exchange and session handling. If one central auth origin handles many restaurant domains, allowlist that origin instead of broadly wildcarding tenant hosts. Native Operations and Customer apps need separate exact deep-link/app-link callbacks and application IDs when native auth is implemented. Supabase Site URL is a fallback and not a restaurant router.

Do not remove old allowlist entries or point `SUPABASE_INVITE_REDIRECT_URL` at an M1 stub. The backend must keep sending invitations to a working `/auth/accept-invite` URL. Once a replacement passes staging acceptance, set the server variable to its exact HTTPS route, add that route to the allowlist first, then restart/redeploy the API in a controlled cutover. Previously emailed invitations still need their original landing route.

Keep Supabase's **Invite user** email template using `{{ .ConfirmationURL }}` so Supabase verifies the one-time invitation before redirecting to the configured app route. If a custom `/auth/v1/verify` URL is constructed, use `{{ .RedirectTo }}` as its target instead of `{{ .SiteURL }}`. Do not hand-build an application URL with raw access tokens.

## Replacement callback and invitation acceptance

A production implementation must support the callback forms used by existing Supabase email flows: PKCE code, supported email token hash, and the invitation session fragment. Pass credentials to the official SDK, remove callback credentials from browser history immediately, and never log or forward them to the Spring API. The invitation flow must handle expired/used links safely, let the invited user establish a password according to the configured Supabase policy, and return to an authorized destination after backend membership checks.

Email/password and future phone/SMS onboarding are separate features. Matching email or phone text alone must not attach a restaurant membership to a different Auth UUID. Phone linking requires verified same-UUID handling and an authorized invitation contract before rollout.

## Staging acceptance before changing production URLs

1. Configure a staging Supabase project, exact callback/accept-invite allowlist, staging API origin, and test mailbox.
2. Implement real Admin/Guest/native auth adapters; the M1 stubs do not satisfy this gate.
3. Test sign-in, session restore/refresh, sign-out, expired invitation, resend, password setup, safe return URL, and non-admin/other-tenant denial.
4. Test a signed-out Common QR and Table QR link separately; public guest ordering must not require a Supabase session.
5. Verify the old working origin and outstanding invitation links continue to function before and after any cutover.

The [production URL migration plan](production-url-migration.md) covers `APP_PUBLIC_WEB_BASE_URL`, `SUPABASE_INVITE_REDIRECT_URL`, Supabase Auth allowlists, and `APP_CORS_ALLOWED_ORIGINS` together. No M1 starter should be deployed in place of the working production frontend.
