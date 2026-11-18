"use server";

import { serverAuth } from "@/lib/auth/server";
import { invitationRedirect } from "@/lib/auth/recovery";

/** Supabase supplies non-enumerating responses and provider email rate limits. */
export async function requestPasswordRecovery(email: string) {
  const address = typeof email === "string" ? email.trim() : "";
  const redirectTo = invitationRedirect(process.env.SUPABASE_INVITE_REDIRECT_URL);
  if (!redirectTo || address.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return { ok: false as const };
  try {
    const auth = await serverAuth();
    if (!auth) return { ok: false as const };
    const { error } = await auth.resetPasswordForEmail(address, { redirectTo });
    return { ok: !error };
  } catch { return { ok: false as const }; }
}
