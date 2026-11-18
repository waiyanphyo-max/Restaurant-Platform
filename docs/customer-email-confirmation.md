# Customer email confirmation and return to sign-in

The previous Customer Auth adapter sent neither `emailRedirectTo` on signup nor a redirect option on confirmation resend. Supabase therefore used its global Site URL. The existing native link boundary correctly rejected unknown routes, so that global browser destination could not return a customer to the branded app.

Signup and resend now select the same build-scoped confirmation destination. Confirmation never imports a session into Customer shopping, owner/admin browser Auth, or password recovery. The existing customer PKCE storage and restoration remain unchanged. The customer signs in with email/password after verification. If the device already has a signed-in customer, the existing session is retained; an incoming link cannot replace that identity.

## Callback contracts

With no `EXPO_PUBLIC_CUSTOMER_CONFIRMATION_URL`, signup/resend use the already configured custom scheme:

| Build | `san-thaw-tar` destination |
| --- | --- |
| Development | `rp-san-thaw-tar-customer-development://email-confirmation` |
| Staging | `rp-san-thaw-tar-customer-staging://email-confirmation` |
| Production | `rp-san-thaw-tar-customer://email-confirmation` |

This works with the existing Supabase `ConfirmationURL` email link: Supabase verifies the email first, then returns a PKCE code or an error. The app removes the external credentials from routing, ignores the PKCE code for session creation, and opens the sign-in screen. A returned code is not treated as independently verified evidence: the message asks the customer to sign in, and Supabase remains authoritative about whether their email is confirmed. Expired/invalid links display a useful error and manual return to sign-in/resend. No confirmation code, token, email, or arbitrary return URL is forwarded into app navigation parameters or stored on disk.

For the recommended install/unavailable-app fallback, deploy Guest Web on a **reviewed stable HTTPS tenant hostname**, register it in `configs/restaurants/<slug>.json`, and set:

```text
EXPO_PUBLIC_CUSTOMER_CONFIRMATION_URL=https://<reviewed-guest-host>/auth/customer-confirmation/<development|staging|production>/<restaurant-slug>
```

The origin must exactly equal that build's embedded `guestBaseUrl`; the entire path must match its environment and slug. Credentials, ports, query strings, fragments, placeholder hosts and temporary tunnels are rejected. The callback page resolves the incoming `Host` directly against the reviewed registry and its `GUEST_CONFIG_ENV`. Forwarded-host headers do not choose a tenant. Staging web may host the development callback and staging callback; production hosts only production. Wrong tenants/environments, ambiguous ownership and unknown hostnames fail closed. There is no `next`, `returnTo`, URL-supplied scheme or open redirect.

After a successful provider return, the HTTPS page attempts the fixed, token-free native scheme and retains an **Open Customer App** link plus manual installation/sign-in instructions. Browser restrictions may require that explicit tap. If the app is unavailable, the page stays readable. Custom schemes alone cannot provide an HTTPS fallback when the app is absent; use the reviewed HTTPS option for release acceptance.

The current `san-thaw-tar` development/staging hostname is a Cloudflare Quick Tunnel and the production entries are placeholders. They were preserved. They are **not accepted as stable confirmation callbacks**. Selecting and hosting a real hostname is a manual release configuration requirement; no hostname was fabricated and no live configuration was changed.

The handler also supports an explicitly configured token-hash signup link (`?token_hash=...&type=email`, or `type=signup`). It removes the credential from visible browser history before Auth verification, verifies through a fresh nonpersisted client, checks the verified user, and signs out that isolated local session. Recovery/invitation hashes and mixed/duplicate credential formats are rejected. The token-free native handoff is informational only and cannot authenticate anyone. The default `ConfirmationURL` flow needs no token-hash template change and avoids sharing the native PKCE verifier with a browser.

## Manual Supabase Dashboard configuration

Perform these changes manually in the intended development/staging/production project after deploying the relevant callback. Do not copy a development hostname or key into production.

1. Open **Authentication → Providers / Sign In → Email** and verify **Confirm email** is enabled for the intended project. Keep existing password/recovery policy. The app must not use a service-role/secret key.
2. Open **Authentication → URL Configuration**. Preserve the existing **Site URL** used by owner/admin and other installed clients. Site URL is the fallback when no valid redirect is supplied; changing it globally can alter those flows. This implementation supplies its own destination and does not require changing Site URL.
3. Under **Redirect URLs**, add each exact customer URL required for that environment. For a development `san-thaw-tar` build, add `rp-san-thaw-tar-customer-development://email-confirmation`. For staging add its `-staging` URL; production has no suffix. Add the exact stable HTTPS callback above when using the web fallback. Preserve existing `/auth/callback`, `/auth/accept-invite`, owner/admin recovery URLs and legacy allowlist entries still used by installed clients. Do not add wildcard hosts, arbitrary `**` paths, or Quick Tunnel URLs as production authentication callbacks.
4. Open **Authentication → Email Templates → Confirm signup**. Keep a link to `{{ .ConfirmationURL }}`:

   ```html
   <p><a href="{{ .ConfirmationURL }}">Confirm your email</a></p>
   ```

   Supabase places the validated `emailRedirectTo` into the confirmation URL's `redirect_to` parameter. Resend uses the same destination. A template hardcoded to `{{ .SiteURL }}` can discard this destination; restore `{{ .ConfirmationURL }}` for this flow. **Do not change Invite user or Reset password templates.** The separate customer reset-code gate still requires its reviewed `{{ .Token }}` template configuration.
5. If deliberately adopting direct token-hash confirmation instead of `ConfirmationURL`, review **every signup client sharing that project** first. A query-free HTTPS `RedirectTo` destination can use `<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=email">Confirm your email</a>`. All participating signup clients must supply a compatible reviewed HTTPS callback, and this must not be copied into invite/recovery templates. Do not send bearer token hashes directly to custom schemes: another installed application can claim a scheme. The default PKCE code return does not transfer a shopping session. This optional global template change is unnecessary for the default flow and was not performed.
6. Save configuration only after recording existing values for rollback. Send a **new** test signup/resend email after allowlist/template changes. Already issued email links can retain old destinations and still need their legacy routes.

Supabase docs: [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [email templates](https://supabase.com/docs/guides/auth/auth-email-templates), [password-based authentication](https://supabase.com/docs/guides/auth/passwords), and [JavaScript signup options](https://supabase.com/docs/reference/javascript/auth-signup).

## Android and deployment ordering

1. Deploy Guest Web callback code to the stable registered hostname with matching `GUEST_CONFIG_ENV`, `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Keep HTTPS and `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`, and `X-Content-Type-Options: nosniff`. Ingress/access logs must redact auth query parameters (`code`, `token_hash`, errors containing provider details); never enable analytics or third-party embeds on confirmation pages.
2. Manually add the exact Supabase redirect allowlist entries and retain existing owner/admin entries/templates.
3. Build or serve the Customer bundle with matching environment/restaurant and optional HTTPS callback value. Confirm signup and resend before shipping it. This task introduces no native dependency, permission, scheme change or Android intent-filter change. An existing matching development client can load the JavaScript through Metro. A distributable APK must be rebuilt to include the changed JavaScript/public configuration. Changing the registered native scheme, application ID, guest App Link origin/path, signing certificate or other native config requires an APK rebuild and reinstallation as usual.
4. Existing App Links remain confined to `/app/customer/`; the HTTPS `/auth/customer-confirmation/...` page intentionally stays in the browser until verification. The existing custom scheme opens the app afterwards. No new Android App Links/Digital Asset Links association is required for this implementation. Existing release App Links still need their normal reviewed `/.well-known/assetlinks.json` and signing fingerprints; do not broaden their prefix over auth callbacks without a separate security review.
5. Older APKs retain their original signup redirect behavior and cannot handle the new confirmation route until updated. Preserve the original Site URL and web callbacks during rollout. Emails issued before an upgrade may use old destinations. Customers can always open the updated app manually, request a new confirmation email and sign in after verification.

## Windows PowerShell and device checks

From `C:\RestaurantManagementSystem\Restaurant-Platform`, with Android Platform Tools installed and the test phone connected:

```powershell
$env:RESTAURANT_SLUG = 'san-thaw-tar'
$env:MOBILE_ENV = 'development'
$env:MOBILE_ADB_REVERSE_ENABLED = 'true'
$env:MOBILE_DEVELOPMENT_API_BASE_URL = 'http://127.0.0.1:8080'
# Supply matching public Supabase values through your existing secure development setup.
# Leave empty for native return while a reviewed HTTPS hostname is unavailable.
$env:EXPO_PUBLIC_CUSTOMER_CONFIRMATION_URL = ''
adb reverse tcp:8080 tcp:8080
adb reverse tcp:8083 tcp:8083
npm run start:customer -- --port 8083
```

For the HTTPS fallback, first replace the reviewed guest configuration with the approved stable host, deploy it with `GUEST_CONFIG_ENV=staging`, and set the exact `/auth/customer-confirmation/development/san-thaw-tar` URL in the mobile environment and Supabase allowlist. A local Guest Web server on port 3002 is useful for layout/tests, but loopback and Quick Tunnels are not stable emailed production callbacks.

Test the token-free native handoff independently without pasting live auth credentials into a shell:

```powershell
adb shell am start -W -a android.intent.action.VIEW -d 'rp-san-thaw-tar-customer-development://email-confirmation?result=returned' com.restaurantplatform.santhawtar.customer.dev
```

Real-device checklist (manual, not claimed by automated tests):

1. Create a synthetic test customer. Verify the app explains email confirmation, clears password fields and stays signed out. Open the real email from the phone, confirm it, and verify the correct restaurant/environment sign-in screen opens. Sign in with the verified password.
2. Request a fresh confirmation and try an expired, consumed and malformed link. Verify a useful failure or safe sign-in prompt without token/provider-detail exposure. Resend from sign-in and confirm that it uses the same destination.
3. With the app unavailable (use an isolated device/browser or test installation), open a fresh link to the stable HTTPS callback. Verify readable results, **Open Customer App**, installation/manual sign-in guidance, and no redirect loop. Reinstall/open the intended app and sign in.
4. Try a different tenant's hostname/path and a production URL against staging. Verify no Auth request/handoff is made by rejected pages. Do not send live credentials to third-party hosts while testing.
5. Keep an existing owner/admin session open in the browser, complete Customer confirmation, and verify that owner's identity/session remains unchanged. Exercise the existing owner invitation/password setup and recovery links separately. Customer reset email/code and normal session restoration must still work.
6. Repeat cold-start/warm-app return, background/foreground, manual return to sign-in, and already-signed-in customer cases. Verify no confirmation URL can switch restaurant or user, no automatic Customer login occurs, and no auth tokens appear in app logs or retained navigation.

Automated verification covers native redirect configuration, wrong hosts/tenant schemes, expired and mixed link formats, isolated verification cleanup, no PKCE exchange/session import, signup/resend agreement, web missing-app fallback rendering, history scrubbing, and existing owner/admin return/recovery regression tests. Counts and execution outcomes are recorded in the consolidated implementation report. Live email delivery, Dashboard settings, Android intent dispatch and browser app-open restrictions require the device checklist above.
