import type { ReactNode } from "react";
import { setGuestLanguage } from "@/app/actions";
import { messages, type GuestLocale } from "@/lib/i18n";
import type { GuestTenantContext } from "@/lib/tenant-server";
import { GuestSession } from "./GuestSession";
import { GuestShell } from "./GuestShell";

export function TenantFrame({ context, locale, children }: { context: GuestTenantContext; locale: GuestLocale; children: ReactNode }) {
  const languageForm = <form action={setGuestLanguage} className="language-switch" aria-label={messages[locale].language}>
    <button name="language" value="en" lang="en" aria-pressed={locale === "en"}>EN</button>
    <button name="language" value="my" lang="my" aria-pressed={locale === "my"}>မြန်မာ</button>
  </form>;
  return <GuestSession key={context.restaurant.restaurantId} locale={locale} restaurantId={context.restaurant.restaurantId} basePath={context.basePath}>
    <GuestShell restaurant={context.restaurant} locale={locale} basePath={context.basePath} languageForm={languageForm}>{children}</GuestShell>
  </GuestSession>;
}
