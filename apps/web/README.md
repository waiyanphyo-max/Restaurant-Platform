# Frontend workspace

M0 removed the previous Next.js UI. This directory is reserved for the new frontend architecture. It has no runnable app, package manifest, build command, or frontend CI until a later milestone adds them.

`apps/web/.env.example` is retained as a historical environment-variable sample. Review it against the chosen architecture in M1. Keep local environment files and credentials private.

## Existing contracts

The Spring Boot API remains the source of truth for authorization and business rules. Use [the API contract](../../docs/api.md), [auth setup](../../docs/auth-session-setup.md), and [M0 reset audit](../../docs/frontend-reset-audit.md) when building the replacement.

| Purpose | Previously distributed URL |
| --- | --- |
| Common QR guest pickup | `/?view=customer-pickup&restaurantId=<uuid>#qrToken=<url-encoded-common-token>` |
| Table QR guest order | `/workspace?view=table-order&restaurantId=<uuid>#qrToken=<url-encoded-table-token>` |
| Owner workspace | `/workspace?restaurantId=<uuid>` |
| Supabase auth return | `/auth/callback` and `/auth/accept-invite` |

Keep these URLs working as routes or compatible aliases even if M1 introduces new routes. QR credentials are carried in URL fragments: read the fragment in the browser, remove it from visible history, and do not move tokens into query parameters or logs. Do not rotate existing QR credentials as part of the frontend rebuild.

The backend generates owner and Common QR links from `APP_PUBLIC_WEB_BASE_URL`. Invitations use `SUPABASE_INVITE_REDIRECT_URL`; Supabase must allow the exact auth return URLs. Configure `APP_CORS_ALLOWED_ORIGINS` for the future web origin. Public QR requests need no login; private API access requires Supabase sessions and backend-enforced membership/permissions.

## M1 handoff

Choose the new frontend architecture and restore its package scripts and CI. Implement the legacy URL compatibility and API/auth integration before directing existing QR or invitation traffic to the new deployment. The M0 placeholder is not a deployable guest experience.
