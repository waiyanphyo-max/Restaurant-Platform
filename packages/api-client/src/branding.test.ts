import { describe, expect, it, vi } from "vitest";
import type { RestaurantBrandingResponse, UpdateRestaurantBrandingRequest } from "@restaurant-platform/shared-types";
import {
  ApiConfigurationError, ApiHttpError, ApiNetworkError, ApiProtocolError, MissingAccessTokenError,
  createPlatformAdminApiClient, createPublicRestaurantApiClient, createRestaurantMemberApiClient
} from "./index.js";

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const red = { primaryColor: "#A51D22", secondaryColor: "#C99632", backgroundColor: "#FFF8F0" };
const blue = { primaryColor: "#124981", secondaryColor: "#143355", backgroundColor: "#101820" };
const first: RestaurantBrandingResponse = {
  restaurantId: firstId, displayName: "First fixture", logoUrl: `https://storage.example.test/first/logo.png?v=${firstId}`, palette: red, revision: 3
};
const second: RestaurantBrandingResponse = { restaurantId: secondId, displayName: "Second fixture", logoUrl: null, palette: blue, revision: 8 };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const authenticated = (fetchImpl: typeof fetch, restaurantId = firstId) =>
  createRestaurantMemberApiClient({ restaurantId, baseUrl: "https://api.example.test", getAccessToken: () => "member-token", fetchImpl });

describe("runtime restaurant branding", () => {
  it("reads the fixed tenant's minimal brand without credentials or HTTP caches", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ ...first, ownerUserId: "private", commonQrToken: "private", configuration: {} }));
    const client = createPublicRestaurantApiClient({ restaurantId: firstId.toUpperCase(), baseUrl: "https://api.example.test", fetchImpl });
    const response = await client.getBranding();
    expect(response).toEqual(first);
    expect(Object.keys(response).sort()).toEqual(["displayName", "logoUrl", "palette", "restaurantId", "revision"]);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe(`https://api.example.test/api/v1/public/restaurants/${firstId}/branding`);
    expect(init).toMatchObject({ method: "GET", cache: "no-store", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer" });
    expect((init?.headers as Headers).has("authorization")).toBe(false);
  });

  it("keeps two contrasting tenants and API environments independent with unconditional refresh", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async url => {
      const target = new URL(String(url));
      return json(target.pathname.includes(secondId) ? second : target.host.startsWith("staging") ? { ...first, palette: blue } : first);
    });
    const one = createPublicRestaurantApiClient({ restaurantId: firstId, baseUrl: "https://api.example.test", fetchImpl });
    const two = createPublicRestaurantApiClient({ restaurantId: secondId, baseUrl: "https://api.example.test", fetchImpl });
    const staging = createPublicRestaurantApiClient({ restaurantId: firstId, baseUrl: "https://staging-api.example.test", fetchImpl });
    const a = await one.getBranding(), b = await two.getBranding(), c = await staging.getBranding();
    expect(a.palette).toEqual(red);
    expect(b.palette).toEqual(blue);
    expect(c.palette).toEqual(blue);
    a.palette!.primaryColor = "#000000";
    expect((await one.getBranding()).palette).toEqual(red);
    expect(b.palette).toEqual(blue);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it.each([null, undefined, {}, { ...red, primaryColor: "red" }, { ...red, secondaryColor: "#fff" }, { ...red, backgroundColor: "#123456\n" }])(
    "returns null for missing/invalid palette (%j) so the caller can use its same-tenant UXI-01 fallback", async palette => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ ...first, palette }));
      const client = createPublicRestaurantApiClient({ restaurantId: firstId, baseUrl: "https://api.example.test", fetchImpl });
      await expect(client.getBranding()).resolves.toEqual({ ...first, palette: null });
    }
  );

  it("preserves the revision-zero absent-brand contract without substituting another restaurant's colors", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ ...second, palette: null, revision: 0 }));
    const client = createPublicRestaurantApiClient({ restaurantId: secondId, baseUrl: "https://api.example.test", fetchImpl });
    await expect(client.getBranding()).resolves.toEqual({ ...second, palette: null, revision: 0 });
  });

  it.each(["http://images.example.test/logo.png", "javascript:alert(1)", "https://user:pass@images.example.test/logo.png",
    "https://@images.example.test/logo.png", "https://images.example.test/logo.png#fragment", "https://images.example.test/logo.png#",
    "https:images.example.test/logo.png", "https://images.example.test/lo\ngo.png", " /logo.png", "https://images.example.test/" + "x".repeat(2000),
    "https://images.example.test/logo.png?token=private", "https://images.example.test/logo.png?X-Amz-Signature=private",
    "https://images.example.test/logo.png?signed=private", "https://images.example.test/logo.png?", "https://images.example.test/logo.png?v=approved",
    `https://images.example.test/logo.png?v=${firstId}&token=private`, `https://images.example.test/logo.png?v=${firstId}&v=${secondId}`,
    `https://images.example.test/logo.png?v=${firstId.replaceAll("-", "%2D")}`])(
    "discards an unsafe logo URL: %s", async logoUrl => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ ...first, logoUrl }));
      const client = createPublicRestaurantApiClient({ restaurantId: firstId, baseUrl: "https://api.example.test", fetchImpl });
      expect((await client.getBranding()).logoUrl).toBeNull();
    }
  );

  it.each(["https://images.example.test/logo.png", `https://images.example.test/logo.png?v=${firstId}`,
    "https://images.example.test/logo.png?v=AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"])(
    "preserves an unsigned public logo with only an optional UUID cachebuster: %s", async logoUrl => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ ...first, logoUrl }));
      const client = createPublicRestaurantApiClient({ restaurantId: firstId, baseUrl: "https://api.example.test", fetchImpl });
      expect((await client.getBranding()).logoUrl).toBe(logoUrl);
    }
  );

  it.each([{ restaurantId: secondId }, { restaurantId: null }, { revision: -1 }, { revision: 1.5 }, { revision: Number.MAX_SAFE_INTEGER + 1 }, { displayName: " " }])(
    "rejects a mismatched or invalid identity/revision: %j", async patch => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ ...first, ...patch }));
      const client = createPublicRestaurantApiClient({ restaurantId: firstId, baseUrl: "https://api.example.test", fetchImpl });
      await expect(client.getBranding()).rejects.toBeInstanceOf(ApiProtocolError);
    }
  );

  it("does not replace a caller's safe prior value when a refresh is offline", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(json(first)).mockRejectedValue(new Error("offline"));
    const client = createPublicRestaurantApiClient({ restaurantId: firstId, baseUrl: "https://api.example.test", fetchImpl });
    const previous = await client.getBranding();
    await expect(client.getBranding()).rejects.toBeInstanceOf(ApiNetworkError);
    expect(previous).toEqual(first);
  });

  it("writes only palette/revision through the bound member client with the current token", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ ...first, palette: blue, revision: 4 }));
    const client = authenticated(fetchImpl);
    const injected = { expectedRevision: 3, palette: { ...blue, logoUrl: "https://attacker.test/logo.png" },
      logoUrl: "https://attacker.test/logo.png", actorUserId: "someone", restaurantId: secondId, configuration: {} };
    await expect(client.updateBranding(injected)).resolves.toEqual({ ...first, palette: blue, revision: 4 });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe(`https://api.example.test/api/v1/restaurants/${firstId}/branding`);
    expect(init?.method).toBe("PUT");
    expect((init?.headers as Headers).get("authorization")).toBe("Bearer member-token");
    expect(JSON.parse(init?.body as string)).toEqual({ expectedRevision: 3, palette: blue });
    expect(init?.cache).toBe("no-store");
  });

  it.each([{ expectedRevision: -1, palette: red }, { expectedRevision: 0.5, palette: red }, { expectedRevision: Number.MAX_SAFE_INTEGER + 1, palette: red },
    { expectedRevision: 3 }, { expectedRevision: 3, palette: null }, { expectedRevision: 3, palette: { ...red, primaryColor: "#fff" } }])(
    "rejects malformed writes before fetching: %j", async request => {
      const fetchImpl = vi.fn<typeof fetch>();
      await expect(authenticated(fetchImpl).updateBranding(request as UpdateRestaurantBrandingRequest)).rejects.toBeInstanceOf(ApiConfigurationError);
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  );

  it.each([[401, "AUTHENTICATION_REQUIRED"], [403, "INSUFFICIENT_RESTAURANT_PERMISSION"], [409, "RESTAURANT_BRANDING_STALE"]] as const)(
    "preserves HTTP %s without retrying the save or replacing caller state", async (status, code) => {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ code, message: "Server error" }, status));
      await expect(authenticated(fetchImpl).updateBranding({ expectedRevision: 3, palette: blue })).rejects.toMatchObject({ status, code, name: "ApiHttpError" });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  );

  it("requires a bearer before a palette update", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const client = createRestaurantMemberApiClient({ restaurantId: firstId, baseUrl: "https://api.example.test", getAccessToken: () => null, fetchImpl });
    await expect(client.updateBranding({ expectedRevision: 3, palette: blue })).rejects.toBeInstanceOf(MissingAccessTokenError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects cross-tenant save and initialization responses", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json(second));
    await expect(authenticated(fetchImpl).updateBranding({ expectedRevision: 0, palette: blue })).rejects.toBeInstanceOf(ApiProtocolError);
    const admin = createPlatformAdminApiClient({ baseUrl: "https://api.example.test", getAccessToken: () => "admin", fetchImpl });
    await expect(admin.initializeBranding(firstId, { expectedRevision: 0, palette: blue })).rejects.toBeInstanceOf(ApiProtocolError);
  });

  it("initializes once through the exact trusted platform route with expected revision zero", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ ...first, revision: 1 }));
    const admin = createPlatformAdminApiClient({ baseUrl: "https://api.example.test", getAccessToken: () => "admin", fetchImpl });
    await expect(admin.initializeBranding(firstId, { expectedRevision: 0, palette: red })).resolves.toEqual({ ...first, revision: 1 });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe(`https://api.example.test/api/v1/platform/restaurants/${firstId}/branding`);
    expect(init?.method).toBe("POST");
    expect((init?.headers as Headers).get("authorization")).toBe("Bearer admin");
    expect(JSON.parse(init?.body as string)).toEqual({ expectedRevision: 0, palette: red });
    await expect(admin.initializeBranding(firstId, { expectedRevision: 1, palette: red })).rejects.toBeInstanceOf(ApiConfigurationError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("preserves platform-admin allowlist denial", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ code: "PLATFORM_ADMIN_REQUIRED" }, 403));
    const admin = createPlatformAdminApiClient({ baseUrl: "https://api.example.test", getAccessToken: () => "ordinary-member", fetchImpl });
    await expect(admin.initializeBranding(firstId, { expectedRevision: 0, palette: red })).rejects.toBeInstanceOf(ApiHttpError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
