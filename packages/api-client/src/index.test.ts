import { describe, expect, it, vi } from "vitest";
import { createRestaurantApiClient, MissingAccessTokenError } from "./index.js";

const restaurantId = "11111111-1111-4111-8111-111111111111";
const ticketId = "22222222-2222-4222-8222-222222222222";

function response() {
  return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("restaurant API boundary", () => {
  it("omits bearer credentials from public QR requests and keeps the QR token in the body", async () => {
    const fetchImpl = vi.fn(async () => response());
    const getAccessToken = vi.fn(() => "supabase-user-token");
    const client = createRestaurantApiClient({
      baseUrl: "https://api.example.test",
      restaurantId,
      fetchImpl: fetchImpl as typeof fetch,
      getAccessToken
    });

    await client.createCommonQrOrder({ qrToken: "opaque-qr-token", items: [] }, "retry-key");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe(`https://api.example.test/api/v1/public/restaurants/${restaurantId}/orders/common-qr`);
    expect(url.toString()).not.toContain("opaque-qr-token");
    expect(init.headers).toMatchObject({ "Idempotency-Key": "retry-key" });
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(init.body).toContain("opaque-qr-token");
    expect(getAccessToken).not.toHaveBeenCalled();
  });

  it("sends the queue token only in its header", async () => {
    const fetchImpl = vi.fn(async () => response());
    const client = createRestaurantApiClient({ baseUrl: "https://api.example.test", restaurantId, fetchImpl: fetchImpl as typeof fetch });
    await client.getQueueStatus(ticketId, "private-queue-token");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).not.toContain("private-queue-token");
    expect(init.headers).toMatchObject({ "X-Queue-Token": "private-queue-token" });
  });

  it("requires a user token before accessing a private route", async () => {
    const fetchImpl = vi.fn(async () => response());
    const client = createRestaurantApiClient({ baseUrl: "https://api.example.test", restaurantId, fetchImpl: fetchImpl as typeof fetch });
    await expect(client.getMyRestaurants()).rejects.toBeInstanceOf(MissingAccessTokenError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects untrusted API origins", () => {
    expect(() => createRestaurantApiClient({ baseUrl: "http://api.example.test", restaurantId })).toThrow();
    expect(() => createRestaurantApiClient({ baseUrl: "https://api.example.test/other", restaurantId })).toThrow();
  });
});
