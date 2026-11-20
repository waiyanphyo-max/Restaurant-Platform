import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { TenantFrame } from "@/components/TenantFrame";
import { getGuestLocale } from "@/lib/locale-server";
import { resolveGuestTenantContext } from "@/lib/tenant-server";
import { loadGuestBranding } from "@/lib/branding-server";

export default async function RestaurantLayout({ children }: { children: ReactNode }) {
  const context = await resolveGuestTenantContext();
  if (!context || context.basePath) notFound();
  const [locale, presentation] = await Promise.all([getGuestLocale(), loadGuestBranding(context.restaurant)]);
  return <TenantFrame context={context} presentation={presentation} locale={locale}>{children}</TenantFrame>;
}
