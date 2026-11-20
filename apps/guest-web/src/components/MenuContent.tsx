"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { MenuProductDto, PublicMenuResponse } from "@restaurant-platform/shared-types";
import { messages, type GuestLocale } from "@/lib/i18n";
import { formatMenuPrice, isProductAvailable, productPriceRange } from "@/lib/menu";
import { filterMenuCategories, visibleFeaturedProduct } from "@/lib/menu-presentation";
import { formatGuestNumber } from "@/lib/guest-format";
import { GuestState } from "./GuestState";
import { ProductMedia } from "./ProductMedia";

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
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const categories = [...menu.categories].sort((a, b) => a.displayOrder - b.displayOrder);
  const visible = filterMenuCategories(menu, query, categoryId);
  const featured = visibleFeaturedProduct(menu, visible);
  const count = visible.reduce((sum, category) => sum + category.products.length, 0);
  const reset = () => { setQuery(""); setCategoryId(""); searchInput.current?.focus(); };
  if (!categories.some(category => category.products.length)) return <GuestState kind="empty" locale={locale} basePath={basePath} />;
  return <>
    <form className="menu-search ui-field" role="search" onSubmit={event => event.preventDefault()}>
      <label htmlFor="menu-search">{text.search}</label>
      <div className="search-controls"><input ref={searchInput} id="menu-search" type="search" value={query}
        placeholder={text.searchPlaceholder} onChange={event => setQuery(event.target.value)} aria-controls="menu-dishes" />
        {query && <button className="button button-secondary" type="button" onClick={() => { setQuery(""); searchInput.current?.focus(); }}>{text.clearSearch}</button>}
      </div>
    </form>
    <nav className="category-nav" aria-label={text.categories}>
      <button type="button" aria-pressed={!categoryId} aria-controls="menu-dishes" onClick={() => setCategoryId("")}>{text.allItems}</button>
      {categories.filter(category => category.products.length).map(category => <button type="button" aria-pressed={category.id === categoryId}
        aria-controls="menu-dishes" onClick={() => setCategoryId(category.id)} key={category.id}>{category.name}</button>)}
    </nav>
    <p className="search-feedback" role="status" aria-live="polite" aria-atomic="true">{formatGuestNumber(count, locale)} {text.results}</p>
    <div id="menu-dishes" className="menu-sections">
      {!count && <section className="search-empty ui-card" aria-labelledby="no-results-title"><h2 id="no-results-title">{text.noResults}</h2><p>{text.noResultsNote}</p><button type="button" className="button" onClick={reset}>{text.allItems}</button></section>}
      {visible.map(category => <section key={category.id} id={`category-${category.id}`} className="menu-category" aria-labelledby={`heading-${category.id}`}>
        <div className="section-heading"><h2 id={`heading-${category.id}`}>{category.name}</h2><span className="muted">{formatGuestNumber(category.products.length, locale)} {text.count}</span></div>
        {category.products.length ? <div className="menu-grid">{category.products.map(product => {
          return <article key={product.id} className={`product-card${featured?.id === product.id ? " is-featured" : ""}`}>
            <Link className="product-link" href={`${basePath}/menu/${product.id}`} prefetch={false}>
              <ProductMedia src={product.imageUrl} alt="" fallbackLabel={text.photoUnavailable} className="product-thumbnail" />
              <div className="product-summary">{featured?.id === product.id && <span className="featured-label">{text.featured}</span>}<h3>{product.name}</h3>{product.description && <p>{product.description}</p>}
                {product.variants.length > 0 && <span className="variant-price-note">{text.variantPrice}</span>}
                <ProductPrice product={product} currency={menu.currency} locale={locale} /><ProductAvailability product={product} locale={locale} />
                <span className="product-action">{text.details}</span>
              </div>
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
