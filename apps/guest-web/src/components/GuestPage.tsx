/* eslint-disable @next/next/no-img-element -- Public tenant media uses direct browser fetches with no referrer or server proxy. */
import Link from "next/link";
import { notFound } from "next/navigation";
import { messages } from "@/lib/i18n";
import { getGuestLocale } from "@/lib/locale-server";
import { resolveGuestTenantContext } from "@/lib/tenant-server";
import { resolveLegacyIntent, toUrlSearchParams, type PageSearchParams } from "@/lib/legacy-route";
import { findMenuProduct, formatMenuPrice, loadGuestMenu, safeImageUrl } from "@/lib/menu";
import { MenuContent, ProductAvailability, ProductPrice, RestaurantContact } from "./MenuContent";
import { LegacyQrCredential } from "./LegacyQrCredential";
import { GuestState } from "./GuestState";

export async function GuestPage({ slug, view, productId, search = {} }: {
  slug?: string; view: "home" | "menu" | "product" | "workspace";
  productId?: string; search?: PageSearchParams;
}) {
  const context = await resolveGuestTenantContext(slug);
  if (!context) notFound();
  const { restaurant, basePath } = context;
  const locale = await getGuestLocale();
  const text = messages[locale];
  const intent = resolveLegacyIntent(view === "workspace" ? "/workspace" : "/", toUrlSearchParams(search), restaurant.restaurantId);
  if (intent.kind === "invalid") notFound();
  if (intent.kind === "owner") return <section className="state-panel"><h1>{text.ownerTitle}</h1><p>{text.ownerNote}</p></section>;
  const result = await loadGuestMenu(restaurant);
  if (result.kind !== "ready") return <GuestState kind={result.kind === "unavailable" ? "unavailable" : "error"} locale={locale} basePath={basePath} />;
  const menu = result.menu;
  const isQr = intent.kind === "common-qr" || intent.kind === "table-qr";
  const MenuHeading = view === "home" && !isQr ? "h2" : "h1";

  if (view === "product") {
    const match = findMenuProduct(menu, productId ?? "");
    if (!match) notFound();
    const { product, category } = match;
    const image = safeImageUrl(product.imageUrl);
    return <>
      <Link className="back-link" href={`${basePath}/menu`} prefetch={false}>← {text.back}</Link>
      <article className={`product-detail ${image ? "has-image" : ""}`}>
        {image && <img className="detail-image" src={image} alt={product.name} width={640} height={640} decoding="async" referrerPolicy="no-referrer" />}
        <div className="detail-copy"><span className="eyebrow">{category.name}</span><h1>{product.name}</h1><ProductAvailability product={product} locale={locale} /><p className="description">{product.description || text.noDescription}</p><ProductPrice product={product} currency={menu.currency} locale={locale} />
          {product.variants.length > 0 && <section className="choices-section" aria-labelledby="variant-heading"><h2 id="variant-heading">{text.variants}</h2><ul className="choice-list">{product.variants.map(variant => {
            const variantImage = safeImageUrl(variant.imageUrl);
            return <li key={variant.id}>{variantImage && <img src={variantImage} alt="" width={52} height={52} loading="lazy" decoding="async" referrerPolicy="no-referrer" />}<div><strong>{variant.name}</strong><span className="muted">{variant.available && product.available ? text.available : text.unavailable}</span></div><span className="choice-price">{variant.price === null ? text.priceUnavailable : formatMenuPrice(variant.price, menu.currency, locale)}</span></li>;
          })}</ul></section>}
          {product.modifierGroups.length > 0 && <section className="choices-section" aria-labelledby="modifier-heading"><h2 id="modifier-heading">{text.modifiers}</h2>{product.modifierGroups.map(group => <div key={group.id} className="modifier-group"><div className="modifier-heading"><h3>{group.name}</h3><span className="choice-label">{group.required ? text.required : text.optional}</span></div><p className="muted">{text.selectionRange}: {group.minSelections}–{group.maxSelections}</p>{group.options.length ? <ul className="choice-list">{group.options.map(option => <li key={option.id}><div><strong>{option.name}</strong>{!option.available && <span className="muted">{text.unavailable}</span>}</div><span className="choice-price">+{formatMenuPrice(option.additionalPrice, menu.currency, locale)}</span></li>)}</ul> : <p>{text.noOptions}</p>}</div>)}</section>}
          <p className="menu-footnote">{text.availabilityNote}</p>
        </div>
      </article>
      <RestaurantContact menu={menu} locale={locale} />
    </>;
  }

  return <>
    {isQr && <LegacyQrCredential />}
    {view === "home" && !isQr ? <section className="welcome-panel"><div className="welcome-copy"><span className="eyebrow">{text.welcome}</span><h1>{menu.restaurantName}</h1><p>{menu.description || text.welcomeNote}</p><a className="button" href="#our-menu">{text.browse}<span aria-hidden="true">↗</span></a><span className="guest-note">{text.guestNote}</span></div><div className="welcome-art" aria-hidden="true"><div className="plate"><span>✳</span></div><span className="art-caption">{menu.restaurantName}</span></div></section> : null}
    <section className="menu-heading" id="our-menu"><div><span className="eyebrow">{view === "home" && !isQr ? menu.restaurantName : text.menu}</span><MenuHeading>{text.menuIntro}</MenuHeading></div><p>{text.guestNote}</p></section>
    <MenuContent menu={menu} locale={locale} basePath={basePath} />
    <RestaurantContact menu={menu} locale={locale} />
  </>;
}
