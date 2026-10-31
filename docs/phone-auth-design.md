# Phone authentication and verified linking

M2 design, reviewed 2026-10-31. Phone/SMS OTP remains disabled. No supported SMS provider, live SMS delivery, or production phone-claim flow has been verified by this milestone. The email/password adapters expose no phone sign-in or phone-link controls. A client environment flag alone cannot establish provider readiness.

## Closed capability gate

Enable a phone feature only after the environment has all of the following evidence: a supported Supabase SMS provider configured in the correct project; staging delivery, expiry, resend, rate-limit and failure tests; abuse controls; and the server identity/invitation contracts below with tenant-isolation tests. Keep the gate closed for production until release approval. Provider credentials stay in Supabase/server configuration and never enter a web/native bundle. Supabase's [phone guide](https://supabase.com/docs/guides/auth/phone-login) documents provider setup and its phone-change flow.

## Signed-out phone authentication

Phone OTP sign-in is a separate entry from linking a phone to an existing email/password account. If future scope permits phone-only accounts, explicitly decide whether new-user creation is allowed; default to disabling automatic user creation for existing-account sign-in. A Supabase session proves its Auth UUID only after verification. A phone value or OTP submission does not itself grant restaurant membership, platform access, or customer data access. Obtain a current session token through the SDK and let Spring validate each business request.

## Link or change a phone on the same Auth UUID

1. Start from a verified signed-in user and record its Auth UUID in memory for this serialized operation. Require recent authentication if the project policy calls for it.
2. Ask Supabase Auth to update that logged-in user's phone, using `updateUser({phone})`. Do not use signed-out OTP sign-in to simulate linking, create another Auth user, or look up a profile by phone/email text.
3. Verify the received OTP using the SDK's `phone_change` flow. Supabase documents this separately from `sms` sign-in. Handle expiry, resend, stale requests, conflicts, and cancellation.
4. Re-fetch the current verified user/session and require the UUID to match the pre-change UUID exactly. Confirm that trusted Auth data reports the intended phone as confirmed. If the UUID changes or identity state is unexpected, clear the local session and fail closed; do not reparent profile, customer, or membership records.
5. Any Spring operation that depends on verified phone ownership must independently confirm the JWT subject and current verified phone using trusted Auth Admin data. Client-reported `phone_confirmed_at` or `profiles.phone` is insufficient. The existing customer profile phone field remains ordinary contact text.

See the official [updateUser reference](https://supabase.com/docs/reference/javascript/auth-updateuser). Real provider behavior and same-UUID preservation must be tested before enabling this flow; mocked success is not delivery evidence.

## Proposed server invitation contract, before implementation

No endpoint below is implemented by M2, and no migration is applied.

| Proposed operation | Request and server rule |
| --- | --- |
| `POST /api/v1/restaurants/{restaurantId}/phone-invitations` | Current Owner with `MEMBERS_MANAGE` supplies normalized E.164 phone and a permitted non-owner role. Return invitation ID and expiry; create no membership. Store a hash of an unpredictable claim secret with restaurant, role, phone, actor, expiry, and consumption state. A separate Platform Admin operation requires its own allowlist check if later approved. |
| `POST /api/v1/phone-invitations/{invitationId}/claim` | Authenticated user supplies the one-time claim secret in the body. The server derives identity from JWT `sub`, fetches that exact Auth user via trusted Auth Admin, and requires its verified phone to match the invitation. Reject an arbitrary request `userId`, unverified/mismatched phones, invalid/expired/used claims, and disallowed role/restaurant state. Atomically consume the claim and create membership for the same UUID. |
| Verified contact reads | Any future verified-contact endpoint returns status for the JWT subject based on trusted Auth data, without exposing another user's lookup information. It must not turn public phone/email search into an account-discovery API. |

Rate-limit and audit creation, resend, and claim; avoid recording raw OTPs/claim secrets. Test concurrent claims, a changed verified phone, existing membership, removed/disabled users, another restaurant, and another Auth UUID. Existing account collisions require explicit verified support handling rather than automatic merge.
