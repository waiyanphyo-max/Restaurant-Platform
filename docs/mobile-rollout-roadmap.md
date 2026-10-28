# Mobile rollout roadmap

**Target:** one Expo/React Native Android app for Owner, Manager, Staff, Delivery Driver and signed-in Customer.
**Reviewed:** 2026-10-28
**Status:** planning only; no mobile app exists.

Platform Admin and public Common QR/Table QR guest ordering remain web experiences. QR guests must not need an app or account.

## Guardrails

- One multi-tenant Android package for all restaurants.
- Use official Supabase JS SDK supported by Expo and secure native persistence such as Expo SecureStore, validated with the chosen Expo SDK. Let the SDK restore and refresh its session.
- Obtain the current session token for protected Spring calls. Do not hand-roll JWT parsing or refresh-token storage.
- Spring validates JWT signature, issuer, audience, expiry and UUID sub; it resolves membership and permissions.
- Load /api/v1/my/restaurants after sign-in. Show only memberships returned for the subject. A zero-membership user may still access allowed customer flows.
- Platform Admin remains web-only and governed by PLATFORM_ADMIN_USER_IDS.
- Use Spring for application data/writes. No Supabase Data API writes to app tables; never bundle service-role or DB credentials.
- Preserve public guest QR pages and web fallback for any deep link. Do not convert guest checkout into a login-required flow.
- The Next.js API helper depends on browser/server Supabase clients; extract a platform-neutral client/types layer only after defining the contract.
- Register push tokens through the authenticated device API. Keep Firebase server credentials outside the APK.

Official references: [Supabase Expo React Native quickstart](https://supabase.com/docs/guides/getting-started/quickstarts/expo-react-native), [Supabase React Native auth quickstart](https://supabase.com/docs/guides/auth/quickstarts/react-native), [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/).

## Milestones

| Milestone | Work and dependencies | Exit criteria |
|---|---|---|
| **R0 — Audit/contracts** | Current audit records routes, DTOs, roles, identity, guest QR boundaries and delivery gaps. | Architecture decision, role matrix and acceptance matrix reviewed; no code/remote settings changed. |
| **R1 — Identity foundation** | Add phone/SMS OTP with email/password; design verified same-UUID linking and authorized phone invite; harden provisioning around Auth UUID; define member eligibility. Depends on provider, abuse controls and trusted Auth Admin verification. | Linking preserves UUID; invite grants membership only after authorized verified claim. Unverified strings never merge identities. Tests cover duplicate phone, stale phone-change, expired/used invite, wrong scope and retry. |
| **R2 — Delivery authorization** | Allow manual assignment to any eligible active same-restaurant member and self; enforce assigned-only Staff/Driver reads/actions including order-status paths; add narrow assignment-options API; decide suspension state. | Tests prove role/self assignment, assigned-only access, cross-restaurant denial, reassignment, COD and history. Dedicated-driver auto-default remains explicit. |
| **R3 — Native API/auth base** | Select Expo SDK, Supabase SDK, secure storage adapter, deep-link scheme and API config. Depends on R1 and stable backend contracts. | Android dev build restores session, SDK refresh/sign-out work, protected calls get current token, public QR calls stay unauthenticated, a single legitimate 401 refresh retry cannot loop. No secrets in bundle/logs. |
| **R4 — App shell/membership** | Sign-in/recovery, email/password and SMS OTP, callbacks/deep links, account/sign-out, membership selection and common error/loading states. | Zero-membership customer reaches customer home; members see only returned restaurants/permitted areas; forged roles/IDs fail at API; session restore and invalid links tested. |
| **R5 — Owner/Manager** | Existing API-backed overview, settings, menu, orders, queue, tables/QR, delivery assignment, payment and reports. Team administration remains Owner-only. | Acceptance states and backend permission tests pass per role; missing APIs are identified before a screen claims support. |
| **R6 — Staff/delivery** | Staff order/queue/menu/payment tasks and assigned delivery inbox; same task UI for dedicated drivers. Depends on R2. | Staff/Driver can only read/update assigned tasks; Staff never changes role; Owner/Manager can self-assign; legacy status routes cannot bypass assignment. Retries do not duplicate status/payment. |
| **R7 — Customer** | Profile, verified contact, addresses, delivery zone, customer checkout/history/reorder/cancel, notifications/devices. Depends on identity and stable APIs. | Zero-membership customer can use permitted flows; Customer A cannot access Customer B; guest QR still works. Online payment waits for provider lifecycle. |
| **R8 — Android release** | Accessibility, supported versions/devices, localization, privacy/terms, links, FCM, signing, EAS profiles, internal testing and release runbook. | Signed internal build passes install/upgrade, auth/OTP, role isolation, delivery/customer, QR web fallback, notifications, offline/error and migration checks. Signing/secrets stay out of Git and app assets. |

## Dependencies and unresolved choices

- SMS vendor, country coverage, sender registration, cost, delivery reliability, rate limits, abuse monitoring and recovery.
- Verified phone link/invitation API; stale Supabase phone-change recovery and Auth Admin confirmation.
- UUID-safe identity provisioning; current profile lookup by email text is not proof of identity.
- Delivery authorization changes and whether membership suspension needs a schema field.
- Expo/Supabase SDK compatibility, secure storage, deep links, minimum Android version and device matrix.
- Online payments are not implemented; current counter/delivery collection is cash-based. Do not present online payment before provider, webhook and refund work.
- Firebase push requires real project/server credentials and matching client registration.
- Privacy/retention, support, signing keys, Play Console access and release ownership.

## Immediate next steps

1. Review and merge pending M2 Admin work separately; verify non-admin denial on every platform endpoint.
2. Decide SMS policy/provider; implement UUID-safe linking and authorized pending phone invitations before enabling phone onboarding.
3. Fix delivery assignment/read/status rules and add assigned-only integration tests before mobile delivery.
4. Complete standalone Table QR and Common QR acceptance states without adding account requirements.
5. Create the Expo project only after those gates, then implement R3 onward and track each persona against the acceptance matrix.
