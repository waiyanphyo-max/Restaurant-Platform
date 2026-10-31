import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicSupabaseConfig } from "./public-config";
import { isPublicAdminPath, loginPath, safeReturnTo } from "./route-policy";

/** Next 15 middleware refreshes cookies before Server Components read claims. */
export async function refreshAdminSession(request: NextRequest): Promise<NextResponse> {
  // This is an internal request hint, never an authorization claim. Overwrite client input.
  request.headers.set("x-admin-return-path", safeReturnTo(request.nextUrl.pathname + request.nextUrl.search));
  const config = publicSupabaseConfig();
  if (!config) {
    const response = NextResponse.next({ request });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });

  // The cookie is user-controlled. getClaims verifies its signature and refreshes when needed.
  let subject: string | undefined;
  try {
    const { data, error } = await supabase.auth.getClaims();
    const candidate = error ? undefined : data?.claims?.sub;
    subject = candidate && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate)
      ? candidate : undefined;
  } catch {
    // An Auth outage must not grant access to protected routes.
  }
  response.headers.set("Cache-Control", "private, no-store");

  const path = request.nextUrl.pathname;
  if (!subject && !isPublicAdminPath(path)) {
    const url = request.nextUrl.clone();
    const target = new URL(loginPath(path + request.nextUrl.search), url.origin);
    url.pathname = target.pathname;
    url.search = target.search;
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    for (const header of ["cache-control", "expires", "pragma"]) {
      const value = response.headers.get(header);
      if (value) redirect.headers.set(header, value);
    }
    return redirect;
  }
  return response;
}
