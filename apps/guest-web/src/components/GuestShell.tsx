/* eslint-disable @next/next/no-img-element -- Browser-only tenant media avoids an unrestricted server image proxy. */
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import type { RestaurantConfig } from "@restaurant-platform/shared-types";
import { resolveThemeTokens, toWebThemeVariables } from "@restaurant-platform/ui-tokens";
import { messages, type GuestLocale } from "@/lib/i18n";
import { safeImageUrl } from "@/lib/menu";

export function GuestShell({ restaurant, locale, basePath = "", languageForm, children }: {
  restaurant: RestaurantConfig; locale: GuestLocale; basePath?: string;
  languageForm?: ReactNode; children: ReactNode;
}) {
  const text = messages[locale];
  // Keep tokens on this tenant's subtree, never on a process-wide singleton or document root.
  // UXI-02 can supply validated branding through the existing restaurant presentation contract.
  const theme = resolveThemeTokens(restaurant.branding);
  const style = {
    ...toWebThemeVariables(theme),
    "--brand-primary": theme.color.primary,
    "--brand-on-primary": theme.color.onPrimary,
  } as CSSProperties;
  const logo = safeImageUrl(restaurant.branding.logoUrl);
  return <div className="guest-site" style={style}>
    <a className="skip-link" href="#main-content">{text.skip}</a>
    <header className="site-header">
      <div className="header-inner">
        <Link href={basePath || "/"} prefetch={false} className="brand">
          {logo ? <img src={logo} width={44} height={44} alt="" referrerPolicy="no-referrer" /> : <span className="brand-monogram" aria-hidden="true">{restaurant.branding.displayName.slice(0, 1)}</span>}
          <span>{restaurant.branding.displayName}</span>
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
    <footer className="site-footer"><span>{restaurant.branding.displayName}</span><p>{text.footer}</p></footer>
  </div>;
}
