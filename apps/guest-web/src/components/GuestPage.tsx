import Link from "next/link";
import { notFound } from "next/navigation";
import { messages } from "@/lib/i18n";
import { getGuestLocale } from "@/lib/locale-server";
import { resolveGuestTenantContext } from "@/lib/tenant-server";
import { loadGuestBranding } from "@/lib/branding-server";
import { resolveLegacyIntent, toUrlSearchParams, type PageSearchParams } from "@/lib/legacy-route";
import { findMenuProduct, formatMenuPrice, loadGuestMenu } from "@/lib/menu";
import { visibleFeaturedProduct } from "@/lib/menu-presentation";
import { MenuContent, ProductAvailability, ProductPrice, RestaurantContact } from "./MenuContent";
import { LegacyQrCredential } from "./LegacyQrCredential";
import { GuestState } from "./GuestState";
import { GuestOrdering } from "./GuestOrdering";
import { ProductConfigurator } from "./ProductConfigurator";
import { ProductMedia } from "./ProductMedia";

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
  if (result.kind !== "ready") return <><GuestOrdering currency="" /><GuestState kind={result.kind === "unavailable" ? "unavailable" : "error"} locale={locale} basePath={basePath} /></>;
  const menu = result.menu;
  const presentation = await loadGuestBranding(restaurant);
  const displayName = presentation.branding.displayName;
  const products = menu.categories.flatMap(category => category.products);
  const featured = visibleFeaturedProduct(menu, menu.categories);
  const isQr = intent.kind === "common-qr" || intent.kind === "table-qr";
  const MenuHeading = view === "home" && !isQr ? "h2" : "h1";

  if (view === "product") {
    const match = findMenuProduct(menu, productId ?? "");
    if (!match) notFound();
    const { product, category } = match;
    return <>
      <Link className="back-link" href={`${basePath}/menu`} prefetch={false}>← {text.back}</Link>
      <article className="product-detail has-image">
        <ProductMedia className="detail-image" src={product.imageUrl} alt={product.name} fallbackLabel={`${product.name} · ${text.photoUnavailable}`} width={640} height={480} priority />
        <div className="detail-copy"><span className="eyebrow">{category.name}</span>{featured?.id === product.id && <span className="featured-label">{text.featured}</span>}<h1>{product.name}</h1><ProductAvailability product={product} locale={locale} /><p className="description">{product.description || text.noDescription}</p><ProductPrice product={product} currency={menu.currency} locale={locale} />
          <ProductConfigurator product={product} currency={menu.currency} />
          {(product.variants.length > 0 || product.modifierGroups.length > 0) && <details className="option-reference"><summary>{[...(product.variants.length ? [text.variants] : []), ...(product.modifierGroups.length ? [text.modifiers] : [])].join(" / ")}</summary>
          {product.variants.length > 0 && <section className="choices-section" aria-labelledby="variant-heading"><h2 id="variant-heading">{text.variants}</h2><ul className="choice-list">{product.variants.map(variant => {
            return <li key={variant.id}><ProductMedia src={variant.imageUrl} alt="" fallbackLabel={text.photoUnavailable} className="variant-thumbnail" width={52} height={52} /><div><strong>{variant.name}</strong>{variant.description && <p className="variant-description">{variant.description}</p>}<span className="muted">{variant.available && product.available ? text.available : text.unavailable}</span></div><span className="choice-price">{variant.price === null ? text.priceUnavailable : formatMenuPrice(variant.price, menu.currency, locale)}</span></li>;
          })}</ul></section>}
          {product.modifierGroups.length > 0 && <section className="choices-section" aria-labelledby="modifier-heading"><h2 id="modifier-heading">{text.modifiers}</h2>{product.modifierGroups.map(group => <div key={group.id} className="modifier-group"><div className="modifier-heading"><h3>{group.name}</h3><span className="choice-label">{group.required ? text.required : text.optional}</span></div><p className="muted">{text.selectionRange}: {group.minSelections}–{group.maxSelections}</p>{group.options.length ? <ul className="choice-list">{group.options.map(option => <li key={option.id}><div><strong>{option.name}</strong>{!option.available && <span className="muted">{text.unavailable}</span>}</div><span className="choice-price">+{formatMenuPrice(option.additionalPrice, menu.currency, locale)}</span></li>)}</ul> : <p>{text.noOptions}</p>}</div>)}</section>}
          </details>}
          <p className="menu-footnote">{text.availabilityNote}</p>
        </div>
      </article>
      <GuestOrdering currency={menu.currency} products={products} />
      <RestaurantContact menu={menu} locale={locale} />
    </>;
  }

  return <>
    {isQr && <LegacyQrCredential />}
    {view === "home" && !isQr ? <section className="welcome-panel"><div className="welcome-copy"><span className="eyebrow">{text.welcome}</span><h1>{displayName}</h1><p>{menu.description || text.welcomeNote}</p><p className="browse-guidance">{text.browseNote}</p><a className="button" href="#our-menu">{text.browse}</a><span className="guest-note">{text.guestNote}</span></div>
      {featured && <div className="landing-featured"><ProductMedia src={featured.imageUrl} alt={featured.name} fallbackLabel={`${featured.name} · ${text.photoUnavailable}`} className="landing-photo" priority /><div><span className="featured-label">{text.featured}</span><h2>{featured.name}</h2><ProductPrice product={featured} currency={menu.currency} locale={locale} /><Link href={`${basePath}/menu/${featured.id}`} className="back-link" prefetch={false}>{text.details}</Link></div></div>}
    </section> : null}
    <div className="guest-menu-layout"><div className="menu-main">
      <section className="menu-heading" id="our-menu"><div><span className="eyebrow">{view === "home" && !isQr ? displayName : text.menu}</span><MenuHeading>{text.menuIntro}</MenuHeading></div><p>{text.guestNote}</p></section>
      <MenuContent key={menu.restaurantId} menu={menu} locale={locale} basePath={basePath} />
    </div><aside className="guest-order-rail" tabIndex={0} aria-label={text.orderSummary}><GuestOrdering currency={menu.currency} products={products} /></aside></div>
    <RestaurantContact menu={menu} locale={locale} />
  </>;
}
