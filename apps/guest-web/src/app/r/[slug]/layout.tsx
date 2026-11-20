import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { TenantFrame } from "@/components/TenantFrame";
import { getGuestLocale } from "@/lib/locale-server";
import { resolveGuestTenantContext } from "@/lib/tenant-server";
import { loadGuestBranding } from "@/lib/branding-server";

/** This dynamic segment remounts tenant branding and private QR memory when the slug changes. */
export default async function LocalRestaurantLayout({ children, params }: { children: ReactNode; params: Promise<{ slug: string }> }) {
  const context = await resolveGuestTenantContext((await params).slug);
  if (!context || !context.basePath) notFound();
  const [locale, presentation] = await Promise.all([getGuestLocale(), loadGuestBranding(context.restaurant)]);
  return <TenantFrame context={context} presentation={presentation} locale={locale}>{children}</TenantFrame>;
}
