import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicSupabaseConfig } from "./public-config";

/** Refresh only auth entry points; public QR pages never need a bearer session. */
export async function refreshGuestAuthSession(request: NextRequest): Promise<NextResponse> {
  const config = publicSupabaseConfig();
  if (!config) return NextResponse.next({ request });

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
  try {
    await supabase.auth.getClaims();
  } catch {
    // Auth outages do not change public QR behavior or grant guest privileges.
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
