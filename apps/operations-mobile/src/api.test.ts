import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiCancelledError, ApiNetworkError, ApiProtocolError, TenantAccessError } from "@restaurant-platform/api-client";

const fixture = vi.hoisted(() => ({
  tenant: { restaurantId: "11111111-1111-4111-8111-111111111111", apiBaseUrl: "https://api.example.test", allowPrivateLanHttp: false },
  userId: "owner-a",
  getAccessToken: vi.fn<() => Promise<string | null>>()
}));
vi.mock("./tenant", () => ({ readEmbeddedTenant: () => fixture.tenant }));
vi.mock("./auth/native", () => ({ getOperationsAuth: () => ({
  getSnapshot: () => ({ status: "signed_in", userId: fixture.userId }),
  getAccessToken: fixture.getAccessToken
}) }));

import { getOperationsApi } from "./api";

const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const red = { primaryColor: "#A51D22", secondaryColor: "#C99632", backgroundColor: "#FFF8F0" };
const blue = { primaryColor: "#124981", secondaryColor: "#143355", backgroundColor: "#101820" };
const brand = (restaurantId = a, palette: typeof red | null = red, revision = 3) => ({
  restaurantId, displayName: restaurantId === a ? "Fixture A" : "Fixture B", logoUrl: "https://images.example.test/logo.png", palette, revision
});
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

beforeEach(() => {
  fixture.tenant = { restaurantId: a, apiBaseUrl: "https://api.example.test", allowPrivateLanHttp: false };
  fixture.userId = "owner-a";
  fixture.getAccessToken.mockReset().mockResolvedValue("member-token");
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Operations branding API integration", () => {
  it("reads the immutable tenant branding through the public transport without a bearer", async () => {
    fetchMock.mockResolvedValue(json(brand()));
    const api = getOperationsApi();
    await expect(api.getBranding()).resolves.toEqual(brand());
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`https://api.example.test/api/v1/public/restaurants/${a}/branding`);
    expect(options).toMatchObject({ method: "GET", credentials: "omit", cache: "no-store", redirect: "error" });
    expect((options?.headers as Headers).has("authorization")).toBe(false);
    expect(fixture.getAccessToken).not.toHaveBeenCalled();
  });

  it("keeps tenant and environment clients independent without sharing cached responses", async () => {
    fetchMock.mockImplementation(async target => {
      const url = new URL(String(target));
      return json(url.pathname.includes(b) ? brand(b, blue) : url.hostname.startsWith("staging") ? brand(a, blue) : brand());
    });
    const first = getOperationsApi();
    fixture.tenant = { ...fixture.tenant, restaurantId: b };
    const second = getOperationsApi();
    fixture.tenant = { ...fixture.tenant, restaurantId: a, apiBaseUrl: "https://staging-api.example.test" };
    const staging = getOperationsApi();
    expect((await first.getBranding()).palette).toEqual(red);
    expect((await second.getBranding()).palette).toEqual(blue);
    expect((await staging.getBranding()).palette).toEqual(blue);
    expect((await first.getBranding()).palette).toEqual(red);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("rejects a different restaurant UUID and filters unsafe logo data before the runtime consumer", async () => {
    fetchMock.mockResolvedValueOnce(json(brand(b))).mockResolvedValueOnce(json({ ...brand(), logoUrl: "https://images.example.test/logo.png?token=private" }));
    const api = getOperationsApi();
    await expect(api.getBranding()).rejects.toBeInstanceOf(ApiProtocolError);
    expect((await api.getBranding()).logoUrl).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("preserves a missing palette at revision zero without presenting embedded colors as persisted", async () => {
    fetchMock.mockResolvedValue(json(brand(a, null, 0)));
    await expect(getOperationsApi().getBranding()).resolves.toMatchObject({ restaurantId: a, palette: null, revision: 0 });
  });

  it("bounds a failed branding read to the existing single transport retry", async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValue(new Error("offline"));
    const pending = getOperationsApi().getBranding();
    const rejected = expect(pending).rejects.toBeInstanceOf(ApiNetworkError);
    await vi.runAllTimersAsync();
    await rejected;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("writes only the revision and palette using the original account's scoped bearer", async () => {
    fetchMock.mockResolvedValue(json(brand(a, blue, 4)));
    const assertCurrentAccess = vi.fn();
    const api = getOperationsApi({ userId: fixture.userId, assertCurrentAccess });
    const injected = { expectedRevision: 3, palette: { ...blue, logoUrl: "https://attacker.example.test/logo.png" },
      restaurantId: b, logoUrl: "https://attacker.example.test/logo.png", actorUserId: "other" };
    await expect(api.updateBranding(injected)).resolves.toEqual(brand(a, blue, 4));
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`https://api.example.test/api/v1/restaurants/${a}/branding`);
    expect(options?.method).toBe("PUT");
    expect((options?.headers as Headers).get("authorization")).toBe("Bearer member-token");
    expect(JSON.parse(options?.body as string)).toEqual({ expectedRevision: 3, palette: blue });
    expect(assertCurrentAccess).toHaveBeenCalledTimes(2);
  });

  it.each([[401, "AUTHENTICATION_REQUIRED"], [403, "INSUFFICIENT_RESTAURANT_PERMISSION"],
    [409, "RESTAURANT_BRANDING_STALE"], [500, "INTERNAL_SERVER_ERROR"]] as const)(
    "preserves HTTP %s for UI handling without retrying an uncertain palette write", async (status, code) => {
      fetchMock.mockResolvedValue(json({ code }, status));
      await expect(getOperationsApi().updateBranding({ expectedRevision: 3, palette: blue })).rejects.toMatchObject({ status, code });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  );

  it("does not retry a palette write when its response is lost", async () => {
    fetchMock.mockRejectedValue(new Error("response lost"));
    await expect(getOperationsApi().updateBranding({ expectedRevision: 3, palette: blue })).rejects.toBeInstanceOf(ApiNetworkError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("discards a pending bearer if sign-out or another account invalidates its access", async () => {
    let finish!: (value: string) => void;
    fixture.getAccessToken.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const api = getOperationsApi({ userId: fixture.userId, assertCurrentAccess: vi.fn() });
    const pending = api.updateBranding({ expectedRevision: 3, palette: blue });
    const rejected = expect(pending).rejects.toBeInstanceOf(TenantAccessError);
    fixture.userId = "other-account";
    finish("late-token");
    await rejected;
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("honors cancellation before either a public read or authenticated write starts", async () => {
    const controller = new AbortController();
    controller.abort();
    const api = getOperationsApi();
    await expect(api.getBranding({ signal: controller.signal })).rejects.toBeInstanceOf(ApiCancelledError);
    await expect(api.updateBranding({ expectedRevision: 3, palette: blue }, { signal: controller.signal })).rejects.toBeInstanceOf(ApiCancelledError);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fixture.getAccessToken).not.toHaveBeenCalled();
  });
});
