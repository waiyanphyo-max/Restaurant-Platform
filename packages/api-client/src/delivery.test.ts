import { describe, expect, it, vi } from "vitest";
import { ApiConfigurationError, createRestaurantMemberApiClient } from "./index.js";

const restaurantId = "11111111-1111-4111-8111-111111111111";
const deliveryId = "22222222-2222-4222-8222-222222222222";
const driverUserId = "33333333-3333-4333-8333-333333333333";
const expectedUpdatedAt = "2026-11-04T08:04:21.325179Z";

describe("M10 delivery request contracts", () => {
  it("uses the configured restaurant and authenticated token for private detail and revision-guarded writes", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => new Response("{}", { headers: { "Content-Type": "application/json" } }));
    const api = createRestaurantMemberApiClient({
      baseUrl: "https://api.example.test", restaurantId, getAccessToken: () => "member-token", fetchImpl
    });
    await api.getMyDelivery(deliveryId);
    await api.updateDeliveryStatus(deliveryId, { status: "FAILED", note: "Tried again", failureReason: "Recipient unavailable", expectedUpdatedAt });
    await api.assignDriver(deliveryId, { driverUserId, expectedUpdatedAt });
    expect(fetchImpl.mock.calls.map(([url, init]) => [new URL(String(url)).pathname, init?.method])).toEqual([
      [`/api/v1/restaurants/${restaurantId}/deliveries/mine/${deliveryId}`, "GET"],
      [`/api/v1/restaurants/${restaurantId}/deliveries/${deliveryId}/status`, "PATCH"],
      [`/api/v1/restaurants/${restaurantId}/deliveries/${deliveryId}/assign`, "PATCH"]
    ]);
    for (const [, init] of fetchImpl.mock.calls) expect((init?.headers as Headers).get("Authorization")).toBe("Bearer member-token");
    expect(JSON.parse(String(fetchImpl.mock.calls[1][1]?.body))).toEqual({
      status: "FAILED", note: "Tried again", failureReason: "Recipient unavailable", expectedUpdatedAt
    });
    expect(JSON.parse(String(fetchImpl.mock.calls[2][1]?.body))).toEqual({ driverUserId, expectedUpdatedAt });
    expect(() => api.getMyDelivery("../other-restaurant")).toThrow(ApiConfigurationError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
