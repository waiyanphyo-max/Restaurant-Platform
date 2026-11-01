import { getGuestLocale } from "@/lib/locale-server";
import { resolveGuestTenantContext } from "@/lib/tenant-server";
import { GuestState } from "./GuestState";

export async function TenantNotFound() {
  const [context, locale] = await Promise.all([resolveGuestTenantContext(), getGuestLocale()]);
  return <GuestState kind={context ? "not-found" : "unknown"} locale={locale} basePath={context?.basePath} />;
}
