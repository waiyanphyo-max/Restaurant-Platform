# Customer authentication, profile, and checkout verification

Scope: the current local working tree, Customer Android app and its Spring customer-profile API. No deployment, hosted data/configuration change, APK rebuild, commit, or push was performed.

## Evidence and diagnosis

- The original `AuthPanel` replaced every registration exception with the same message. Supabase error codes reached the native adapter, but the UI discarded them. A generic message cannot establish whether a failure was validation, duplicate-account protection, email delivery, a rate limit, or a database trigger.
- A read-only request to the configured project's `/auth/v1/settings` returned HTTP 200, `external.email=true`, `disable_signup=false`, and `mailer_autoconfirm=false` on 2026-11-14. Email registration is enabled and confirmation is required. This endpoint did not expose the password policy, SMTP configuration, migration history, or historical registration error.
- No registration, reset email, resend email, or live order was submitted. Existing Android JavaScript logs contained no recognized authentication/profile error code. The precise cause of the previously failed second registration remains unverified; use the new safe diagnostics and the corresponding Supabase Auth logs when reproducing it.
- The original `getMyProfile` returned `CUSTOMER_PROFILE_NOT_FOUND` whenever `public.profiles` lacked the authenticated UUID. `listAddresses` is a separate owner-scoped request and can return an empty list successfully. `AccountProvider` loaded both atomically; its error blocked Profile and Checkout alike. The previous query layer discarded the failing operation and HTTP code, so the two screens showed a generic loading failure. This failure path is reproduced by automated tests; the affected live user's database row was not inspected.
- Supabase's `INITIAL_SESSION` notification could publish a null session after a transient startup-refresh failure. That notification advanced the flow revision and suppressed the explicit restore rejection, showing signed-out UI instead of the recovery/retry state. Explicit restoration now owns startup; subsequent Auth events still propagate. Expired/missing-expiry authentication results are rejected, revoked-refresh errors clear the local session, and transient refresh errors remain recoverable.
- The trigger/backfill migration `20261022001000_sync_auth_user_profiles.sql` is intended to create profiles for Auth users. `20261025120000_add_profile_email_for_member_management.sql` subsequently replaces its trigger function and mirrors Auth email. Repository files are not evidence that either migration was applied to the hosted project.
- Local read-only connectivity checks: `/actuator/health` returned 200; both customer endpoints without bearer credentials returned 401 as expected. A USB Android device was available and already had reverse mappings for ports 8080, 8082, and 8083. These checks do not constitute authenticated device acceptance.

## Manual configuration review

Do not disable email confirmation to work around an unexplained error. The app remains signed out when registration returns no authenticated Supabase session.

Reproduce registration once using an approved test mailbox. In development, record only the operation, error code, and numeric status from the new diagnostics. Match the timestamp to **Supabase Dashboard → Logs → Auth**. For database errors, inspect the corresponding Postgres log privately; do not paste raw logs containing credentials or personal information.

| Observed code | Review action |
| --- | --- |
| `over_email_send_rate_limit` | Inspect **Authentication → Rate Limits** and the configured mail provider. Wait for the provider/project window; repeated resends consume the same quota. |
| `email_address_not_authorized` | Inspect **Authentication → Email → SMTP Settings**. The built-in sender restricts recipients; configure an approved custom SMTP sender for customer email. |
| `signup_disabled`, `email_provider_disabled` | Inspect **Authentication → Sign In / Providers → Email** and the allow-new-users setting for the intended environment. These were enabled at the read-only check; change only if the actual failure and project configuration establish a need. |
| `weak_password` | Review **Authentication → Settings → Password Security** and align the app's public password policy with it. Keep the app's existing minimum of eight characters or the stronger server requirement. |
| `unexpected_failure`, HTTP 500 | Inspect Auth/Postgres logs for SMTP, hook, trigger, permission, or schema failures. Repair only the confirmed issue. |

The built-in sender currently restricts recipients and email volume; custom SMTP setup and rate-limit changes are manual operator decisions. See [Supabase hosted Auth testing](https://supabase.com/docs/guides/auth/testing-auth-flows), [SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp), and [rate limits](https://supabase.com/docs/guides/auth/rate-limits). Trigger failures can block registration; see [Supabase user-data management](https://supabase.com/docs/guides/auth/managing-user-data).

### Database audit before applying anything

Use the approved database connection/SQL Editor for the intended environment. The following are read-only and return no customer email, password, or token:

```sql
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version IN ('20261022001000', '20261025120000', '20261107130000')
ORDER BY version;

SELECT tgname, tgenabled, pg_get_triggerdef(oid)
FROM pg_trigger
WHERE tgrelid = 'auth.users'::regclass AND NOT tgisinternal;

SELECT pg_get_functiondef('public.handle_new_auth_user()'::regprocedure);

SELECT count(*) AS auth_users_missing_profiles
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL AND u.deleted_at IS NULL
  AND (u.banned_until IS NULL OR u.banned_until <= CURRENT_TIMESTAMP);
```

If the migration ledger is absent, reconcile the deployed schema with the team's migration history before applying SQL. If migrations are missing, review and apply pending repository migrations in timestamp order using the normal approved process. Applying only the old profile-sync file after the newer email migration would replace the newer trigger function. The third listed migration supplies the existing checkout receipt/recovery schema. Do not reset the database, recreate Auth users, or overwrite existing profile/address rows. No new migration is required by this change; the existing schema and trusted server DB-role `SELECT` access to `auth.users` and `INSERT` access to `public.profiles` must be present. The new backend fallback repairs only a missing profile for the exact authenticated, existing, nondeleted and nonbanned Auth UUID, and preserves rows already present.

### Password recovery enablement

The mobile recovery flow uses an email code and an isolated in-memory Supabase recovery client. It never publishes the recovery identity as the customer's signed-in account. The existing approved confirmation-email link → return to app → password sign-in workflow remains in place.

Before enabling mobile recovery:

1. Review the project's **Authentication → Email → Reset Password** template. Add a code such as `<p>Your password reset code is {{ .Token }}</p>` while retaining the existing approved web recovery link and template variables. This template is shared with owner/web recovery, so test both consumers.
2. Keep current Site URL and redirect allowlists intact. Mobile code verification does not need a new deep link or native callback.
3. Set `EXPO_PUBLIC_CUSTOMER_EMAIL_OTP_RECOVERY_ENABLED=true` only after template/provider review. Set `EXPO_PUBLIC_CUSTOMER_PASSWORD_MIN_LENGTH` (at least 8) and `EXPO_PUBLIC_CUSTOMER_PASSWORD_REQUIREMENTS` to match the hosted policy. Allowed requirements are empty, `letters_digits`, `lower_upper_letters_digits`, or `lower_upper_letters_digits_symbols`. These public configuration values contain no secrets.
4. Restart Metro to inline changed `EXPO_PUBLIC_*` values, reload the development app, and test a code, an expired/used code, reset completion, and subsequent password sign-in. Test that owner web recovery still works.

No hosted template or build-environment file was changed automatically.

## USB Android acceptance

Use approved test accounts and a reviewed delivery destination. The final order step creates a real COD order and should be performed against the intended test environment.

1. Start the updated Spring API with the existing secure database/JWT environment; do not paste credentials into the command line or mobile files. In another PowerShell terminal:

   ```powershell
   Set-Location 'C:\RestaurantManagementSystem\Restaurant-Platform'
   $adb = 'C:\Users\DELL\AppData\Local\Android\Sdk\platform-tools\adb.exe'
   & $adb devices -l
   & $adb reverse tcp:8080 tcp:8080
   & $adb reverse tcp:8082 tcp:8082
   Invoke-RestMethod 'http://127.0.0.1:8080/actuator/health'
   npm run start:customer -- --port 8082
   ```

   The existing ignored Customer `.env.local` selects `san-thaw-tar`, development, and the approved USB loopback API override. Use the existing installed development client and Metro reload. Do not uninstall the app or clear its storage to test persistence.
2. Open Create account. Test empty/invalid email, the configured password requirements, and mismatched confirmation. Show/Hide each password independently and confirm the values remain unchanged. Switch English/Burmese and check labels, errors, keyboard scrolling, autofill, and TalkBack labels. Rapidly press submit; only one request should run.
3. Register a new approved mailbox once. With current confirmation settings, expect a confirmation message and no authenticated navigation. Open the existing approved confirmation link from the mailbox, return, and sign in. Use Resend once if needed; check cooldown and rate-limit feedback. Repeating an existing mailbox must not disclose account existence.
4. Test wrong-password login and recoverable offline failure. Preserve the email. With mobile recovery enabled after the review above, request a reset, enter the email code, choose matching new passwords, and sign in with the new password. An invalid/expired code must remain a recovery error, never an authenticated customer session.
5. Sign in to account A, background/foreground the app, then force-stop and reopen it without clearing data:

   ```powershell
   & $adb shell am force-stop com.restaurantplatform.santhawtar.customer.dev
   & $adb shell monkey -p com.restaurantplatform.santhawtar.customer.dev -c android.intent.category.LAUNCHER 1
   ```

   Expect restoration while the session is valid/refreshable. Test Metro reload too. Test normal token refresh by waiting across expiry with the approved test session. If restoration fails while offline, reconnect and use Retry. Do not change token expiry or bypass validation to simulate success.
6. Open Profile, verify account A's details, update a field and reload. Verify owned saved addresses, add/edit/default behavior, and no cross-account data. Use a dedicated test fixture without an application profile to verify recovery; do not delete production rows to create this condition. A nonexistent, deleted, banned, or foreign Auth UUID must not create a profile.
7. Disable connectivity, reload Profile, then restore connectivity and Retry. The error should identify profile versus saved-address loading. Test revoked/expired authentication separately in a test environment; it should require recovery/sign-in rather than expose stale private data.
8. Add an item from the menu, open Cart → Continue to checkout. Choose an owned saved address with a confirmed pin, or a supported temporary map/GPS destination. Check delivery-area retry after a network failure. Request the server quote and verify destination, item prices, delivery fee, total and Cash on Delivery.
9. Confirm once. Verify the returned order number, one order in Order History, order tracking/payment status, and the same restaurant order in the Operations app's delivery/order workflow. For a lost-response test, reconnect and use Retry this checkout/Check again; verify the same receipt and no duplicate order. Do not start a different order until the previous attempt is reconciled.
10. Sign out, force-stop/reopen, and confirm the old session stays signed out. Sign in to account B and confirm no A profile, saved address, cart, checkout receipt or order history is displayed. Repeat explicit logout while offline to verify the durable local logout barrier.

The JavaScript/TypeScript and Spring changes do not require a new native APK. Existing native branding, Maps, Firebase and network configuration are reused. The running API must be restarted with the changed backend classes before device acceptance.

## Implementation inventory

| Files | Purpose |
| --- | --- |
| `apps/customer-mobile/src/auth/AuthPanel.tsx` | Existing form redesigned with shared controls, email normalization, confirm password, independent visibility controls, inline validation, loading/submit lock, English/Burmese labels, resend and recovery screens. |
| `apps/customer-mobile/src/auth/{AuthProvider.tsx,flow.ts,native.ts,session.ts}` | Narrow Auth methods for resend/recovery, isolated recovery sessions, email cooldown, duplicate-request guard, expiry/refresh handling. Existing SecureStore namespace, persistence, lifecycle refresh, and logout barrier retained. |
| `apps/customer-mobile/src/auth/{errors.ts,validation.ts}` and `.env.example` | Safe error mapping and development metadata; reviewed stronger password-policy configuration and recovery feature gate. |
| `apps/customer-mobile/src/hooks/{apiFailure.ts,useApiQuery.ts}` | Preserve safe failing operation/status/code, including pre-fetch Auth refresh errors, while retaining query retry, cancellation and identity scoping. |
| `apps/customer-mobile/src/features/profile/{account.ts,AccountProvider.tsx,ProfileScreen.tsx}` | Validate runtime account responses and ownership, distinguish profile/address failures, refresh after profile mutation, and show useful retry messages. |
| `apps/customer-mobile/app/(store)/{address.tsx,checkout.tsx}`, `src/features/storefront/Storefront.tsx` | Explain the account dependency failure where it blocks address, home or checkout navigation. |
| `apps/customer-mobile/src/features/checkout/{CheckoutScreen.tsx,destination.ts}` | Delivery-area load retry and safe quote-error distinctions; existing server pricing, confirmation, idempotency and receipt-recovery flow retained. |
| `app/api/src/main/java/com/restaurant/platform/{repository/ProfileRepository.java,service/CustomerProfileService.java,controller/CustomerProfileController.java}` | Owner-checked, conflict-safe missing-profile recovery from the Auth registry, bounded metadata, and `no-store` profile responses. |
| Relevant Customer auth/account/checkout/navigation tests and Spring profile/database/HTTP tests | Cover validation and UX, session lifecycle, recovery isolation, account retry and ownership, route integration, and actual PostgreSQL provisioning/concurrency safeguards. |

## Automated verification

| Command / suite | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| `npm run typecheck -w @restaurant-platform/customer-mobile` | Passed | 0 | 0 |
| `npm run lint -w @restaurant-platform/customer-mobile` | Passed | 0 | 0 |
| `npm run test -w @restaurant-platform/customer-mobile` | 332 (8 Node + 324 Vitest) | 0 | 0 |
| `npm run test -w @restaurant-platform/api-client` | 99 | 0 | 0 |
| Focused Spring profile/address/checkout/order/JWT/security | 80 | 0 | 0 |
| Local PostgreSQL and history HTTP | 14 | 0 | 0 |
| Docker PostgreSQL migration/schema | 0 | 0 | 11 |

The existing API-client loopback HTTP test initially failed under sandbox networking; the same suite passed with loopback networking enabled. No remaining test failures were observed. Task-scoped whitespace checks pass. The full working tree still contains a pre-existing unrelated trailing-space finding in `configs/restaurants/expo.cjs`, which was left intact.

Unit/component tests use test doubles; HTTP and PostgreSQL tests identify their own local fixtures. They do not prove real email delivery, live Auth refresh/revocation, device SecureStore behavior, map rendering, or a live Operations order handoff.

Backend verification: 80 focused profile/address/checkout/order/JWT/security tests passed, followed by 14 PostgreSQL/history tests (four profile repair, one address race, three history HTTP, and six existing delivery/media safeguards). No backend failures remain. The Docker schema suite compiled but skipped all 11 tests because Docker was unavailable. A new isolated loopback-only PostgreSQL 16 fixture ran the 26 repository migrations with two temporary privilege-script copies adapted to omit PostgreSQL 17's unsupported `MAINTAIN` grant; repository SQL was unchanged. The fixture was stopped. PostgreSQL 17/Docker schema acceptance remains unverified here.

Backend logs: `target/customer-account-backend-focused.log`, `target/customer-account-backend-postgres.log`, and `target/customer-account-backend-schema.log`.

Focused backend rerun (JDK 21 and the existing Maven installation):

```powershell
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-21'
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
$maven = 'C:\Program Files\JetBrains\IntelliJ IDEA 2025.2.3\plugins\maven\lib\maven3\bin\mvn.cmd'
& $maven --offline --batch-mode --no-transfer-progress -f app/api/pom.xml '-Dtest=SecurityConfigHttpIntegrationTest,SecurityConfigJwtValidatorTest,CustomerAddressControllerHttpTest,CustomerDeliveryCheckoutControllerHttpTest,CustomerProfileControllerHttpTest,CustomerAddressServiceTest,CustomerDeliveryCheckoutTest,CustomerOrderServiceTest,CustomerProfileServiceTest' test
```

The PostgreSQL tests are explicitly gated to a disposable loopback `accounting_verify` database via `ACCOUNTING_TEST_DATABASE_URL`. Do not point them at a shared or hosted database. The temporary fixture/bootstrap evidence is retained under `target/customer-account-qa/`; it is stopped and is not application data.
