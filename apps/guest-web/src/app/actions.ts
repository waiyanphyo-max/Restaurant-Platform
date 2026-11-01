"use server";

import { cookies } from "next/headers";
import { guestLocales, localeCookie, type GuestLocale } from "@/lib/i18n";
import { resolveGuestTenant } from "@/lib/tenant-server";

export async function setGuestLanguage(form: FormData) {
  const locale = form.get("language");
  if (!guestLocales.includes(locale as GuestLocale) || !(await resolveGuestTenant())) return;
  (await cookies()).set(localeCookie, locale as GuestLocale, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: 60 * 60 * 24 * 365,
  });
}
