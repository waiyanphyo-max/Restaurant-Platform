import { describe, expect, it, vi } from "vitest";
import { createDeviceApiClient, createCustomerDeviceApiClient, createCustomerApiClient, createPublicRestaurantApiClient, ApiProtocolError } from "./index.js";
const restaurantId = "11111111-1111-4111-8111-111111111111";
const addressId = "22222222-2222-4222-8222-222222222222";
const origin = "https://api.example.test";
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
describe("customer native contracts", () => {
  it("associates Android device by bearer identity with no client user UUID", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ id: addressId, platform: "ANDROID", active: true }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const api = createDeviceApiClient({ baseUrl: origin, getAccessToken: () => "verified-session", fetchImpl });
    await api.registerDevice("native-fcm-token"); await api.deactivateDevice(addressId);
    expect(new URL(String(fetchImpl.mock.calls[0][0])).pathname).toBe("/api/v1/devices");
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toEqual({ pushToken: "native-fcm-token", platform: "ANDROID" });
    expect(new Headers(fetchImpl.mock.calls[0][1]?.headers).get("Authorization")).toBe("Bearer verified-session");
    expect(fetchImpl.mock.calls[1][1]?.method).toBe("DELETE");
  });
  it("preserves both coordinates through save, restore and update HTTP contracts", async () => {
    const saved = { id: addressId, label: "Home", township: "Area", city: "City", latitude: 16.84, longitude: 96.17, isDefault: true };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(json(saved)).mockResolvedValueOnce(json([saved])).mockResolvedValueOnce(json({ ...saved, longitude: 96.18 }));
    const api = createCustomerApiClient({ baseUrl: origin, restaurantId, getAccessToken: () => "session", fetchImpl });
    const body = { label: "Home", township: "Area", city: "City", latitude: 16.84, longitude: 96.17, makeDefault: true };
    expect((await api.createAddress(body)).latitude).toBe(16.84);
    expect((await api.listAddresses())[0].longitude).toBe(96.17);
    expect((await api.updateAddress(addressId, { ...body, longitude: 96.18 })).longitude).toBe(96.18);
    expect(fetchImpl.mock.calls.map(call => new URL(String(call[0])).pathname)).toEqual(["/api/v1/customer/addresses", "/api/v1/customer/addresses", `/api/v1/customer/addresses/${addressId}`]);
    expect(JSON.parse(String(fetchImpl.mock.calls[2][1]?.body))).toMatchObject({ longitude: 96.18 });
  });
  it("keeps customer push registration and cleanup bound to the configured restaurant", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ id: addressId, platform: "ANDROID", active: true }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const options = { baseUrl: origin, restaurantId, getAccessToken: () => "customer-session", fetchImpl };
    const api = createCustomerDeviceApiClient(options);
    options.restaurantId = addressId;

    await api.registerDevice("native-fcm-token");
    await api.deactivateDevice(addressId);

    const devices = `/api/v1/customer/restaurants/${restaurantId}/devices`;
    expect(fetchImpl.mock.calls.map(call => new URL(String(call[0])).pathname)).toEqual([devices, `${devices}/${addressId}`]);
    expect(new Headers(fetchImpl.mock.calls[0][1]?.headers).get("Authorization")).toBe("Bearer customer-session");
    expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toEqual({ pushToken: "native-fcm-token", platform: "ANDROID" });
  });
  it("captures restaurant at client construction and rejects a foreign storefront response", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(json({ restaurantId: addressId }));
    const options = { baseUrl: origin, restaurantId, fetchImpl };
    const api = createPublicRestaurantApiClient(options); options.restaurantId = addressId;
    await expect(api.getPublicMenu()).rejects.toBeInstanceOf(ApiProtocolError);
    expect(new URL(String(fetchImpl.mock.calls[0][0])).pathname).toContain(restaurantId);
  });
});
