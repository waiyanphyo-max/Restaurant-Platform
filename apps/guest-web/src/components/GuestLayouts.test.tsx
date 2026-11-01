import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { RestaurantConfig } from "@restaurant-platform/shared-types";
import RestaurantLayout from "@/app/(restaurant)/layout";
import LocalRestaurantLayout from "@/app/r/[slug]/layout";
import RootLayout, { generateMetadata } from "@/app/layout";
import LocalProductPage from "@/app/r/[slug]/menu/[productId]/page";
import HostProductPage from "@/app/(restaurant)/menu/[productId]/page";
import LocalHomePage from "@/app/r/[slug]/page";
import LocalMenuPage from "@/app/r/[slug]/menu/page";
import LocalWorkspacePage from "@/app/r/[slug]/workspace/page";
import { GuestSession } from "./GuestSession";
import { TenantFrame } from "./TenantFrame";

const mocks = vi.hoisted(() => ({
  tenant: vi.fn(), locale: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));
vi.mock("@/lib/tenant-server", () => ({ resolveGuestTenantContext: mocks.tenant }));
vi.mock("@/lib/locale-server", () => ({ getGuestLocale: mocks.locale }));
vi.mock("@/app/actions", () => ({ setGuestLanguage: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

function restaurant(slug: string, id: string, color: string): RestaurantConfig {
  return {
    schemaVersion: 1, slug, restaurantId: id,
    branding: { displayName: `${slug} kitchen`, primaryColor: color, logoUrl: `https://media.example.test/${slug}.webp` },
    guestDomains: { staging: [`${slug}.staging.test`], production: [`${slug}.example.test`] },
    android: {
      operations: { displayName: slug, stagingApplicationId: `com.${slug}.ops.staging`, productionApplicationId: `com.${slug}.ops` },
      customer: { displayName: slug, stagingApplicationId: `com.${slug}.guest.staging`, productionApplicationId: `com.${slug}.guest` },
    },
  };
}
const garden = restaurant("garden", "11111111-1111-4111-8111-111111111111", "#147D64");
const tea = restaurant("tea", "22222222-2222-4222-8222-222222222222", "#974A16");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.locale.mockResolvedValue("en");
  mocks.tenant.mockResolvedValue({ restaurant: garden, basePath: "" });
});

describe("restaurant layout boundaries", () => {
  it("renders a configured host inside its own branding and root navigation", async () => {
    const html = renderToStaticMarkup(await RestaurantLayout({ children: <p>Host menu</p> }));
    expect(mocks.tenant).toHaveBeenCalledExactlyOnceWith();
    expect(html).toContain("garden kitchen");
    expect(html).toContain("--brand-primary:#147D64");
    expect(html).toContain('href="/menu"');
    expect(html).toContain("Host menu");
    expect(html).not.toContain("tea kitchen");
  });

  it("rejects unknown hosts before rendering branded children", async () => {
    mocks.tenant.mockResolvedValue(null);
    await expect(RestaurantLayout({ children: <p>Must stay hidden</p> })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.notFound).toHaveBeenCalledOnce();
    expect(mocks.locale).not.toHaveBeenCalled();
  });

  it("rejects local route context inside the host-only route group", async () => {
    mocks.tenant.mockResolvedValue({ restaurant: garden, basePath: "/r/garden" });
    await expect(RestaurantLayout({ children: <p>Wrong route group</p> })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.locale).not.toHaveBeenCalled();
  });

  it("renders each local slug with its own shell, locale and navigation base", async () => {
    mocks.tenant.mockResolvedValueOnce({ restaurant: garden, basePath: "/r/garden" });
    const a = renderToStaticMarkup(await LocalRestaurantLayout({ params: Promise.resolve({ slug: "garden" }), children: <p>A dishes</p> }));
    mocks.tenant.mockResolvedValueOnce({ restaurant: tea, basePath: "/r/tea" });
    mocks.locale.mockResolvedValue("my");
    const b = renderToStaticMarkup(await LocalRestaurantLayout({ params: Promise.resolve({ slug: "tea" }), children: <p>B dishes</p> }));
    expect(mocks.tenant.mock.calls).toEqual([["garden"], ["tea"]]);
    expect(a).toContain("garden kitchen");
    expect(a).toContain('href="/r/garden/menu"');
    expect(a).not.toContain("tea kitchen");
    expect(b).toContain("tea kitchen");
    expect(b).toContain("https://media.example.test/tea.webp");
    expect(b).toContain("--brand-primary:#974A16");
    expect(b).toContain('href="/r/tea/menu"');
    expect(b).toContain("ပင်မစာမျက်နှာ");
    expect(b).not.toContain("garden kitchen");
    expect(b).not.toContain("A dishes");
  });

  it("rejects an unresolved cross-restaurant path and a host-only context on local routes", async () => {
    mocks.tenant.mockResolvedValueOnce(null);
    await expect(LocalRestaurantLayout({ params: Promise.resolve({ slug: "other" }), children: <p>Foreign restaurant</p> })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.tenant).toHaveBeenCalledWith("other");
    mocks.tenant.mockResolvedValueOnce({ restaurant: garden, basePath: "" });
    await expect(LocalRestaurantLayout({ params: Promise.resolve({ slug: "garden" }), children: <p>Host context</p> })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.locale).not.toHaveBeenCalled();
  });

  it("keys the private QR provider by restaurant identity so tenant changes require a fresh provider", () => {
    const a = TenantFrame({ context: { restaurant: garden, basePath: "/r/garden" }, locale: "en", children: <p>A dishes</p> });
    const b = TenantFrame({ context: { restaurant: tea, basePath: "/r/tea" }, locale: "en", children: <p>B dishes</p> });
    expect(a.type).toBe(GuestSession);
    expect(b.type).toBe(GuestSession);
    expect(a.key).toBe(garden.restaurantId);
    expect(b.key).toBe(tea.restaurantId);
    expect(a.key).not.toBe(b.key);
  });
});

describe("root document and route wrappers", () => {
  it("keeps tenant branding below the root document and sets the document language", async () => {
    mocks.locale.mockResolvedValue("my");
    const html = renderToStaticMarkup(await RootLayout({ children: <p>Route content</p> }));
    expect(html).toContain('<html lang="my">');
    expect(html).toContain("Route content");
    expect(html).not.toContain("guest-site");
    expect(html).not.toContain("garden kitchen");
    expect(mocks.tenant).not.toHaveBeenCalled();
  });

  it("derives metadata only from the current resolved tenant and fails closed for unknown hosts", async () => {
    expect((await generateMetadata()).title).toBe("garden kitchen · Menu");
    mocks.tenant.mockResolvedValue({ restaurant: tea, basePath: "/r/tea" });
    expect((await generateMetadata()).title).toBe("tea kitchen · Menu");
    mocks.tenant.mockResolvedValue(null);
    const metadata = await generateMetadata();
    expect(metadata.title).toBe("Restaurant site unavailable");
    expect(JSON.stringify(metadata)).not.toContain("garden");
    expect(JSON.stringify(metadata)).not.toContain("tea kitchen");
  });

  it("preserves slug, product ID and legacy query in the local product wrapper", async () => {
    const search = { view: "customer-pickup", restaurantId: garden.restaurantId };
    const element = await LocalProductPage({ params: Promise.resolve({ slug: "garden", productId: "product-id" }), searchParams: Promise.resolve(search) });
    expect(element.props).toEqual({ view: "product", slug: "garden", productId: "product-id", search });
    const hostElement = await HostProductPage({ params: Promise.resolve({ productId: "product-id" }), searchParams: Promise.resolve(search) });
    expect(hostElement.props).toEqual({ view: "product", productId: "product-id", search });
  });

  it.each([
    ["home", LocalHomePage], ["menu", LocalMenuPage], ["workspace", LocalWorkspacePage],
  ] as const)("preserves the slug in the local %s wrapper", async (view, Page) => {
    const search = { restaurantId: garden.restaurantId };
    const element = await Page({ params: Promise.resolve({ slug: "garden" }), searchParams: Promise.resolve(search) });
    expect(element.props).toEqual({ view, slug: "garden", search });
  });
});
