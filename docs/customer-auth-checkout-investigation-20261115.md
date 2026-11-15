# Customer registration and COD checkout investigation — 15 November 2026

This supplements `customer-auth-profile-checkout.md`. Earlier uncommitted authentication, profile recovery, session persistence and checkout changes were reviewed and preserved. After the user authorized a test mailbox, one live signup request was submitted and rejected by hosted Auth with HTTP 429. No resend, live order, hosted migration or hosted configuration change was performed.

## Confirmed findings

1. The historical `Account creation failed` message does not establish the provider's cause. Existing work now retains only allowlisted Auth codes, numeric status and a network flag in development diagnostics; passwords, mailbox addresses, tokens and raw provider messages are excluded. Registration, confirmation-required sign-out, confirm-password validation, password visibility, resend, the recovery gate, isolated recovery sessions and logout barriers remain intact.
2. A read-only request to the configured project's `/auth/v1/settings` succeeded on 15 November 2026. Email authentication is enabled, new signups are enabled, email confirmation is required, and phone authentication is disabled. The endpoint does **not** establish whether custom SMTP is configured, whether the failed address was allowed, the current mail quota, the hosted trigger definitions, or the historical error. These remain unconfirmed. No live registration success is claimed.
3. The current `san-thaw-tar` development configuration has a public API URL, a development API override and ADB reverse mode enabled. A read-only request to the running API's `/actuator/health` returned `UP`. No Android device/emulator was connected when inspected; current device acceptance could not be performed.
4. An additional reproducible account/checkout failure exists independently of registration: `CustomerProfileService` previously allowed optional private-avatar URL signing errors to fail the entire profile response. `CustomerAccountProvider` requires the profile and saved addresses before opening checkout, so a missing Storage configuration or a Storage outage blocked checkout for an otherwise valid customer with an avatar. Regression tests reproduce this path. This is a confirmed application defect; it is not proof that it caused the originally reported live user's failure.
5. The existing missing-profile recovery remains owner-scoped, draws from the authoritative active Auth identity, and preserves an existing profile. The existing atomic account load now retains whether profile or saved-address loading failed. Existing checkout revalidates price, availability, destination, recipient phone, delivery coverage and a server quote; durable opaque receipt keys and explicit abandonment reconcile ambiguous results before another order.

## Authorized live registration reproduction

The user explicitly authorized a test mailbox for this attempt. At **22:41:37 Asia/Bangkok on 15 November 2026**, the installed Supabase SDK 2.118.0 made exactly one signup POST using the existing Customer Mobile public configuration, email/password credentials and PKCE flow. The diagnostic client kept session state in memory and emitted only safe result metadata.

| Evidence | Observed result |
| --- | --- |
| HTTP status | `429` |
| Supabase error code | `over_email_send_rate_limit` |
| Safe provider message | `email rate limit exceeded` |
| Requests sent | `1` |
| Returned user/session | Neither returned; no authenticated session |
| Email confirmation / sign-in | Not reached; no successful registration or confirmation is claimed |

This confirms the **current reproduced failure is a hosted Auth email rate limit**. The app's form validation did not cause this response. The earlier generic historical message remains insufficient to prove that every previous failure had the same cause. The public settings endpoint does not reveal the exact quota/window or whether custom SMTP is enabled; the operator must review **Authentication → Rate Limits** and **custom SMTP/provider settings**. Keep confirmation enabled. Do not loop on signup or resend: a one-minute app cooldown does not guarantee the project mail window has reset. No confirmation email is expected from this rejected request; confirmation-click acceptance is pending an eventual successful, separately authorized attempt.

Sanitized evidence is retained in `target/shopping-qa-20261115/customer-registration-safe-result.json`. The strong random temporary test password was stored through Windows current-user DPAPI encryption during the request and its newly generated encrypted file was removed after the provider rejected registration. No password, publishable key or session token was printed or saved in plaintext. The request-started marker prevents accidental reruns. No further signup or resend was attempted.

## Changes in this investigation

| File | Change |
| --- | --- |
| `app/api/src/main/java/com/restaurant/platform/service/CustomerProfileService.java` | Return the valid profile with a null optional avatar when signing raises only `MEDIA_STORAGE_NOT_CONFIGURED` or `MEDIA_STORAGE_OPERATION_FAILED`. Keep the stored object path, retry signing on the next request, and propagate unrelated errors. Do not substitute a stale legacy public URL for a private avatar. |
| `app/api/src/test/java/com/restaurant/platform/service/CustomerProfileServiceTest.java` | Cover both known media failures, preserved profile/path, later signing recovery and propagation of unrelated authorization errors. |
| `apps/customer-mobile/src/auth/errors.ts` | Give `email_address_not_authorized` actionable, localized email-delivery guidance without disclosing SMTP configuration or asserting that an email was sent. |
| `apps/customer-mobile/src/auth/errors.test.ts` | Verify the guidance and exclusion of raw private provider details. |

No database schema changes are needed for these fixes. Existing customer/profile/address/order data is preserved. No native dependency or configuration changed: restart the Spring API and reload Metro; a new Android APK is unnecessary for these changes.

## Configuration actions supported by evidence

The current public settings and reproduced HTTP 429 do not justify disabling confirmation or changing hosted Auth automatically. Correlate the recorded safe code/status/timestamp with **Supabase Dashboard → Logs → Auth** and review the email quota. Inspect corresponding Postgres logs only if Auth indicates a database error; retain raw personal data and credentials privately.

| Observed error | Manual action after confirming the cause |
| --- | --- |
| `email_address_not_authorized` | Review Authentication's custom SMTP settings and approved recipients. If the built-in sender is in use, either use an already authorized organization mailbox for testing or configure an approved custom SMTP sender for customer delivery. Do not add customers to the organization as a workaround. |
| `over_email_send_rate_limit` / HTTP 429 | Review Authentication → Rate Limits and the mail provider quota. Wait for the actual quota window; repeated retries consume quota. The app's one-minute cooldown does not promise the project quota has reset. |
| `unexpected_failure` / HTTP 500 | Correlate Auth and Postgres logs, then inspect deployed profile-sync triggers, constraints and trusted API privileges. Repository migration files do not prove hosted application. Do not recreate users or overwrite profiles. |
| `email_not_confirmed` | Complete the existing approved confirmation link, return to the app, and sign in. Check Site URL/redirect configuration if the email/link itself fails. Keep confirmation enabled. |
| `weak_password` | Align the public app password-policy settings with the hosted policy without lowering security. |

The official [Supabase SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp) confirms the default sender has recipient restrictions and tight quotas; this is a diagnostic possibility, not evidence that this project uses the default sender. See [Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits) and [database errors saving users](https://supabase.com/kb/troubleshooting/database-error-saving-new-user-RU_EwB). These references were checked on 15 November 2026.

Use the read-only schema/trigger/profile-gap queries in `customer-auth-profile-checkout.md` before reviewing pending migrations. No hosted schema audit was possible with the public Auth settings alone. A restricted API DB role needs the existing required Auth-registry/profile privileges; do not grant these to browser roles.

## Automated verification

| Check | Result |
| --- | --- |
| Customer baseline, before new edits | 8 Node + 324 Vitest tests passed. |
| Customer tests after edits and concurrent variant changes | 8 Node + 326 Vitest tests passed; no failures or skips. |
| Customer ESLint | Passed. |
| Customer TypeScript | Initial attempt failed while the concurrent variant implementation had not rebuilt shared types. Rerun after the shared-types build passed. |
| Focused backend request | Test compilation was interrupted by concurrent procurement contract changes (`LineInput` → `PlanLineInput` in existing test fixtures), before tests ran. The coordinating task performs the final backend rerun after those edits finish. See `target/customer-auth-checkout-20261115-backend.log`. |

Tests with mocks are separate from live registration, email delivery, native session restoration and order acceptance. No hosted management/log connector or management-token environment was available. A read-only attempt to inspect an already signed-in dashboard through the native browser ended automatically because Computer Use could not verify Chrome's current URL sufficiently to enforce policy. No dashboard interaction or configuration changes occurred. The single subsequent authorized public signup request reproduced the email rate-limit rejection above; the exact historical registration cause remains unconfirmed.

## Windows / Android acceptance

Use the existing environment files and secure backend launch process. Do not put database credentials, service-role keys, passwords or QR tokens into shell history. Start each service in a separate PowerShell terminal from the repository root:

```powershell
Set-Location 'C:\RestaurantManagementSystem\Restaurant-Platform'
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-21'
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
$maven = 'C:\Program Files\JetBrains\IntelliJ IDEA 2025.2.3\plugins\maven\lib\maven3\bin\mvn.cmd'
# With the existing approved backend environment already loaded:
& $maven -f app/api/pom.xml spring-boot:run
```

```powershell
npm run start -w @restaurant-platform/operations-mobile -- --port 8082
```

```powershell
npm run start -w @restaurant-platform/customer-mobile -- --port 8083
```

```powershell
npm run dev -w @restaurant-platform/guest-web
```

```powershell
$adb = 'C:\Users\DELL\AppData\Local\Android\Sdk\platform-tools\adb.exe'
& $adb devices -l
# Continue after an authorized device appears:
& $adb reverse tcp:8080 tcp:8080
& $adb reverse tcp:8082 tcp:8082
& $adb reverse tcp:8083 tcp:8083
& $adb reverse tcp:3002 tcp:3002
Invoke-RestMethod 'http://127.0.0.1:8080/actuator/health'
```

1. Register a new approved mailbox once. Complete confirmation, return and sign in. Verify the profile and safe failure feedback for an invalid field, unavailable connection and rate limit. Do not assume a conditional confirmation message proves delivery.
2. Verify account A after background/foreground, Metro reload, and force-stop/reopen without clearing storage. Sign out and sign in to account B; verify no A profile, addresses, cart, receipt or history appears. The recovery email-code feature remains disabled until its shared email template/provider is reviewed.
3. Load Profile and saved addresses; test a dedicated missing-profile fixture without deleting production records. Test Storage unavailability with a customer who has a private avatar: account details and checkout should still load; the photo can recover on a later reload.
4. Add available products with variants/modifiers. Open Cart → Continue to checkout. Choose an owned address with a confirmed pin, or a supported temporary map/GPS location. Validate recipient contact, delivery-zone retry, address/city/township, server prices, fee and Cash on Delivery.
5. Confirm once against the intended test restaurant. Verify the order number, order history and tracking, then verify the same delivery order in `san-thaw-tar` Operations Mobile. Test lost-response recovery with the existing same-key retry/check-again actions and verify exactly one order. Keep the cart until success is confirmed.

The live signup request was tested and rejected with HTTP 429. Successful registration, email confirmation/delivery, native SecureStore restoration, map rendering, COD submission, live order history/tracking and Operations visibility remain pending. Existing automated suites exercise their application paths but do not replace these checks.
