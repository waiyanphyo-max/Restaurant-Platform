import { type NextRequest } from "next/server";
import { refreshAdminSession } from "@/lib/auth/refresh";

export async function middleware(request: NextRequest) {
  return refreshAdminSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
