import type { MenuProductDto, PublicMenuResponse } from "@restaurant-platform/shared-types";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  findMenuProduct,
  formatMenuPrice,
  isProductAvailable,
  loadGuestMenu,
  productPriceRange,
  safeImageUrl,
} from "./menu";

const restaurantA = "11111111-1111-4111-8111-111111111111";
const restaurantB = "22222222-2222-4222-8222-222222222222";
const categoryId = "33333333-3333-4333-8333-333333333333";
const productId = "44444444-4444-4444-8444-444444444444";
const variantId = "55555555-5555-4555-8555-555555555555";
const groupId = "66666666-6666-4666-8666-666666666666";
const optionId = "77777777-7777-4777-8777-777777777777";

function product(overrides: Partial<MenuProductDto> = {}): MenuProductDto {
  return {
    id: productId, name: "Tea", description: "Fresh tea", price: 2000,
    imageUrl: "https://media.example.test/tea.webp", available: true,
    trackStock: false, stockQuantity: null, variants: [], modifierGroups: [],
    ...overrides,
  };
}

function menu(restaurantId = restaurantA): PublicMenuResponse {
  return {
    restaurantId, restaurantName: restaurantId === restaurantA ? "Tea Garden" : "Other Restaurant",
    slug: restaurantId === restaurantA ? "tea-garden" : "other-restaurant",
    description: "A neighborhood tea shop", phone: "+959123456789", address: "Yangon",
    logoUrl: "https://media.example.test/logo.webp", currency: "MMK",
    categories: [{ id: categoryId, name: "Drinks", displayOrder: 0, products: [product()] }],
  };
}

function responseFetch(body: unknown, status = 200) {
  return vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), {
    status, headers: { "content-type": "application/json" },
  }));
}

afterEach(() => vi.unstubAllEnvs());

describe("restaurant-scoped public menu loading", () => {
  it("loads the real Spring public path without sessions, referrers, caches or redirects", async () => {
    const fetchImpl = responseFetch(menu());
    const result = await loadGuestMenu({ restaurantId: restaurantA }, { baseUrl: "http://localhost:8080", fetchImpl });
    expect(result.kind).toBe("ready");
    const [target, init] = fetchImpl.mock.calls[0];
    expect(String(target)).toBe(`http://localhost:8080/api/v1/public/restaurants/${restaurantA}/menu`);
    expect(init).toMatchObject({ method: "GET", credentials: "omit", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer" });
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBeNull();
    expect(headers.get("Cookie")).toBeNull();
    expect(headers.get("X-Restaurant-Id")).toBeNull();
  });

  it("rejects Restaurant B branding, products and contact details returned on Restaurant A's request", async () => {
    const result = await loadGuestMenu({ restaurantId: restaurantA }, {
      baseUrl: "https://api.example.test", fetchImpl: responseFetch(menu(restaurantB)),
    });
    expect(result).toEqual({ kind: "error" });
    expect(JSON.stringify(result)).not.toContain("Other Restaurant");
    expect(JSON.stringify(result)).not.toContain("+959");
  });

  it("makes separate scoped requests for two restaurants without reusing a previous menu", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async input => {
      const restaurantId = String(input).includes(restaurantA) ? restaurantA : restaurantB;
      return Response.json(menu(restaurantId));
    });
    const [a, b] = await Promise.all([
      loadGuestMenu({ restaurantId: restaurantA }, { baseUrl: "https://api.example.test", fetchImpl }),
      loadGuestMenu({ restaurantId: restaurantB }, { baseUrl: "https://api.example.test", fetchImpl }),
    ]);
    expect(a.kind === "ready" && a.menu.restaurantName).toBe("Tea Garden");
    expect(b.kind === "ready" && b.menu.restaurantName).toBe("Other Restaurant");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("strips unknown response fields instead of forwarding credentials or private metadata", async () => {
    const result = await loadGuestMenu({ restaurantId: restaurantA }, {
      baseUrl: "https://api.example.test", fetchImpl: responseFetch({ ...menu(), qrToken: "do-not-serialize", internalNotes: "private" }),
    });
    expect(result.kind).toBe("ready");
    expect(JSON.stringify(result)).not.toContain("do-not-serialize");
    expect(JSON.stringify(result)).not.toContain("internalNotes");
  });

  it.each([404, 410])("keeps configured tenant unavailable for backend status %i without another tenant fallback", async status => {
    const result = await loadGuestMenu({ restaurantId: restaurantA }, {
      baseUrl: "https://api.example.test", fetchImpl: responseFetch({ message: "sensitive backend text" }, status),
    });
    expect(result).toEqual({ kind: "unavailable" });
  });

  it("returns generic failure data for a timed-out request", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("private request URL")), { once: true });
    }));
    const result = await loadGuestMenu({ restaurantId: restaurantA }, {
      baseUrl: "https://api.example.test", fetchImpl, timeoutMs: 5,
    });
    expect(result).toEqual({ kind: "error" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("requires an explicit trusted API origin and never fetches a supplied insecure origin", async () => {
    vi.stubEnv("GUEST_API_BASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");
    const fetchImpl = responseFetch(menu());
    expect(await loadGuestMenu({ restaurantId: restaurantA }, { fetchImpl })).toEqual({ kind: "configuration-error" });
    expect(await loadGuestMenu({ restaurantId: restaurantA }, { baseUrl: "http://evil.example.test", fetchImpl })).toEqual({ kind: "configuration-error" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails closed on malformed nested products, duplicate IDs and unsafe prices", async () => {
    const malformed = [
      { ...menu(), categories: "not-an-array" },
      { ...menu(), categories: [{ ...menu().categories[0], products: [product({ price: -1 })] }] },
      { ...menu(), categories: [{ ...menu().categories[0], products: [product(), product()] }] },
      { ...menu(), currency: "not currency" },
    ];
    for (const body of malformed) {
      expect(await loadGuestMenu({ restaurantId: restaurantA }, {
        baseUrl: "https://api.example.test", fetchImpl: responseFetch(body),
      })).toEqual({ kind: "error" });
    }
  });

  it("accepts missing backend currency without assigning an invented currency", async () => {
    const result = await loadGuestMenu({ restaurantId: restaurantA }, {
      baseUrl: "https://api.example.test", fetchImpl: responseFetch({ ...menu(), currency: null }),
    });
    expect(result.kind === "ready" && result.menu.currency).toBe("");
  });
});

describe("menu browsing and availability", () => {
  it("looks up details only inside the current restaurant's fetched menu", () => {
    expect(findMenuProduct(menu(), productId)?.product.name).toBe("Tea");
    expect(findMenuProduct(menu(), restaurantB)).toBeUndefined();
    expect(findMenuProduct(menu(), "../menu")).toBeUndefined();
  });

  it("respects product availability, tracked stock, available variants and required modifier counts", () => {
    expect(isProductAvailable(product())).toBe(true);
    expect(isProductAvailable(product({ available: false }))).toBe(false);
    expect(isProductAvailable(product({ trackStock: true, stockQuantity: 0 }))).toBe(false);
    expect(isProductAvailable(product({ trackStock: true, stockQuantity: null }))).toBe(false);
    expect(isProductAvailable(product({ variants: [{ id: variantId, name: "Large", price: 3000, imageUrl: null, available: false }] }))).toBe(false);
    const requiredGroup = {
      id: groupId, name: "Milk", required: true, minSelections: 1, maxSelections: 1,
      options: [{ id: optionId, name: "Milk", additionalPrice: 500, available: false }],
    };
    expect(isProductAvailable(product({ modifierGroups: [requiredGroup] }))).toBe(false);
    expect(isProductAvailable(product({ modifierGroups: [{ ...requiredGroup, options: [{ ...requiredGroup.options[0], available: true }] }] }))).toBe(true);
  });

  it("uses variant prices without claiming unavailable lower prices are orderable", () => {
    expect(productPriceRange(product())).toEqual({ min: 2000, max: 2000 });
    expect(productPriceRange(product({ price: null }))).toBeNull();
    expect(productPriceRange(product({ variants: [
      { id: variantId, name: "Small", price: 1000, imageUrl: null, available: false },
      { id: optionId, name: "Large", price: 3000, imageUrl: null, available: true },
    ] }))).toEqual({ min: 3000, max: 3000 });
  });

  it("formats English and Burmese price labels with a number-only missing-currency fallback", () => {
    expect(formatMenuPrice(2000, "MMK", "en")).toContain("2,000");
    expect(formatMenuPrice(2000, "", "en")).toBe("2,000");
    expect(formatMenuPrice(2000, "", "my")).toBe("၂,၀၀၀");
  });

  it("allows public HTTPS images and blocks unsafe or credential-bearing URLs", () => {
    expect(safeImageUrl("https://media.example.test/logo.webp")).toBe("https://media.example.test/logo.webp");
    for (const value of [undefined, null, "javascript:alert(1)", "data:image/svg+xml,anything", "//other.example.test/logo", "http://media.example.test/logo", "https://user:pass@media.example.test/logo", "https://media.example.test/logo?qrToken=secret", "https://media.example.test/logo#qrToken=secret"]) {
      expect(safeImageUrl(value)).toBeUndefined();
    }
  });
});
