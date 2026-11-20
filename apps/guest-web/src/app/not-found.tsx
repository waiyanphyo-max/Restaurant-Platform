import { GuestState } from "@/components/GuestState";
import { getGuestLocale } from "@/lib/locale-server";
import { resolveGuestTenantContext } from "@/lib/tenant-server";
import { TenantFrame } from "@/components/TenantFrame";
import { loadGuestBranding } from "@/lib/branding-server";

export default async function NotFound() {
  const [context, locale] = await Promise.all([resolveGuestTenantContext(), getGuestLocale()]);
  const presentation = context ? await loadGuestBranding(context.restaurant) : undefined;
  return context ? <TenantFrame context={context} presentation={presentation} locale={locale}><GuestState kind="not-found" locale={locale} basePath={context.basePath} /></TenantFrame>
    : <main id="main-content" className="auth-shell"><GuestState kind="unknown" locale={locale} /></main>;
}
