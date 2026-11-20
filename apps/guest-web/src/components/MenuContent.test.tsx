import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { MenuProductDto, PublicMenuResponse } from "@restaurant-platform/shared-types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { messages, type GuestLocale } from "@/lib/i18n";

const harness = vi.hoisted(() => ({ values: [] as unknown[], refs: [] as { current: unknown }[], index: 0, refIndex: 0 }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState(initial: unknown) {
    const index = harness.index++;
    if (!(index in harness.values)) harness.values[index] = initial;
    return [harness.values[index], (value: unknown) => { harness.values[index] = value; }];
  },
  useRef(initial: unknown) { const index = harness.refIndex++; return harness.refs[index] ??= { current: initial }; },
}));
// Media lifecycle is exercised separately; keep the menu's state harness scoped to its own hooks.
vi.mock("./ProductMedia", () => ({ ProductMedia: ({ fallbackLabel }: { fallbackLabel: string }) => <span role="img" aria-label={fallbackLabel} /> }));
import { MenuContent, ProductAvailability, ProductPrice } from "./MenuContent";

const dish: MenuProductDto = {
  id: "11111111-1111-4111-8111-111111111111", name: "Featured rice", description: "Crisp vegetables", price: 1750,
  imageUrl: null, available: true, trackStock: false, stockQuantity: null, variants: [], modifierGroups: [],
};
const tea: MenuProductDto = { ...dish, id: "22222222-2222-4222-8222-222222222222", name: "လက်ဖက်ရည် Tea", description: "Jasmine brew",
  price: null, variants: [{ id: "33333333-3333-4333-8333-333333333333", name: "Family pot", price: 4300, imageUrl: null, available: true }] };
const menu: PublicMenuResponse = {
  restaurantId: "44444444-4444-4444-8444-444444444444", restaurantName: "San Thaw Tar synthetic", slug: null,
  description: null, phone: null, address: null, logoUrl: null, currency: "MMK",
  featuredProduct: { productId: tea.id, status: "AVAILABLE" }, categories: [
    { id: "55555555-5555-4555-8555-555555555555", name: "Kitchen", displayOrder: 0, products: [dish] },
    { id: "66666666-6666-4666-8666-666666666666", name: "Drinks", displayOrder: 1, products: [tea] },
  ],
};
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement<Record<string, unknown>>(node) ? [node, ...elements(node.props.children as ReactNode)] : [];
}
function content(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(content).join("");
  if (isValidElement<Record<string, unknown>>(node)) return content(node.props.children as ReactNode);
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
function render(data = menu, locale: GuestLocale = "en") {
  harness.index = 0; harness.refIndex = 0;
  return MenuContent({ menu: data, locale, basePath: "/r/synthetic-a" });
}
function search(tree: ReactNode, value: string) {
  const input = elements(tree).find(element => element.type === "input" && element.props.type === "search")!;
  (input.props.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
}
function button(tree: ReactNode, title: string) {
  return elements(tree).find(element => element.type === "button" && content(element) === title)!;
}
function click(element: ReactElement<Record<string, unknown>>) { (element.props.onClick as () => void)(); }
function cards(tree: ReactNode) { return elements(tree).filter(element => element.type === "article"); }
beforeEach(() => { harness.values = []; harness.refs = []; });

describe("interactive tenant menu", () => {
  it("searches current backend dishes, descriptions and variant names without changing routes", () => {
    const tree = render();
    search(tree, " TEA  family ");
    const filtered = render();
    expect(cards(filtered)).toHaveLength(1);
    expect(content(cards(filtered)[0])).toContain(tea.name);
    expect(content(filtered)).not.toContain(dish.name);
    const html = renderToStaticMarkup(filtered);
    expect(html).toContain(`/r/synthetic-a/menu/${tea.id}`);
    expect(html).not.toContain("?search=");
    expect(html).toContain('role="search"');
    expect(html).toContain('for="menu-search"');
    expect(html).toContain('aria-controls="menu-dishes"');
  });

  it("combines category selection and search with pressed-state feedback", () => {
    click(button(render(), "Kitchen"));
    let tree = render();
    expect(cards(tree)).toHaveLength(1);
    expect(content(cards(tree)[0])).toContain(dish.name);
    expect(button(tree, "Kitchen").props["aria-pressed"]).toBe(true);
    expect(button(tree, "Drinks").props["aria-pressed"]).toBe(false);
    search(tree, "tea");
    tree = render();
    expect(cards(tree)).toHaveLength(0);
    expect(content(tree)).toContain(messages.en.noResults);
    expect(elements(tree).find(element => element.props.role === "status")?.props["aria-live"]).toBe("polite");
  });

  it("clears the search with keyboard focus and keeps the chosen category", () => {
    click(button(render(), "Kitchen"));
    search(render(), "missing dish");
    const focus = vi.fn(); harness.refs[0].current = { focus };
    click(button(render(), messages.en.clearSearch));
    const tree = render();
    expect(cards(tree)).toHaveLength(1);
    expect(content(cards(tree)[0])).toContain(dish.name);
    expect(button(tree, "Kitchen").props["aria-pressed"]).toBe(true);
    expect(elements(tree).find(element => element.type === "input")?.props.value).toBe("");
    expect(focus).toHaveBeenCalledOnce();
  });

  it("returns from no results to the complete current menu and focuses search", () => {
    click(button(render(), "Drinks")); search(render(), "missing");
    const focus = vi.fn(); harness.refs[0].current = { focus };
    const tree = render();
    const noResults = elements(tree).find(element => element.props.className === "search-empty ui-card")!;
    click(button(noResults, messages.en.allItems));
    const reset = render();
    expect(cards(reset)).toHaveLength(2);
    expect(button(reset, messages.en.allItems).props["aria-pressed"]).toBe(true);
    expect(elements(reset).find(element => element.type === "input")?.props.value).toBe("");
    expect(focus).toHaveBeenCalledOnce();
  });

  it("shows Featured only on the selected visible UUID, never the first product or a matching title", () => {
    const tree = render();
    const featured = cards(tree).filter(card => String(card.props.className).includes("is-featured"));
    expect(featured).toHaveLength(1);
    expect(content(featured[0])).toContain(tea.name);
    expect(content(featured[0])).toContain(messages.en.featured);
    expect(content(cards(tree)[0])).toContain(dish.name);
    search(tree, "rice");
    expect(renderToStaticMarkup(render())).not.toContain('class="featured-label"');
  });

  it.each([undefined, { productId: null, status: "NONE" as const }, { productId: tea.id, status: "UNAVAILABLE" as const },
    { productId: "77777777-7777-4777-8777-777777777777", status: "AVAILABLE" as const }])("does not invent Featured for missing or invalid association %j", featuredProduct => {
    const html = renderToStaticMarkup(render({ ...menu, featuredProduct }));
    expect(html).not.toContain('class="featured-label"');
    expect(html).toContain(dish.name);
    expect(html).toContain(tea.name);
  });

  it("keeps a second restaurant's independent catalog and prices without retaining A's cards", () => {
    render();
    const b: PublicMenuResponse = { ...menu, restaurantId: "88888888-8888-4888-8888-888888888888", restaurantName: "Blue kitchen synthetic",
      featuredProduct: { productId: null, status: "NONE" }, categories: [{ ...menu.categories[0], name: "Blue bowls",
        products: [{ ...dish, id: "99999999-9999-4999-8999-999999999999", name: "Blue soup", price: 6275 }] }] };
    const html = renderToStaticMarkup(render(b));
    expect(html).toContain("Blue soup"); expect(html).toContain("6,275");
    expect(html).not.toContain(tea.name); expect(html).not.toContain(dish.name);
    expect(html).not.toContain('class="featured-label"');
  });

  it.each(["en", "my"] as const)("announces localized result counts and no-results recovery in %s", locale => {
    const html = renderToStaticMarkup(render(menu, locale));
    expect(html).toContain(messages[locale].search); expect(html).toContain(messages[locale].featured);
    expect(html).toContain(messages[locale].results);
    expect(html).toContain(locale === "my" ? "၂" : "2");
    search(render(menu, locale), "missing");
    expect(content(render(menu, locale))).toContain(messages[locale].noResults);
    expect(content(render(menu, locale))).toContain(messages[locale].allItems);
  });

  it("escapes current menu text and query input while keeping UUID navigation", () => {
    const malicious = { ...dish, name: '<script>alert("menu")</script>', description: '<img onerror="bad">' };
    const data: PublicMenuResponse = { ...menu, categories: [{ ...menu.categories[0], products: [malicious] }] };
    search(render(data), '<script>alert("menu")</script>');
    const html = renderToStaticMarkup(render(data));
    expect(html).toContain("&lt;script&gt;"); expect(html).toContain("&lt;img onerror=");
    expect(html).not.toContain("<script>"); expect(html).not.toContain('<img onerror="bad">');
    expect(html).toContain(`/menu/${dish.id}`);
  });

  it("renders a truthful empty menu before adding a search or fake categories", () => {
    const html = renderToStaticMarkup(render({ ...menu, categories: [] }));
    expect(html).toContain(messages.en.emptyTitle);
    expect(html).not.toContain('type="search"'); expect(html).not.toContain("product-card");
  });
});

describe("backend availability and whole-currency prices", () => {
  it("shows actual selected variant range and excludes unavailable lower prices", () => {
    const product = { ...tea, variants: [{ ...tea.variants[0], price: 4300 }, { ...tea.variants[0], id: "other", price: 100, available: false }] };
    const html = renderToStaticMarkup(<ProductPrice product={product} currency="MMK" locale="en" />);
    expect(html).toContain("4,300"); expect(html).not.toContain("100");
    expect(renderToStaticMarkup(<ProductPrice product={{ ...dish, price: null }} currency="" locale="en" />)).toContain(messages.en.priceUnavailable);
  });

  it("labels sold-out stock and unavailable variants with text in both languages", () => {
    for (const locale of ["en", "my"] as const) {
      expect(renderToStaticMarkup(<ProductAvailability product={{ ...dish, trackStock: true, stockQuantity: 0 }} locale={locale} />)).toContain(messages[locale].soldOut);
      expect(renderToStaticMarkup(<ProductAvailability product={{ ...tea, variants: [{ ...tea.variants[0], available: false }] }} locale={locale} />)).toContain(messages[locale].unavailable);
    }
  });
});
