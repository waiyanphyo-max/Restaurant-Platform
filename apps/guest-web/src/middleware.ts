import { NextResponse, type NextRequest } from "next/server";
import { refreshGuestAuthSession } from "./lib/auth/refresh";
import { GUEST_ROUTE_SLUG_HEADER, guestRouteSlug } from "./lib/tenant-routing";

export async function middleware(request: NextRequest) {
  // Always overwrite client-supplied routing context, including on unknown routes.
  request.headers.delete(GUEST_ROUTE_SLUG_HEADER);
  const slug = guestRouteSlug(request.nextUrl.pathname);
  if (slug) request.headers.set(GUEST_ROUTE_SLUG_HEADER, slug);

  const response = request.nextUrl.pathname.startsWith("/auth/")
    ? await refreshGuestAuthSession(request)
    : NextResponse.next({ request: { headers: request.headers } });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

export const config = { matcher: ["/((?!_next/static/|_next/image$).*)"] };
