# Restaurant Platform Web

Responsive Next.js frontend for restaurant operations, guest QR ordering, and authenticated customer flows. It is a mobile-responsive website/PWA-style layout, not a native Android/iOS app.

## Requirements

- Node.js 20.9 or newer
- The Spring Boot API running locally or at a reachable HTTPS origin
- A Supabase project URL and publishable key for browser sign-in and cookie-backed sessions
- A Supabase Auth user for private API workflows; the web app obtains and refreshes sessions through the official SDK

## Run locally

From the repository root:

```powershell
cd apps/web
Copy-Item .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000. The default API origin is `http://localhost:8080`; set `NEXT_PUBLIC_API_BASE_URL` in `.env.local` to override it. Configure Spring CORS to allow the web origin.

## Frontend source layout

```text
src/
├── app/
│   ├── page.tsx                  # Common QR and operations root route
│   ├── layout.tsx                # App shell and shared auth provider
│   ├── login/page.tsx            # Email/password sign-in
│   ├── auth/                     # Supabase callback and invite acceptance
│   └── workspace/page.tsx        # Responsive workspace route
├── components/
│   ├── layout/                   # Role-aware workspace navigation
│   ├── orders/                   # Order status UI
│   ├── menu/                     # Catalogue availability UI
│   ├── delivery/                 # Delivery status UI
│   ├── queue/                    # Queue status UI
│   ├── customer/                 # Customer avatar UI
│   └── shared/                   # Shared status, field, empty-state UI
├── features/
│   ├── auth/                     # Auth/session provider, account menu, callback flows
│   ├── restaurant/               # Restaurant API surface
│   ├── catalogue/                # Menu API surface
│   ├── checkout/                  # Guest QR checkout API surface
│   ├── payments/                 # Payment integration notes / future provider
│   ├── notifications/            # Notification API surface
│   ├── home/                     # Existing Common QR / root page client
│   └── workspace/
│       ├── WorkspaceClient.tsx   # Shared workspace shell and data/state orchestration
│       ├── WorkspaceContext.tsx  # Shared state/actions exposed to view modules
│       ├── WorkspaceViews.tsx    # View dispatcher
│       ├── config.ts             # Navigation groups
│       ├── utils.ts              # Shared display/API helpers
│       └── views/                # Operations, restaurant, customer, and special views
├── lib/
│   ├── api.ts                    # Typed API functions over the shared request helper
│   ├── api-request.ts            # Session-aware private and public API requests
│   └── supabase/                 # Official SSR browser/server clients and middleware support
│   └── media.ts                  # Media/upload helpers
└── types/
    └── workspace.ts              # Shared view and payload types
```

View JSX is separated by domain rather than one file per screen at this stage. Keep route files small, place reusable UI in `components/`, and put domain-specific state/API logic in `features/`. Treat `WorkspaceClient.tsx` as the shared shell; avoid moving server authorization rules into the frontend.

## Main screens

- **Root page (/):** existing Common QR guest pickup flow, queue tracking, polling, and opt-in browser sound.
- **Full workspace (/workspace):** responsive navigation and forms for owners, managers, staff, delivery drivers, and customers.
- **Restaurant operations:** orders/status transitions, counter orders, queue calls, delivery assignment/status, daily reports, payments/cash collection, menu categories/products/variants/modifier groups/options, images, tables/QR tokens, restaurant settings, default driver, delivery zones, team invitations/members/roles, and restaurant profile/logo.
- **Customer POV:** delivery storefront/cart/checkout (cash on delivery), profile/avatar, saved addresses, order history/details/cancellation/reorder, notifications, push-device metadata/registration, and queue ticket tracking.
- **Guest dine-in POV:** table QR guest checkout at `/workspace?view=table-order&restaurantId=<restaurant-uuid>#qrToken=<encoded-table-token>`. The QR token belongs in the URL fragment. The page removes the fragment after reading it so the token is not left in the visible address bar.

## Authentication and permissions

Use `/login` for email/password sign-in. The official Supabase SDK restores the cookie-backed session after reload and refreshes access tokens; the app does not ask users to paste bearer tokens. The visible account menu signs out and returns to `/login`. A signed-in customer can use profile and address screens without restaurant membership; restaurant selection comes from `/api/v1/my/restaurants`. Public QR menu/order endpoints remain available without login, and requests to `/api/v1/public/**` omit the Supabase bearer token. Spring Boot remains responsible for validating JWTs, restaurant membership, permissions, and the platform-admin allowlist.

For Supabase browser configuration, invitation redirects, and local test steps, follow [Auth and invitation setup](../../docs/auth-session-setup.md). Set `NEXT_PUBLIC_API_BASE_URL` in `.env.local` to the trusted Spring API origin; private requests are restricted to that configured origin so session tokens cannot be forwarded to another host. The publishable key and project URL are browser configuration. Never expose `SUPABASE_SERVICE_ROLE_KEY` or database credentials to the browser.

## QR links

The workspace can render a QR code and printable guest link after creating or rotating a table QR token. It generates links from the current web origin, so deploy the web app to its final HTTPS URL before printing permanent QR codes.

- Common QR uses the existing root-page route: `/?view=customer-pickup&restaurantId=<restaurant-uuid>#qrToken=<encoded-common-token>`
- Table QR uses: `/workspace?view=table-order&restaurantId=<restaurant-uuid>#qrToken=<encoded-table-token>`

Treat raw QR credentials as secrets. Rotate a token if a printed QR is lost or exposed; then replace the printed code.

## Current integration limits

- The workspace is responsive on desktop, tablet, and phone widths; it does not ship a native mobile app.
- Online payment provider/refund integration is not implemented; customer delivery checkout supports cash on delivery.
- Push-device registration accepts a token generated by a configured provider SDK, but the UI does not generate that token itself. External notifications require real server-side Firebase configuration; public queue updates use polling and optional browser sound.
- Images upload through Spring Boot; never add service-role credentials or Storage write permissions to the browser.

### Owner workspace links

Platform provisioning returns a link in the form `/workspace?restaurantId=<restaurant-uuid>`. The workspace may use that value as a selection hint, but it is not proof of membership; it checks `/api/v1/my/restaurants`, and Spring Boot enforces access. A valid Supabase Auth session is required for private workflows.
