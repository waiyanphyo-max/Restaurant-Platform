# Restaurant Platform Web

Next.js integration preview for restaurant operations and guest Common QR pickup ordering. This is not the finished customer app or a production-authenticated dashboard.

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

Open http://localhost:3000. The default API origin is `http://localhost:8080`; set `NEXT_PUBLIC_API_BASE_URL` in `.env.local` to override it. For manager operations, enter the restaurant UUID and a user access token. The dashboard provides orders, queue, delivery, and daily-report views. For guest Common QR pickup, choose Common QR order and enter the restaurant UUID/API origin without a staff access token.

The access token is held only in component memory and is not persisted in local storage or cookies. Do not paste a Supabase service-role key. Configure backend CORS to allow the web app origin.

## Current scope

- Manager order-list integration with clear authentication, permission, query, and network errors
- Server-side order-status filtering, refresh, and pagination
- Safe forward-only order status updates following the backend lifecycle rules (permission-checked by the API)
- Current-day queue view with a call action for READY pickup tickets (requires QUEUE_MANAGE)
- Delivery task view with filtering, pagination, default-driver setting (requires SETTINGS_MANAGE), driver assignment, pickup, failure-reason, and delivery-completion actions (requires the matching restaurant permissions)
- Daily operations report with date selection, order-status counts, non-cancelled order totals, and payments collected (requires REPORT_READ)
- Guest Common QR menu/cart/checkout with variants and modifier selections
- Pickup status and queue notification polling every five seconds; browser sound is opt-in and requires a user click
- Common QR web links can prefill `restaurantId` and the QR token in a URL fragment: `?view=customer-pickup&restaurantId=<restaurant-uuid>#qrToken=<encoded-token>`
- Responsive dashboard and guest checkout shell for desktop and mobile widths
- No Supabase browser sign-in integration or external push-provider delivery; the queue token is held in component memory only and is not saved in local storage
