# Auth and invitation setup

The web client uses Supabase Auth email/password sign-in and the official `@supabase/ssr` session client. These steps configure local development and the invitation callback used by the existing Spring Boot Auth Admin client. `NEXT_PUBLIC_API_BASE_URL` is the trusted Spring API origin; configure it in the web environment instead of entering an API host in the dashboard.

## 1. Configure the browser client

Copy `apps/web/.env.example` to `apps/web/.env.local` and set:

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```

Find the project URL and publishable key under Supabase **Project Settings → API** (or the project Connect dialog). The URL and publishable key may be sent to the browser. Never put `SUPABASE_SERVICE_ROLE_KEY`, a secret key, a database password, or Firebase service credentials in `NEXT_PUBLIC_*` variables.

## 2. Configure Supabase Auth URLs

In Supabase Dashboard open **Authentication → URL Configuration**.

For local development set:

- **Site URL:** `http://localhost:3000`
- **Redirect URLs:**
  - `http://localhost:3000/auth/callback`
  - `http://localhost:3000/auth/accept-invite`

For production, use the deployed HTTPS origin:

- **Site URL:** `https://YOUR_WEB_HOST`
- **Redirect URLs:**
  - `https://YOUR_WEB_HOST/auth/callback`
  - `https://YOUR_WEB_HOST/auth/accept-invite`

Add a separate exact entry for every real web origin or local port used (for example, port `3001` if Next.js starts there). Keep production entries exact; do not allow arbitrary hosts.

The backend sends invitations to `SUPABASE_INVITE_REDIRECT_URL`. For local development set this server-side API variable to:

```text
http://localhost:3000/auth/accept-invite
```

For production set it to `https://YOUR_WEB_HOST/auth/accept-invite`, matching the URL allowlist exactly. Restart the API after changing it. `app/api/src/main/resources/application.yml` defaults to the local invite route; deployments must override it.

Keep Supabase's **Invite user** email template using `{{ .ConfirmationURL }}` so Supabase verifies the one-time invitation before redirecting to the configured app route. If you construct a custom `/auth/v1/verify` URL, use `{{ .RedirectTo }}` as its redirect target instead of `{{ .SiteURL }}`. Do not send raw access tokens in a hand-built application URL.

## 3. Enable password sign-in and invitations

In **Authentication → Sign In / Providers → Email**, enable email/password sign-in and choose the project's password policy. The `/login` page validates the email and requires a password. The invitation page requires at least eight characters before calling the SDK's `updateUser` method; if the project policy is stricter, Supabase returns a safe setup error.

The Auth Admin invitation flow still requires server-side API configuration:

- `SUPABASE_PROJECT_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_INVITE_REDIRECT_URL`

The first two are API-only secrets/configuration. The web app never receives the service-role key. Email delivery requires Supabase's configured SMTP/email provider and a reachable mailbox. Resend an expired or already-used invitation through the existing admin/member workflow.

## 4. Test the flow

1. Start the API and web app with the variables above.
2. Open `http://localhost:3000/login` and sign in with a confirmed development Auth user.
3. Confirm `/workspace` loads memberships from `GET /api/v1/my/restaurants`. A user with no restaurant membership still receives the customer profile/address screens after authentication.
4. To test invitation acceptance, trigger an invitation using a reachable test inbox, open the email link, set the new password, and confirm the user reaches `/workspace`. The backend sends the invitation name as Auth metadata, and the existing profile trigger initializes the application profile.
5. Sign out from the visible account menu. Confirm user-specific pages leave the screen and `/login` shows the signed-out state.
6. Open Common QR or Table QR links in a signed-out browser. Public menu and guest checkout must remain available without a Supabase session.

The frontend does not decide OWNER/MANAGER/STAFF/DELIVERY_DRIVER or Platform Admin authorization. Spring validates JWT signature, issuer, audience, and UUID subject; restaurant access is read from server-side memberships, and platform access remains controlled by `PLATFORM_ADMIN_USER_IDS`.

The callback supports Supabase PKCE codes, email token hashes, and the session fragment format used by the existing invite redirect. Callback values are passed to the Supabase SDK and removed from browser history immediately; they are never logged or sent to the Spring API.

See the official [Supabase Next.js server-side auth guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [redirect URL guide](https://supabase.com/docs/guides/auth/redirect-urls), and [user invitations guide](https://supabase.com/docs/guides/auth/users#inviting-users) for project-side behavior.
