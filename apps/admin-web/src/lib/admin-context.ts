import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { serverAuth } from "./auth/server";
import { resolveAdminContext } from "./auth/admin-session";
import { loginPath } from "./auth/route-policy";

// React cache deduplicates checks within one server render, never across users or requests.
export const getAdminContext = cache(() => resolveAdminContext({
  APP_STAGE: process.env.APP_STAGE,
  ADMIN_WEB_ORIGIN: process.env.ADMIN_WEB_ORIGIN,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
}, serverAuth));

/** Call from every protected page as well as its layout; layouts persist during navigation. */
export async function requireAdmin(returnTo = "/") {
  const context = await getAdminContext();
  if (context.state === "signed-out") redirect(loginPath(returnTo, "expired"));
  if (context.state !== "authorized") redirect("/access");
  return context;
}
