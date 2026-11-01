import { GuestState } from "@/components/GuestState";
import { getGuestLocale } from "@/lib/locale-server";
import { resolveGuestTenantContext } from "@/lib/tenant-server";
import { TenantFrame } from "@/components/TenantFrame";

export default async function NotFound() {
  const [context, locale] = await Promise.all([resolveGuestTenantContext(), getGuestLocale()]);
  return context ? <TenantFrame context={context} locale={locale}><GuestState kind="not-found" locale={locale} basePath={context.basePath} /></TenantFrame>
    : <main id="main-content" className="auth-shell"><GuestState kind="unknown" locale={locale} /></main>;
}
