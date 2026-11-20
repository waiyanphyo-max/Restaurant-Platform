import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiCancelledError, ApiNetworkError, ApiProtocolError, MissingAccessTokenError } from "@restaurant-platform/api-client";

const mocks = vi.hoisted(() => ({ owner: "customer-a", token: vi.fn(), fetch: vi.fn(),
  tenant: { apiBaseUrl: "https://api.example.test", restaurantId: "d7695964-9b50-455a-9065-620e49a9b947" }
}));
vi.mock("./auth/native", () => ({ getCustomerAuth: () => ({
  getSnapshot: () => ({ status: "signed_in", userId: mocks.owner }),
  getAccessToken: mocks.token
}) }));
vi.mock("./tenant", () => ({ readEmbeddedTenant: () => mocks.tenant }));

import { getCustomerApi, getCustomerPublicApi } from "./api";

describe("customer API token ownership", () => {
  beforeEach(() => {
    mocks.owner = "customer-a";
    mocks.token.mockReset();
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("blocks a pending checkout from binding to a different signed-in customer", async () => {
    mocks.owner = "customer-b";
    await expect(getCustomerApi("customer-a").listAddresses()).rejects.toBeInstanceOf(MissingAccessTokenError);
    expect(mocks.token).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("rechecks the bound owner after asynchronous access-token refresh", async () => {
    mocks.token.mockImplementation(async () => {
      mocks.owner = "customer-b";
      return "different-customer-token";
    });
    await expect(getCustomerApi().listAddresses()).rejects.toBeInstanceOf(MissingAccessTokenError);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

describe("Customer public runtime branding adapter", () => {
  const a = "11111111-1111-4111-8111-111111111111";
  const b = "22222222-2222-4222-8222-222222222222";
  const palette = { primaryColor: "#A51D22", secondaryColor: "#C99632", backgroundColor: "#FFF8F0" };
  const brand = (restaurantId = a) => ({ restaurantId, displayName: "Runtime restaurant", logoUrl: null, palette, revision: 1 });
  const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
  beforeEach(() => {
    mocks.tenant = { restaurantId: a, apiBaseUrl: "https://api-a.example.test" };
    mocks.fetch.mockReset(); mocks.token.mockReset(); vi.stubGlobal("fetch", mocks.fetch);
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("uses the embedded UUID and selected Spring origin with no bearer, cookies or persistent HTTP cache", async () => {
    mocks.fetch.mockResolvedValue(json(brand()));
    await expect(getCustomerPublicApi().getBranding()).resolves.toEqual(brand());
    const [url, options] = mocks.fetch.mock.calls[0];
    expect(String(url)).toBe(`https://api-a.example.test/api/v1/public/restaurants/${a}/branding`);
    expect(options).toMatchObject({ method: "GET", credentials: "omit", cache: "no-store", redirect: "error" });
    expect(options.headers.has("authorization")).toBe(false); expect(mocks.token).not.toHaveBeenCalled();
  });

  it("keeps A, B and staging/production clients independent without reselecting their bound tenant", async () => {
    mocks.fetch.mockImplementation(async target => {
      const url = new URL(String(target));
      return json({ ...brand(url.pathname.includes(b) ? b : a), displayName: url.hostname,
        palette: { ...palette, primaryColor: url.pathname.includes(b) ? "#124981" : palette.primaryColor } });
    });
    const first = getCustomerPublicApi();
    mocks.tenant = { restaurantId: b, apiBaseUrl: "https://api-b.example.test" }; const second = getCustomerPublicApi();
    mocks.tenant = { restaurantId: a, apiBaseUrl: "https://production-api.example.test" }; const production = getCustomerPublicApi();
    expect((await first.getBranding()).palette?.primaryColor).toBe("#A51D22");
    expect((await second.getBranding()).palette?.primaryColor).toBe("#124981");
    expect((await production.getBranding()).displayName).toBe("production-api.example.test");
    expect((await first.getBranding()).displayName).toBe("api-a.example.test");
  });

  it("rejects foreign response UUIDs and filters malformed palettes and unsafe logos", async () => {
    mocks.fetch.mockResolvedValueOnce(json(brand(b))).mockResolvedValueOnce(json({ ...brand(),
      palette: { ...palette, primaryColor: "red" }, logoUrl: "https://images.example.test/logo.png?token=private" }));
    await expect(getCustomerPublicApi().getBranding()).rejects.toBeInstanceOf(ApiProtocolError);
    await expect(getCustomerPublicApi().getBranding()).resolves.toMatchObject({ palette: null, logoUrl: null });
  });

  it("keeps two public catalogs bound to their embedded UUID and origin and rejects a foreign menu", async () => {
    const publicMenu = (restaurantId: string, name: string, productId: string) => ({ restaurantId, restaurantName: name,
      slug: null, description: null, phone: null, address: null, logoUrl: null, currency: "MMK",
      categories: [{ id: productId, name: `${name} meals`, displayOrder: 0, products: [{ id: productId, name: `${name} dish`,
        description: null, price: restaurantId === a ? 1750 : 4200, imageUrl: null, available: true, trackStock: false,
        stockQuantity: null, variants: [], modifierGroups: [] }] }] });
    const catalogA = publicMenu(a, "Restaurant A", "33333333-3333-4333-8333-333333333333");
    const catalogB = publicMenu(b, "Restaurant B", "44444444-4444-4444-8444-444444444444");
    mocks.fetch.mockImplementation(async target => json(String(target).startsWith("https://api-a.example.test/") ? catalogA : catalogB));
    const first = getCustomerPublicApi();
    mocks.tenant = { restaurantId: b, apiBaseUrl: "https://api-b.example.test" };
    const second = getCustomerPublicApi();
    expect((await first.getPublicMenu()).categories[0].products[0].name).toBe("Restaurant A dish");
    expect((await second.getPublicMenu()).categories[0].products[0].name).toBe("Restaurant B dish");
    expect(String(mocks.fetch.mock.calls[0][0])).toBe(`https://api-a.example.test/api/v1/public/restaurants/${a}/menu`);
    expect(String(mocks.fetch.mock.calls[1][0])).toBe(`https://api-b.example.test/api/v1/public/restaurants/${b}/menu`);
    mocks.fetch.mockResolvedValue(json(catalogB));
    await expect(first.getPublicMenu()).rejects.toBeInstanceOf(ApiProtocolError);
    expect(mocks.token).not.toHaveBeenCalled();
  });

  it.each(["foreign-origin", "redirect"])("rejects a %s response rather than accepting branding from another API environment", async reason => {
    const response = json(brand());
    if (reason === "foreign-origin") Object.defineProperty(response, "url", { value: "https://other-api.example.test/api/v1/public/branding" });
    else Object.defineProperty(response, "redirected", { value: true });
    mocks.fetch.mockResolvedValue(response);
    await expect(getCustomerPublicApi().getBranding()).rejects.toBeInstanceOf(ApiProtocolError);
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });

  it("uses the bounded single GET retry and honors cancellation", async () => {
    vi.useFakeTimers(); mocks.fetch.mockRejectedValue(new Error("offline"));
    const pending = getCustomerPublicApi().getBranding(); const rejected = expect(pending).rejects.toBeInstanceOf(ApiNetworkError);
    await vi.runAllTimersAsync(); await rejected; expect(mocks.fetch).toHaveBeenCalledTimes(2);
    const controller = new AbortController(); controller.abort();
    await expect(getCustomerPublicApi().getBranding({ signal: controller.signal })).rejects.toBeInstanceOf(ApiCancelledError);
    expect(mocks.fetch).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
  });
});
