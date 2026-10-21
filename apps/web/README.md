# Restaurant Platform Web

Initial Next.js web client for the manager order overview. This is an integration preview, not the finished customer app or a production-authenticated dashboard.

## Requirements

- Node.js 20.9 or newer
- The Spring Boot API running locally or at a reachable HTTPS origin
- A Supabase access token for a user with `ORDER_READ` permission in the selected restaurant

## Run locally

From the repository root:

```powershell
cd apps/web
Copy-Item .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000. The default API origin is `http://localhost:8080`; set `NEXT_PUBLIC_API_BASE_URL` in `.env.local` to override it. Enter the restaurant UUID and a user access token to load orders. You can filter by status, refresh the current results, and move through pages of up to 20 orders.

The access token is held only in component memory and is not persisted in local storage or cookies. Do not paste a Supabase service-role key. Configure backend CORS to allow the web app origin.

## Current scope

- Manager order-list integration with clear authentication, permission, query, and network errors
- Server-side order-status filtering, refresh, and pagination
- Current-day queue view with a call action for READY pickup tickets (requires QUEUE_MANAGE)
- Delivery task view with filtering, pagination, driver assignment, pickup, failure-reason, and delivery-completion actions (requires the matching restaurant permissions)
- Responsive dashboard shell for desktop and mobile widths
- No token persistence, customer checkout UI, or Supabase browser auth integration yet
