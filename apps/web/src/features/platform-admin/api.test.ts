import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/lib/api-request";
import { getPlatformOverview, getPlatformRestaurants, provisionPlatformRestaurant } from "./api";

vi.mock("@/lib/api-request", () => ({ apiRequest: vi.fn() }));

const mockedApiRequest = vi.mocked(apiRequest);

describe("platform admin API", () => {
  beforeEach(() => mockedApiRequest.mockReset());

  it("loads overview through the shared protected API helper", async () => {
    const overview = { totalRestaurants: 1, activeRestaurants: 1, inactiveRestaurants: 0, totalOrders: 3, totalRestaurantMembers: 1 };
    mockedApiRequest.mockResolvedValue(overview);

    await expect(getPlatformOverview()).resolves.toEqual(overview);
    expect(mockedApiRequest).toHaveBeenCalledWith("/api/v1/platform/overview");
  });

  it("encodes registry search and passes cancellation through the shared helper", async () => {
    const signal = new AbortController().signal;
    mockedApiRequest.mockResolvedValue({ content: [], number: 0, size: 10, totalElements: 0, totalPages: 0, first: true, last: true, empty: true });

    await getPlatformRestaurants("Yangon & tea", 2, 10, signal);

    expect(mockedApiRequest).toHaveBeenCalledWith(
      "/api/v1/platform/restaurants?search=Yangon+%26+tea&page=2&size=10",
      { signal },
    );
  });

  it("keeps the raw one-time QR token out of the dashboard provisioning result", async () => {
    mockedApiRequest.mockResolvedValue({
      ownerEmail: "owner@example.com", invitationSent: true, ownerRole: "OWNER",
      restaurant: { id: "restaurant-id", name: "Garden", slug: "garden" },
      ownerWorkspaceUrl: "https://example.test/workspace?restaurantId=restaurant-id",
      commonQrUrl: "https://example.test/?view=customer-pickup#qrToken=qr-secret",
      commonQrToken: "qr-secret",
    });
    const payload = { ownerEmail: "owner@example.com", ownerFullName: null, restaurant: {} } as never;

    const result = await provisionPlatformRestaurant(payload);

    expect(result.commonQrUrl).toContain("qrToken=qr-secret");
    expect(result).not.toHaveProperty("commonQrToken");
    expect(mockedApiRequest).toHaveBeenCalledWith("/api/v1/platform/restaurants", expect.objectContaining({ method: "POST" }));
  });
});
