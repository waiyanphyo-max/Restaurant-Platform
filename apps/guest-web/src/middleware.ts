import { type NextRequest } from "next/server";
import { refreshGuestAuthSession } from "@/lib/auth/refresh";

export async function middleware(request: NextRequest) {
  return refreshGuestAuthSession(request);
}

export const config = { matcher: ["/auth/:path*"] };
