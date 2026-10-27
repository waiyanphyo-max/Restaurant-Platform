# Supabase authentication

The Next.js App Router uses Supabase's official `@supabase/ssr` clients. The browser SDK owns cookie session persistence, PKCE verifier storage, and automatic refresh; application state contains the signed-in user but never stores an access or refresh token. Next 15 uses `src/middleware.ts` (not `proxy.ts`) to refresh the cookie-backed session and apply the SDK's private no-store response headers when it writes refreshed cookies.

## Routes

- `/login`: email/password sign-in. A `next` return path is accepted only when it is a safe same-origin application path; login/auth routes, open redirects, fragments, and token-like query parameters are rejected.
- `/auth/callback`: exchanges Supabase PKCE codes or verifies supported email token hashes through the SDK, then returns to a safe `next` path.
- `/auth/accept-invite`: accepts the current Auth Admin invitation redirect, handles Supabase's callback code, token-hash, and implicit session formats, removes callback credentials from the visible URL, and asks the invited user to set a password. Invitation metadata initializes the existing profile sync trigger.

Expired, invalid, already-used, and incomplete invitation links receive a generic recovery message and do not expose provider callback details. The backend invitation sends the full name as Supabase `user_metadata.full_name`; the existing Auth profile trigger copies it into the application profile.

## Protected API calls

`src/lib/api-request.ts` is the only Spring API request helper. Protected requests obtain the current session from the browser Supabase client and attach its access token. After an API 401, the helper calls the SDK's `refreshSession()` once and retries once with the refreshed session. A second 401 clears the local session and routes to `/login` with a visible expired-session notice. Errors are sanitized so bearer credentials are not shown.

Requests under `/api/v1/public/` explicitly omit `Authorization`, including QR menu, checkout, and queue-ticket calls. Queue tracking uses its separate `X-Queue-Token` credential. Public guest flows remain usable while signed out.

Role and identity data come from Spring Boot's JWT validation and `/api/v1/my/restaurants`. Frontend metadata and URL parameters never grant restaurant or platform access. Platform operator requests continue to be authorized by the backend's `PLATFORM_ADMIN_USER_IDS` allowlist.

## Setup

Copy `apps/web/.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the Supabase project. The publishable key is browser-safe. Keep `SUPABASE_SERVICE_ROLE_KEY`, database credentials, and other privileged secrets in API server configuration only. See [auth and invite setup](../../../../../docs/auth-session-setup.md) for the exact redirect allowlist and invitation configuration.
