import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import type { RestaurantConfig } from "@restaurant-platform/shared-types";
import { resolveThemeTokens, toWebThemeVariables } from "@restaurant-platform/ui-tokens";
import { messages, type GuestLocale } from "@/lib/i18n";
import { safeImageUrl } from "@/lib/menu";
import type { GuestBrandingPresentation } from "@/lib/branding-server";
import { GuestLogo } from "./GuestLogo";

export function GuestShell({ restaurant, presentation, locale, basePath = "", languageForm, children }: {
  restaurant: RestaurantConfig; locale: GuestLocale; basePath?: string;
  presentation?: GuestBrandingPresentation;
  languageForm?: ReactNode; children: ReactNode;
}) {
  const text = messages[locale];
  // Keep tokens on this tenant's subtree, never on a process-wide singleton or document root.
  const current = presentation?.restaurantId.toLowerCase() === restaurant.restaurantId.toLowerCase() ? presentation : undefined;
  const branding = current?.branding ?? restaurant.branding;
  const theme = resolveThemeTokens(branding, restaurant.branding);
  const style = {
    ...toWebThemeVariables(theme),
    "--brand-primary": theme.color.primary,
    "--brand-on-primary": theme.color.onPrimary,
  } as CSSProperties;
  const logo = current ? branding.logoUrl : safeImageUrl(branding.logoUrl);
  return <div className="guest-site" style={style}>
    <a className="skip-link" href="#main-content">{text.skip}</a>
    <header className="site-header">
      <div className="header-inner">
        <Link href={basePath || "/"} prefetch={false} className="brand">
          <GuestLogo key={logo ?? "no-logo"} src={logo} name={branding.displayName} />
          <span>{branding.displayName}</span>
        </Link>
        <nav aria-label={text.menu} className="primary-nav">
          <Link href={basePath || "/"} prefetch={false}>{text.home}</Link>
          <Link href={`${basePath}/menu`} prefetch={false}>{text.menu}</Link>
          <Link href={`${basePath || "/"}#contact`} prefetch={false}>{text.contact}</Link>
        </nav>
        {languageForm}
      </div>
    </header>
    <main id="main-content" tabIndex={-1} className="page-content">{children}</main>
    <footer className="site-footer"><span>{branding.displayName}</span><p>{text.footer}</p></footer>
  </div>;
}
