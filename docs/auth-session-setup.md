# Auth and invitation setup

**Status:** M2 authentication foundation, reviewed 2026-10-31. The new clients use Supabase Auth adapters for email/password sessions. Local automated checks and external verification limits are recorded in [M2 acceptance](m2-acceptance.md). Real project sign-in, invitation email delivery, device persistence, and SMS are not certified by mocked tests. Preserve the working production origin and settings until the replacement passes the [URL migration plan](production-url-migration.md).

## Current backend contract

Supabase Auth remains the identity provider. Spring Boot validates the bearer JWT signature, issuer, audience, expiry, and UUID subject. Spring is the enforcement boundary for platform administrator allowlists, restaurant membership/roles, customer ownership, and delivery assignment policy; any remaining backend authorization gaps must be resolved there. A frontend role label or restaurant hint never grants access. `docs/api.md` remains the HTTP contract.

The backend invitation flow uses the server-side values `SUPABASE_PROJECT_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_INVITE_REDIRECT_URL`. The Auth Admin client sends the redirect value as `redirect_to`. The default in `app/api/src/main/resources/application.yml` is `http://localhost:3000/auth/accept-invite`; this is a local source default, not evidence that production has been migrated. Service-role and database credentials must never enter a browser/mobile bundle or `NEXT_PUBLIC_*` variable.

## M2 browser configuration

Both Next.js applications use `@supabase/ssr` and `@supabase/supabase-js` with only the public Supabase project URL and publishable key. Configure each app locally from its `.env.example`:

| Application | Local public settings | Auth boundary |
| --- | --- | --- |
| `apps/admin-web` | `APP_STAGE=local`, `ADMIN_WEB_ORIGIN=http://localhost:3001`, `NEXT_PUBLIC_API_BASE_URL=http://localhost:8080`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Email/password login and local sign-out; verified session restoration; Spring Platform Admin endpoint decides platform access. |
| `apps/guest-web` | `GUEST_CONFIG_ENV=staging`, `NEXT_PUBLIC_API_BASE_URL=http://localhost:8080`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Auth return adapters are available independently from anonymous QR ordering; guest requests do not acquire a bearer token. |

The adapters reject secret/service-role key forms and origins with credentials, paths, queries, or fragments. Next 15 uses `middleware.ts` to refresh auth cookies before server rendering. Server code verifies claims; it does not authorize a user from an unverified cookie or `getSession()` result. The SDK owns refresh-token exchange. Client code receives narrow Auth methods rather than a Supabase database client. See the official [Supabase SSR client guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client).

## Android configuration and persistence

Operations and Customer remain separate application projects and Android identities. Each requires `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in addition to the existing restaurant build configuration. These are public values; provider, database, JWT-signing, and service-role secrets remain server-side.

Native adapters use Expo SecureStore for session persistence with a namespace containing app kind, configured restaurant UUID, and Supabase project host. The Supabase SDK refreshes the session, and app lifecycle handlers start refresh in the foreground and stop it in the background. Access-token reads refresh a near-expiry session and reject a changed Auth UUID. Sign-out clears the local session; raw credentials are excluded from observable UI snapshots. Restored native identity is a hint until Spring validates its JWT and the requested operation.

Android bundle export verifies JavaScript compilation only. A real device/emulator check is still required for SecureStore persistence, lifecycle transitions, local sign-out, and network/provider failures. See the official [Supabase React Native guide](https://supabase.com/docs/guides/auth/quickstarts/react-native) and [Expo SecureStore reference](https://docs.expo.dev/versions/latest/sdk/securestore/).

## Supabase Auth URL configuration

In Supabase Dashboard, inspect **Authentication → URL Configuration** for the actual project/environment. Keep exact redirect entries for the current working origin, including:

- `https://CURRENT_WEB_HOST/auth/callback`
- `https://CURRENT_WEB_HOST/auth/accept-invite`

The prior local-development examples were `http://localhost:3000/auth/callback` and `http://localhost:3000/auth/accept-invite`. Add exact staging/production Admin or Guest callback URLs after real project code/token exchange and session handling pass end-to-end tests. If one central auth origin handles many restaurant domains, allowlist that origin instead of broadly wildcarding tenant hosts. Native email-link callbacks need separate exact deep-link/app-link tests and are not implied by email/password support. Supabase Site URL is a fallback and not a restaurant router.

Do not remove old allowlist entries or point `SUPABASE_INVITE_REDIRECT_URL` at an unverified replacement. The backend must keep sending invitations to a working `/auth/accept-invite` URL. Once a replacement passes staging acceptance, set the server variable to its exact HTTPS route, add that route to the allowlist first, then restart/redeploy the API in a controlled cutover. Previously emailed invitations still need their original landing route.

Keep Supabase's **Invite user** email template using `{{ .ConfirmationURL }}` so Supabase verifies the one-time invitation before redirecting to the configured app route. If a custom `/auth/v1/verify` URL is constructed, use `{{ .RedirectTo }}` as its target instead of `{{ .SiteURL }}`. Do not hand-build an application URL with raw access tokens.

## Replacement callback and invitation acceptance

A production implementation must support the callback forms used by existing Supabase email flows: PKCE code, supported email token hash, and the invitation session fragment. Pass credentials to the official SDK, remove callback credentials from browser history immediately, and never log or forward them to the Spring API. The invitation flow must handle expired/used links safely, let the invited user establish a password according to the configured Supabase policy, and return to an authorized destination after backend membership checks.

Email/password and future phone/SMS onboarding are separate features. Matching email or phone text alone must not attach a restaurant membership to a different Auth UUID. [Phone authentication and linking design](phone-auth-design.md) specifies the closed gate, same-UUID linking flow, and proposed server claim contract. The current platform provisioning endpoint's existing-email lookup is an [incompatible identity contract](api-coverage-gap-report.md) and is omitted from the callable M2 Platform Admin client.

## Staging acceptance before changing production URLs

1. Configure a staging Supabase project, exact callback/accept-invite allowlist, staging API origin, and test mailbox.
2. Validate the Admin/Guest/native adapters against that staging project, including real cookie refresh and native persistence. Mocked SDK tests do not satisfy this gate.
3. Test sign-in, session restore/refresh, sign-out, expired invitation, resend, password setup, safe return URL, and non-admin/other-tenant denial.
4. Test a signed-out Common QR and Table QR link separately; public guest ordering must not require a Supabase session.
5. Verify the old working origin and outstanding invitation links continue to function before and after any cutover.

The [production URL migration plan](production-url-migration.md) covers `APP_PUBLIC_WEB_BASE_URL`, `SUPABASE_INVITE_REDIRECT_URL`, Supabase Auth allowlists, and `APP_CORS_ALLOWED_ORIGINS` together. M2 does not authorize changing production traffic, credentials, or these settings.
