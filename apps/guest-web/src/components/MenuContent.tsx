/* eslint-disable @next/next/no-img-element -- Public tenant media loads lazily in the browser without a server proxy allowlist. */
import Link from "next/link";
import type { MenuProductDto, PublicMenuResponse } from "@restaurant-platform/shared-types";
import { messages, type GuestLocale } from "@/lib/i18n";
import { formatMenuPrice, isProductAvailable, productPriceRange, safeImageUrl } from "@/lib/menu";
import { GuestState } from "./GuestState";

export function ProductPrice({ product, currency, locale }: { product: MenuProductDto; currency: string; locale: GuestLocale }) {
  const range = productPriceRange(product);
  if (!range) return <span className="price muted">{messages[locale].priceUnavailable}</span>;
  return <span className="price">{range.min !== range.max && <span className="price-prefix">{messages[locale].from} </span>}{formatMenuPrice(range.min, currency, locale)}</span>;
}

export function ProductAvailability({ product, locale }: { product: MenuProductDto; locale: GuestLocale }) {
  const available = isProductAvailable(product);
  const soldOut = product.trackStock && (product.stockQuantity ?? 0) <= 0;
  return <span className={`availability ${available ? "" : "availability-off"}`}><span aria-hidden="true" />{available ? messages[locale].available : soldOut ? messages[locale].soldOut : messages[locale].unavailable}</span>;
}

export function MenuContent({ menu, locale, basePath = "" }: { menu: PublicMenuResponse; locale: GuestLocale; basePath?: string }) {
  const text = messages[locale];
  const categories = [...menu.categories].sort((a, b) => a.displayOrder - b.displayOrder);
  if (!categories.some(category => category.products.length)) return <GuestState kind="empty" locale={locale} basePath={basePath} />;
  return <>
    <nav className="category-nav" aria-label={text.categories}>
      <a href="#menu-dishes">{text.allItems}</a>
      {categories.map(category => <a href={`#category-${category.id}`} key={category.id}>{category.name}</a>)}
    </nav>
    <div id="menu-dishes" className="menu-sections">
      {categories.map((category, index) => <section key={category.id} id={`category-${category.id}`} className="menu-category" aria-labelledby={`heading-${category.id}`}>
        <div className="section-heading"><div><span className="eyebrow">{String(index + 1).padStart(2, "0")}</span><h2 id={`heading-${category.id}`}>{category.name}</h2></div><span className="muted">{category.products.length} {text.count}</span></div>
        {category.products.length ? <div className="menu-grid">{category.products.map(product => {
          const image = safeImageUrl(product.imageUrl);
          return <article key={product.id} className="product-card">
            <Link className="product-link" href={`${basePath}/menu/${product.id}`} prefetch={false}>
              {image && <img className="product-thumbnail" src={image} alt="" width={160} height={160} loading="lazy" decoding="async" referrerPolicy="no-referrer" />}
              <div className="product-summary"><ProductAvailability product={product} locale={locale} /><h3>{product.name}</h3>{product.description && <p>{product.description}</p>}<div className="product-bottom"><ProductPrice product={product} currency={menu.currency} locale={locale} /><span className="detail-arrow" aria-label={text.details}>↗</span></div></div>
            </Link>
          </article>;
        })}</div> : <p className="muted">{text.noItems}</p>}
      </section>)}
    </div>
    <p className="menu-footnote">{text.availabilityNote}</p>
  </>;
}

export function RestaurantContact({ menu, locale }: { menu: PublicMenuResponse; locale: GuestLocale }) {
  const text = messages[locale];
  const phoneLink = menu.phone?.replace(/[^+\d]/g, "");
  return <section className="contact-panel" id="contact" aria-labelledby="contact-heading"><div><span className="eyebrow">{text.contact}</span><h2 id="contact-heading">{text.contactTitle}</h2><p>{text.hoursNote}</p></div><address>
    {menu.address && <div><span className="contact-label">{text.address}</span><p>{menu.address}</p></div>}
    {menu.phone && <div><span className="contact-label">{text.phone}</span><p>{phoneLink ? <a href={`tel:${phoneLink}`}>{menu.phone}</a> : menu.phone}</p></div>}
    {!menu.address && !menu.phone && <p>{text.contactMissing}</p>}
  </address></section>;
}
