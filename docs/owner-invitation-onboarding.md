# Owner invitation and password setup

This change extends the existing Spring Boot/Supabase/Next.js flow. It does not change restaurant ownership, mobile authentication, Firebase, or APK configuration. The migration described below has **not been applied** to a live database. No live email was requested during implementation.

## Audit and root causes

`PlatformRestaurantProvisioningService` already calls `SupabaseAuthAdminClient.inviteByEmail` when provisioning a new owner, then creates the restaurant and OWNER membership. Existing-owner provisioning uses an exact Supabase Auth UUID lookup. Invitation delivery uses Supabase Auth's `/auth/v1/invite` endpoint and its configured email provider. There is no separate application mail queue for invitation messages. An external email request cannot be rolled back with the restaurant database transaction.

The original redirect used a localhost default. A phone resolves localhost to itself, so it cannot reach the development Admin app. The checked-in API configuration also contained a temporary tunnel hostname. The redirect now has no fallback and is validated as an exact public HTTPS `/auth/accept-invite` URL without user information, query, or fragment. Both automatic invitations and existing-owner setup requests use it.

The Admin app already had a public `/auth/accept-invite` handler and a Supabase callback. Its earlier setup flow accepted an ambient session, supported invitation-only token hashes, lacked password confirmation, and directed the owner toward Admin routes after setup. Email confirmation was also labeled accepted onboarding, although it cannot prove password setup. These assumptions are repaired while preserving the separate Platform Admin authorization gate.

Supabase does not expose a trustworthy public `has_password` flag. Invitation verification can generate a temporary password internally. Email confirmation, last sign-in, a nonempty password hash, and user-editable metadata cannot prove the owner selected a password. See the [Supabase verification source](https://github.com/supabase/auth/blob/master/internal/api/verify.go) and [user model](https://github.com/supabase/auth/blob/master/internal/models/user.go).

## Implemented flows

New owner provisioning still requests an automatic invitation. The public HTTPS acceptance page verifies explicit invite/recovery credentials, removes credentials from browser history, verifies the Supabase identity, and asks for password and confirmation. It updates the password, signs in with that password using the provider-returned email, and checks that the Auth UUID stays the same. Completion goes through a same-origin Next server action to the internal API, so a phone never calls a loopback backend URL from its browser.

`POST /api/v1/owner-onboarding/complete` requires a valid Supabase JWT with recent signed `amr.method=password` proof and an active OWNER membership. It records durable completion for that Auth UUID. Signature, issuer, audience, and subject validation use the existing API security configuration. A setup/OTP session alone cannot complete onboarding. Success directs the owner to the existing Operations app. Owners receive no Platform Admin grant.

Restaurant Details includes **Resend Owner Invitation**. Its authenticated server action calls:

```text
POST /api/v1/platform/restaurants/{restaurantId}/owners/{ownerUserId}/invitation
```

The request has no recipient email, redirect, or role body. The backend requires the server-side Platform Admin UUID allowlist, resolves the exact active OWNER membership for that restaurant, then resolves the same Auth UUID through Supabase Admin. It requests `/auth/v1/recover` for that identity's registered email. It does not invite, delete, recreate, or reassign the existing user. Supabase [recovery](https://github.com/supabase/auth/blob/master/internal/api/recover.go) supports this existing-user flow; another [invite](https://github.com/supabase/auth/blob/master/internal/api/invite.go) can reject a registered account.

The response says the provider accepted the email **request**. It cannot promise inbox delivery. Provider errors return safe structured failures without tokens, service keys, email bodies, or provider payloads. There is no automatic retry of email requests. The durable attempt reservation is committed before the provider request, so provider failures and timeouts still consume the cooldown. Per-owner and per-operator limits protect against repeated or cross-restaurant submissions. Attempt records contain UUIDs, timestamps, and outcomes for audit.

| Setup state | Meaning and action |
| --- | --- |
| `UNKNOWN` | No trusted completion marker. This includes legacy accounts that may already have a password. A setup/recovery email is available with that limitation explained. |
| `COMPLETE` | The API previously recorded verified password login. Invitation resend is blocked. Use Operations sign-in or `/auth/recover` for a forgotten password. |
| `UNAVAILABLE` | Provider identity or onboarding storage could not be verified. No safe resend is offered. Restore configuration/storage first. |

Invitation delivery/confirmation state remains a separate compatibility field. It is never used as password completion evidence. Completion is a historical proof of a password login, not a guarantee that a password has never subsequently changed. Missing legacy markers are deliberately not backfilled from email confirmation.

The public recovery page uses Supabase's public reset-password API through a server action with a fixed configured HTTPS return URL, generic feedback, and provider rate limits. It is an account recovery path, not a Platform Admin management action. Supabase rate limits/CAPTCHA and SMTP configuration must suit the deployment. See [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits).

## Database preparation — review only

Review `supabase/migrations/20261112090000_owner_account_onboarding.sql`. It creates server-owned completion and invitation-attempt tables with restrictive privileges/RLS and no user-writable completion policies. The API's trusted database principal must have the privileges required by the migration. Durable reservations use PostgreSQL transactions and advisory locking to serialize owner/operator limits across API instances.

**Do not run this migration on live Supabase without explicit authorization.** It must be applied to an approved local/staging database before integration testing these features. Without it, onboarding management reports unavailable and mutation requests fail safely. It does not insert or modify any existing Auth user, restaurant, or membership.

## Environment configuration

Spring reads process environment variables. The root `.env.example` is a reference file and is not loaded automatically.

| Process | Variable | Required value/purpose |
| --- | --- | --- |
| API | `SUPABASE_PROJECT_URL` | HTTPS origin of the existing Supabase project |
| API | `SUPABASE_SERVICE_ROLE_KEY` | Server secret for Auth Admin requests; never a `NEXT_PUBLIC_*` value |
| API | `SUPABASE_INVITE_REDIRECT_URL` | `https://<configured-admin-host>/auth/accept-invite`, exact, no query/fragment |
| API | `PLATFORM_ADMIN_USER_IDS` | Approved operator Auth UUIDs; empty fails closed |
| API | `SUPABASE_AUTH_ISSUER`, `SUPABASE_JWKS_URL` | Existing project's issuer/JWKS with the correct asymmetric signing algorithm |
| API | `APP_SECURITY_JWT_REQUIRED_AUDIENCE` | `authenticated` |
| API | `SUPABASE_DB_URL`, `SUPABASE_DB_USERNAME`, `SUPABASE_DB_PASSWORD` | Existing server-only database connection with reviewed migration |
| Admin | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Existing project's public browser configuration; no service secret |
| Admin | `SUPABASE_INVITE_REDIRECT_URL` | Same exact HTTPS acceptance URL for the public recovery server action |
| Admin | `ADMIN_WEB_ORIGIN` | Public HTTPS Admin origin used by email recipients |
| Admin | `NEXT_PUBLIC_API_BASE_URL` | Backend origin used by authenticated server actions; local tunnel testing can retain `http://127.0.0.1:8080` internally |
| Admin | `APP_STAGE` | `staging` for approved HTTPS tunnel tests, `production` for production. `local` permits only HTTP loopback Admin origins. |

`APP_PUBLIC_WEB_BASE_URL` still serves existing workspace/QR links. Configure it independently for the actual compatible guest/workspace host. It does not replace the invitation redirect variable. No mobile environment change is required. Preserve the existing Supabase project and Auth UUIDs.

The local audit found public Admin Supabase configuration present but API Supabase Admin/redirect variables absent from process/user/machine environments. No active backend/Admin/tunnel listener was observed during the audit. Actual secret values were not printed. Public HTTPS reachability, Supabase Dashboard settings, SMTP configuration, and inbox delivery have not been verified.

## Supabase Dashboard and HTTPS setup

1. Choose the public HTTPS Admin origin. For development, an approved HTTPS tunnel may forward to the existing Admin port 3001. Set `APP_STAGE=staging` and `ADMIN_WEB_ORIGIN=https://<configured-admin-host>` for that test process; leaving `APP_STAGE=local` rejects a public Admin origin. Configure the matching acceptance URL in runtime environment variables, never in source. Keep the tunnel running while testing. A stable controlled hostname with valid TLS is required for production.
2. In the existing Supabase project, open **Authentication → URL Configuration**. Set **Site URL** to the public HTTPS Admin origin. Add the exact `/auth/accept-invite` URL to **Redirect URLs**. Retain `/auth/callback` entries that existing sign-in flows still require. Avoid broad wildcard production entries.
3. In **Authentication → Email Templates**, configure **Invite user** and **Reset password** for the explicit token-hash handlers below. The acceptance redirect must have no existing query/fragment. Keep required branding/content and avoid email click tracking that rewrites Auth links. Supabase's [template reference](https://supabase.com/docs/guides/auth/auth-email-templates) documents these variables.

```html
<!-- Invite user template -->
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=invite">Set up account</a>

<!-- Reset password template, also used for existing-owner setup -->
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery">Set up password</a>
```

4. Under the project's email/SMTP settings, verify a permitted sender, custom SMTP credentials, provider limits, and email logs. Supabase sends the message; the application does not run its own mail service. Built-in email delivery has restrictions. Provider HTTP acceptance is not proof of delivery. Do not place SMTP or service secrets in browser configuration.
5. Restart API and Admin with the reviewed environment. Check the HTTPS acceptance and recovery routes from a phone without a preexisting session. Link scanners may consume one-use credentials; request a fresh email after an expired/used link. Never paste real links/tokens into tickets or logs.

Token-hash verification does not depend on a PKCE verifier in the browser that originally initiated the email. Existing supported PKCE/legacy return forms still undergo verification; failed credentials never fall back to an unrelated ambient session. Password changes use an isolated in-memory client pinned to the verified identity, protecting against another tab changing the shared session. Auth return responses use no-store, no-referrer, and noindex headers. Cookies are Secure for HTTPS/staging/production with SameSite=Lax; plain loopback development remains supported.

## Windows manual setup, in order

These commands are a manual reference. They have not been used to change live configuration, apply a live migration, or send email. Keep the existing restaurant and owner. The current HTTPS hostname is only needed when performing these manual steps; an earlier Quick Tunnel hostname must not be reused on assumption.

### 1. Establish the public Admin origin

For an approved development tunnel, run the following in its own terminal and read the **new** HTTPS origin from its output. Leave that process running. This exposes the existing Admin server on port 3001, including its existing authentication gates.

```powershell
cloudflared tunnel --url http://127.0.0.1:3001
```

For production, use a stable controlled HTTPS hostname and reverse proxy to the Admin service. Do not publish the backend just to support password setup. The browser talks to Supabase over HTTPS and posts completion to its own public Admin origin. Next then calls Spring server-side. Loopback is valid internally only when Next and Spring run on the same machine/network namespace; separate hosts need an appropriate reachable backend origin.

Copy the actual origin into each relevant process environment. Do not put it into source code. A tunnel change requires updating both processes, the Supabase redirect allowlist, and any email links issued afterward.

### 2. Review the database change before approving application

Use an approved staging database first. Confirm the target database/project and migration history. Check that `auth.users` has `id`, `deleted_at`, and `banned_until`; `public.restaurant_members` has `id`, `restaurant_id`, `user_id`, and `role`; and `public.restaurants` has `id` and `is_active`. The trusted API database principal needs access to the new tables and SELECT/row-lock privileges on the authoritative tables (`FOR UPDATE` requires UPDATE privileges on its lock targets). The existing privileged API connection is the intended boundary; do not grant these privileges to browser roles. A restricted API principal needs a separately reviewed privilege/RLS configuration before use. RLS/revokes intentionally prevent `anon` and `authenticated` clients from reading audit rows or forging completion.

The migration creates two empty tables and two indexes, plus comments and privilege restrictions. It contains no backfill or changes to existing users, restaurants, memberships, or their grants. It is a one-time migration and intentionally fails if the new table names already exist. Foreign-key cascades affect the new tracking rows only if a referenced identity/restaurant is later deleted; this feature never performs those deletes. Include the migration in the normal migration ledger and apply it once.

**Live application remains pending explicit approval.** After approval for the verified target, use the team's normal Supabase migration process, or apply this exact file atomically through an approved database connection. This alternative prompts for the database password rather than embedding it in a command or file:

```powershell
$env:PGSSLMODE = 'require'
psql --host '<approved-db-host>' --port 5432 --username '<approved-db-role>' --dbname postgres --password --set=ON_ERROR_STOP=1 --single-transaction --file 'C:\RestaurantManagementSystem\Restaurant-Platform\supabase\migrations\20261112090000_owner_account_onboarding.sql'
```

Do not apply the SQL separately if the normal migration process already applied it. Do not use a reset, schema recreation, or user recreation. Record the existing San Thaw Tar OWNER membership UUID before and after the approved test.

### 3. Configure Supabase without sending email

In the existing project, set Site URL to the actual HTTPS Admin origin and allowlist its exact `/auth/accept-invite` URL. Configure the Invite user and Reset password templates shown above, and preserve required callback entries. Configure/verify SMTP sender, provider credentials, delivery restrictions, and rate limits. No test email or Admin resend action is needed to save configuration. Never copy service-role/SMTP credentials into public Next or Expo variables.

### 4. Start Spring Boot with its process environment

Inject the existing database, JWT, Supabase Admin, and operator UUID settings from the environment table above. Spring does not read the root `.env` as dotenv. Use the existing Supabase project and OWNER identity. In the API terminal, set the nonsecret values below with the **actual** hostname:

```powershell
Set-Location 'C:\RestaurantManagementSystem\Restaurant-Platform'
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-21'
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
$maven = 'C:\Program Files\JetBrains\IntelliJ IDEA 2025.2.3\plugins\maven\lib\maven3\bin\mvn.cmd'
$publicAdminOrigin = 'https://<actual-current-admin-host>'
$env:SUPABASE_INVITE_REDIRECT_URL = "$publicAdminOrigin/auth/accept-invite"
$env:SERVER_ADDRESS = '127.0.0.1'
$env:PORT = '8080'
& $maven -f app/api/pom.xml spring-boot:run
```

Use the normal secure method to supply `SUPABASE_SERVICE_ROLE_KEY` and the database password before starting. Keep existing Firebase settings. Check `http://127.0.0.1:8080/actuator/health` locally. Missing onboarding storage must show unavailable rather than false completion. An incorrect redirect must fail before any provider email request.

### 5. Build and start the Admin app with matching settings

In a separate terminal, load the existing public Supabase URL/publishable key and set the following before building. Next inlines public variables during its build, so changing `NEXT_PUBLIC_*` requires a web rebuild. This does not require an APK rebuild.

```powershell
Set-Location 'C:\RestaurantManagementSystem\Restaurant-Platform'
$publicAdminOrigin = 'https://<actual-current-admin-host>'
$env:APP_STAGE = 'staging'
$env:ADMIN_WEB_ORIGIN = $publicAdminOrigin
$env:SUPABASE_INVITE_REDIRECT_URL = "$publicAdminOrigin/auth/accept-invite"
$env:NEXT_PUBLIC_API_BASE_URL = 'http://127.0.0.1:8080'
# Existing NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set.
npm run build:packages
npm run build -w @restaurant-platform/admin-web
npm run start -w @restaurant-platform/admin-web
```

Use `APP_STAGE=staging` for this HTTPS tunnel test. `APP_STAGE=local` only accepts an HTTP localhost Admin origin. A production deployment uses `APP_STAGE=production` and HTTPS deployment origins according to the existing production validation. The internal loopback example above is for the local staging/tunnel process.

### 6. Check HTTPS reachability before authorizing email

From a phone, open `https://<actual-current-admin-host>/auth/accept-invite` and `/auth/recover`. A bare acceptance URL should show an invalid/missing-link message after verification; it must not silently reuse another session. Confirm HTTPS is valid and restaurant details still require Platform Admin access. A bare page check does not send email. Use browser developer tools on desktop to confirm no browser request targets `localhost:8080` or `127.0.0.1:8080`; completion is a same-origin server action.

Only after explicit authorization to send a real email, run the existing-owner test below. Until then, leave **Resend owner invitation** and **Request recovery email** unsubmitted.

## Manual test using the existing San Thaw Tar restaurant

Use restaurant `2c62c49f-2310-4999-961f-81f79b868b0c`, slug `san-thaw-tar`. Complete the approved migration and external configuration first. These steps send real emails and have not been run by the agent.

1. Sign in as an allowlisted Platform Admin. Open the existing restaurant's details. Verify its existing owner UUID/email and membership are unchanged. Legacy completion should display unknown with a truthful explanation.
2. Request **Resend Owner Invitation** once. Verify the accepted-request feedback and cooldown. Check Supabase/provider logs and the actual recipient inbox. Try a repeated request and confirm it is limited. Do not create another restaurant or user.
3. Open the newest HTTPS link on a phone/private browser. Verify the acceptance page is public. Mismatched/short passwords must fail locally. Set a password and confirm it. Verify completion feedback and the same owner Auth UUID. The platform-admin dashboard must still deny this owner.
4. Refresh restaurant details as the operator. Verify completion and disabled invitation resend. A direct resend must return conflict. The password-recovery page should offer generic feedback without disclosing whether an address exists.
5. Open the already installed Operations APK, connect USB, and run `adb reverse tcp:8080 tcp:8080`. Keep the local backend running on port 8080. Sign in with the registered owner email and new password. Verify backend-confirmed active OWNER access for San Thaw Tar. No Admin role is needed.
6. Test a used/expired/malformed link and another restaurant's owner ID. The former offers a new recovery path; the latter must be rejected before any email request. A non-operator must receive 403 from the management endpoint.
7. With an approved test provider/configuration, verify provider failure and missing HTTPS configuration produce safe errors and no false success. A provider failure still consumes the local cooldown. Do not disturb the real owner account to simulate failures.

## APK compatibility

The Operations app already calls Supabase `signInWithPassword`, then requires the backend's configured active restaurant membership. The new web password belongs to the same Supabase Auth identity. No mobile source, native project, Firebase client, branding, package ID, API origin, or Google Maps configuration is changed by this feature. Existing Customer and Operations USB APKs can be reused without rebuilding.

Existing artifacts remain under `target/android-fcm/usb/` with their original verification evidence. Operations is `san-thaw-tar-operations-development-usb.apk`, package `com.restaurantplatform.santhawtar.operations.dev`, API `http://127.0.0.1:8080`. Real account setup, email arrival, and subsequent device sign-in remain manual integration requirements.

## Verification and change inventory

Implementation verification results and the exact task file inventory are recorded in `target/owner-onboarding/verification.md`. Checks use isolated test doubles or local processes. No fake provider response is used to claim real email delivery, and no live migrations, Auth mutations, deployment, commits, pushes, or merges are performed.
