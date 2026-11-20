import { afterEach, describe, expect, it, vi } from "vitest";
import type { RestaurantBrandingResponse } from "@restaurant-platform/shared-types";
import { loadGuestBranding } from "./branding-server";

const a = {
  restaurantId: "11111111-1111-4111-8111-111111111111",
  branding: { displayName: "San Thaw Tar fixture fallback", primaryColor: "#A51D22", secondaryColor: "#FCEAE7", backgroundColor: "#FFF8F0", logoUrl: "https://media.example.test/a-fallback.webp" },
};
const b = {
  restaurantId: "22222222-2222-4222-8222-222222222222",
  branding: { displayName: "Blue kitchen fallback", primaryColor: "#174A80", secondaryColor: "#E7F1FC", backgroundColor: "#FFFFFF", logoUrl: "https://media.example.test/b-fallback.webp" },
};
const first: RestaurantBrandingResponse = {
  restaurantId: a.restaurantId, displayName: "San Thaw Tar fixture current",
  logoUrl: "https://media.example.test/a.webp?v=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", revision: 3,
  palette: { primaryColor: "#A51D22", secondaryColor: "#F5CE82", backgroundColor: "#FFF9F2" },
};
const second: RestaurantBrandingResponse = {
  restaurantId: b.restaurantId, displayName: "Blue kitchen current", logoUrl: null, revision: 7,
  palette: { primaryColor: "#1B4D80", secondaryColor: "#DDEEFF", backgroundColor: "#FFFFFF" },
};
const baseUrl = "https://api.example.test";
const respond = (value: unknown) => vi.fn<typeof fetch>().mockResolvedValue(Response.json(value));

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("server-authoritative Guest branding", () => {
  it("reads only each resolved UUID with safe public transport and independent red/nonred presentations", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async target => {
      return Response.json(String(target).includes(a.restaurantId) ? first : second);
    });
    const one = await loadGuestBranding(a, { baseUrl, fetchImpl });
    const two = await loadGuestBranding(b, { baseUrl, fetchImpl });
    expect(one).toMatchObject({ restaurantId: a.restaurantId, source: "runtime", revision: 3, branding: { ...first.palette, displayName: first.displayName, logoUrl: first.logoUrl } });
    expect(two).toMatchObject({ restaurantId: b.restaurantId, source: "runtime", revision: 7, branding: { ...second.palette, displayName: second.displayName } });
    expect(two.branding.logoUrl).toBeUndefined();
    expect(JSON.stringify(one)).not.toContain(second.displayName);
    expect(JSON.stringify(two)).not.toContain(first.displayName);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const [index, restaurant] of [a, b].entries()) {
      const [url, init] = fetchImpl.mock.calls[index];
      expect(String(url)).toBe(`${baseUrl}/api/v1/public/restaurants/${restaurant.restaurantId}/branding`);
      expect(init).toMatchObject({ method: "GET", credentials: "omit", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer" });
      expect(new Headers(init?.headers).has("authorization")).toBe(false);
      expect(new Headers(init?.headers).has("cookie")).toBe(false);
    }
  });

  it("retains current public identity while truthfully falling back for revision-zero null palettes", async () => {
    const uninitialized = { ...first, revision: 0, palette: null, logoUrl: null };
    const value = await loadGuestBranding(a, { baseUrl, fetchImpl: respond(uninitialized) });
    expect(value).toEqual({
      restaurantId: a.restaurantId, revision: 0, source: "uninitialized",
      branding: { ...a.branding, displayName: first.displayName, logoUrl: undefined },
    });
  });

  it.each([
    { ...first, restaurantId: b.restaurantId },
    { ...first, revision: 0 },
    { ...first, palette: null },
    { ...first, palette: { ...first.palette, primaryColor: "red" } },
    { ...first, revision: -1 },
    { ...first, displayName: " " },
  ])("rejects foreign or malformed responses without retaining any of their identity or palette", async payload => {
    const value = await loadGuestBranding(a, { baseUrl, fetchImpl: respond(payload) });
    expect(value).toEqual({ restaurantId: a.restaurantId, revision: null, source: "fallback", branding: a.branding });
    expect(value.branding).not.toBe(a.branding);
  });

  it("falls back only to the requested tenant when the API is unavailable or its configuration is absent", async () => {
    vi.stubEnv("GUEST_API_BASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 }));
    expect((await loadGuestBranding(a, { baseUrl, fetchImpl })).branding).toEqual(a.branding);
    expect((await loadGuestBranding(b, { baseUrl, fetchImpl })).branding).toEqual(b.branding);
    expect((await loadGuestBranding(b)).source).toBe("fallback");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("fetches fresh palette and same-revision profile changes on a safe new request without mutating registry values", async () => {
    const original = structuredClone(a);
    const changed = { ...first, displayName: "New current name", logoUrl: null };
    const newPalette = { ...changed, revision: 4, palette: { ...first.palette!, secondaryColor: "#FFCC00" } };
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(first)).mockResolvedValueOnce(Response.json(changed)).mockResolvedValueOnce(Response.json(newPalette));
    const before = await loadGuestBranding(a, { baseUrl, fetchImpl });
    const after = await loadGuestBranding(a, { baseUrl, fetchImpl });
    const latest = await loadGuestBranding(a, { baseUrl, fetchImpl });
    expect(before.branding.displayName).toBe(first.displayName);
    expect(after.branding.displayName).toBe(changed.displayName);
    expect(after.revision).toBe(before.revision);
    expect(after.branding.logoUrl).toBeUndefined();
    expect(latest.branding.secondaryColor).toBe("#FFCC00");
    expect(latest.revision).toBe(4);
    expect(a).toEqual(original);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it.each(["javascript:alert(1)", "https://media.example.test/a.webp?token=private", "https://name:password@media.example.test/a.webp"])("drops unsafe runtime logos: %s", async logoUrl => {
    const result = await loadGuestBranding(a, { baseUrl, fetchImpl: respond({ ...first, logoUrl }) });
    expect(result.source).toBe("runtime");
    expect(result.branding.logoUrl).toBeUndefined();
  });

  it("does not trust a successful redirected or cross-origin branding response", async () => {
    const response = Response.json(first);
    Object.defineProperty(response, "url", { value: "https://foreign.example.test/branding" });
    const result = await loadGuestBranding(a, { baseUrl, fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(response) });
    expect(result.source).toBe("fallback");
    expect(result.branding).toEqual(a.branding);
  });
});
