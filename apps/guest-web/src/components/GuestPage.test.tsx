import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { MenuProductDto, PublicMenuResponse, RestaurantConfig } from "@restaurant-platform/shared-types";
import { GuestShell } from "./GuestShell";
import { GuestPage } from "./GuestPage";

const mocks = vi.hoisted(() => ({
  tenant: vi.fn(), locale: vi.fn(), menu: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));
vi.mock("@/lib/tenant-server", () => ({ resolveGuestTenantContext: mocks.tenant }));
vi.mock("@/lib/locale-server", () => ({ getGuestLocale: mocks.locale }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/menu", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/menu")>(), loadGuestMenu: mocks.menu,
}));

const restaurantA = "11111111-1111-4111-8111-111111111111";
const restaurantB = "22222222-2222-4222-8222-222222222222";
const categoryId = "33333333-3333-4333-8333-333333333333";
const productA = "44444444-4444-4444-8444-444444444444";
const productB = "88888888-8888-4888-8888-888888888888";

function tenant(slug: string, restaurantId: string, color: string): RestaurantConfig {
  return {
    schemaVersion: 1, slug, restaurantId,
    branding: { displayName: slug === "garden" ? "Garden Kitchen" : "Tea House", primaryColor: color, logoUrl: `https://media.example.test/${slug}.webp` },
    guestDomains: { staging: [`${slug}.staging.test`], production: [`${slug}.example.test`] },
    android: {
      operations: { displayName: slug, stagingApplicationId: `com.${slug}.ops.staging`, productionApplicationId: `com.${slug}.ops` },
      customer: { displayName: slug, stagingApplicationId: `com.${slug}.guest.staging`, productionApplicationId: `com.${slug}.guest` },
    },
  };
}
const garden = tenant("garden", restaurantA, "#147D64");
const teaHouse = tenant("tea-house", restaurantB, "#974A16");

const dish: MenuProductDto = {
  id: productA, name: "Garden noodles", description: "Noodles with fresh greens", price: null,
  imageUrl: "https://media.example.test/noodles.webp", available: true, trackStock: false,
  stockQuantity: null,
  variants: [
    { id: "55555555-5555-4555-8555-555555555555", name: "Regular bowl", price: 3000, available: true, imageUrl: null },
    { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Large bowl", price: 4500, available: false, imageUrl: null },
  ],
  modifierGroups: [{
    id: "66666666-6666-4666-8666-666666666666", name: "Choose your topping", required: true,
    minSelections: 1, maxSelections: 1,
    options: [
      { id: "77777777-7777-4777-8777-777777777777", name: "Crispy tofu", additionalPrice: 500, available: true },
      { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Extra egg", additionalPrice: 700, available: false },
    ],
  }],
};
const menu: PublicMenuResponse = {
  restaurantId: restaurantA, restaurantName: "Garden Kitchen", slug: "garden",
  description: "Fresh meals from our kitchen", phone: "+959123456789", address: "Garden Street, Yangon",
  logoUrl: garden.branding.logoUrl ?? null, currency: "MMK",
  categories: [{ id: categoryId, name: "Noodles", displayOrder: 0, products: [dish] }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tenant.mockResolvedValue({ restaurant: garden, basePath: "" });
  mocks.locale.mockResolvedValue("en");
  mocks.menu.mockResolvedValue({ kind: "ready", menu });
});

describe("restaurant shell branding", () => {
  it("keeps two restaurants' names, logos and brand colors separate", () => {
    const a = renderToStaticMarkup(<GuestShell restaurant={garden} locale="en"><p>Menu</p></GuestShell>);
    const b = renderToStaticMarkup(<GuestShell restaurant={teaHouse} locale="en"><p>Menu</p></GuestShell>);
    expect(a).toContain("Garden Kitchen");
    expect(a).toContain("https://media.example.test/garden.webp");
    expect(a).toContain("--brand-primary:#147D64");
    expect(a).not.toContain("Tea House");
    expect(a).not.toContain("tea-house.webp");
    expect(b).toContain("Tea House");
    expect(b).toContain("https://media.example.test/tea-house.webp");
    expect(b).toContain("--brand-primary:#974A16");
    expect(b).not.toContain("Garden Kitchen");
    expect(b).not.toContain("garden.webp");
  });

  it("keeps local navigation on the resolved restaurant path and exposes accessible landmarks", () => {
    const html = renderToStaticMarkup(<GuestShell restaurant={garden} locale="my" basePath="/r/garden"><p>မီနူး</p></GuestShell>);
    expect(html).toContain('href="/r/garden/menu"');
    expect(html).toContain('href="/r/garden#contact"');
    expect(html).toContain('href="#main-content"');
    expect(html).toContain('id="main-content"');
    expect(html).toContain("ပင်မစာမျက်နှာ");
    expect(html).not.toContain('href="/auth');
    expect(html).not.toContain('type="password"');
  });
});

describe("public guest page routing", () => {
  it("does not request any menu for an unknown tenant", async () => {
    mocks.tenant.mockResolvedValue(null);
    await expect(GuestPage({ view: "home" })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.menu).not.toHaveBeenCalled();
  });

  it.each(["home", "menu", "workspace"] as const)("rejects a cross-restaurant legacy QR query on %s before calling Spring", async view => {
    await expect(GuestPage({ view, search: { view: view === "workspace" ? "table-order" : "customer-pickup", restaurantId: restaurantB } })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.menu).not.toHaveBeenCalled();
  });

  it("preserves a matching printed QR entry without requiring an account or exposing credentials", async () => {
    const page = await GuestPage({ view: "home", search: { view: "customer-pickup", restaurantId: restaurantA } });
    const html = renderToStaticMarkup(page);
    expect(mocks.menu).toHaveBeenCalledExactlyOnceWith(garden);
    expect(html).toContain("Garden noodles");
    expect(html).toContain("Checking your QR link");
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain('href="/auth');
    expect(html).not.toContain("qrToken");
  });

  it("loads menu cards and contact details only for the server-resolved tenant", async () => {
    mocks.tenant.mockResolvedValue({ restaurant: garden, basePath: "/r/garden" });
    const html = renderToStaticMarkup(await GuestPage({ slug: "garden", view: "menu" }));
    expect(mocks.tenant).toHaveBeenCalledWith("garden");
    expect(mocks.menu).toHaveBeenCalledExactlyOnceWith(garden);
    expect(html).toContain("Garden noodles");
    expect(html).toContain('href="/r/garden/menu/' + productA + '"');
    expect(html).toContain('href="tel:+959123456789"');
    expect(html).toContain("Garden Street, Yangon");
    expect(html).toContain("No account needed for QR ordering");
    expect(html).not.toContain("Tea House");
  });

  it("renders variant prices, modifier requirements and unavailable options from the menu API", async () => {
    const html = renderToStaticMarkup(await GuestPage({ view: "product", productId: productA }));
    expect(html).toContain('id="variant-heading"');
    expect(html).toContain("Regular bowl");
    expect(html).toContain("3,000");
    expect(html).toContain("Large bowl</strong><span class=\"muted\">Unavailable");
    expect(html).toContain("4,500");
    expect(html).toContain("Choose your topping");
    expect(html).toContain("Required");
    expect(html).toContain("Selections: 1–1");
    expect(html).toContain("Crispy tofu");
    expect(html).toContain("+MMK");
    expect(html).toContain("Extra egg</strong><span class=\"muted\">Unavailable");
    expect(html).not.toContain('type="password"');
  });

  it("rejects a product ID from another restaurant without fetching that restaurant", async () => {
    await expect(GuestPage({ view: "product", productId: productB })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.menu).toHaveBeenCalledExactlyOnceWith(garden);
    expect(mocks.notFound).toHaveBeenCalledOnce();
  });

  it("uses the second restaurant's own branding, dishes and contact details on its page", async () => {
    const otherMenu: PublicMenuResponse = {
      ...menu, restaurantId: restaurantB, restaurantName: "Tea House", slug: "tea-house",
      phone: "+959987654321", address: "Tea Street, Mandalay",
      categories: [{ ...menu.categories[0], name: "Tea", products: [{ ...dish, id: productB, name: "Tea House special", description: "House tea" }] }],
    };
    mocks.tenant.mockResolvedValue({ restaurant: teaHouse, basePath: "" });
    mocks.menu.mockResolvedValue({ kind: "ready", menu: otherMenu });
    const page = await GuestPage({ view: "home" });
    const html = renderToStaticMarkup(<GuestShell restaurant={teaHouse} locale="en">{page}</GuestShell>);
    expect(mocks.menu).toHaveBeenCalledExactlyOnceWith(teaHouse);
    expect(html).toContain("Tea House special");
    expect(html).toContain("Tea Street, Mandalay");
    expect(html).toContain('href="tel:+959987654321"');
    expect(html).toContain("--brand-primary:#974A16");
    expect(html).not.toContain("Garden Kitchen");
    expect(html).not.toContain("Garden noodles");
    expect(html).not.toContain("Garden Street");
  });

  it("keeps the resolved brand around an unavailable menu without fallback restaurant data", async () => {
    mocks.menu.mockResolvedValue({ kind: "unavailable" });
    const page = await GuestPage({ view: "menu" });
    const html = renderToStaticMarkup(<GuestShell restaurant={garden} locale="en">{page}</GuestShell>);
    expect(html).toContain("Garden Kitchen");
    expect(html).toContain("The restaurant is unavailable right now");
    expect(html).not.toContain("Tea House");
    expect(html).not.toContain("Garden noodles");
  });

  it("renders Burmese interface labels and numbers on product details", async () => {
    mocks.locale.mockResolvedValue("my");
    const html = renderToStaticMarkup(await GuestPage({ view: "product", productId: productA }));
    expect(html).toContain("မဖြစ်မနေ");
    expect(html).toContain("ရွေးချယ်နိုင်သည့် အရေအတွက်");
    expect(html).toContain("၃,၀၀၀");
    expect(html).toContain("မရရှိနိုင်ပါ");
  });
});
