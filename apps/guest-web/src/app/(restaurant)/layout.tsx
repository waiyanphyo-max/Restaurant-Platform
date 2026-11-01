import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { TenantFrame } from "@/components/TenantFrame";
import { getGuestLocale } from "@/lib/locale-server";
import { resolveGuestTenantContext } from "@/lib/tenant-server";

export default async function RestaurantLayout({ children }: { children: ReactNode }) {
  const context = await resolveGuestTenantContext();
  if (!context || context.basePath) notFound();
  return <TenantFrame context={context} locale={await getGuestLocale()}>{children}</TenantFrame>;
}
